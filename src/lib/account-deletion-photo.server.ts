import { AwsClient } from "aws4fetch";
import { DeletionStepError } from "./account-deletion-worker";
import {
  MAX_PHOTO_BYTES,
  MAX_THUMBNAIL_BYTES,
  photoBucket,
  type PhotoBucket,
} from "./photo-storage";
import {
  photoObjectKey,
  photoSha256,
  readR2PhotoConfig,
  type R2PhotoConfig,
} from "./r2-photo-storage.server";

export type DeletionPhotoTarget = Readonly<{
  bucket: PhotoBucket;
  path: string;
  variant: "original" | "thumbnail";
  sha256: string;
  bytes: number;
  storeFingerprint: string;
}>;
export type AuthorizePhotoErasure = (
  target: DeletionPhotoTarget,
  signal: AbortSignal,
) => Promise<true>;

const marker = "x-amz-meta-bluebird-erasure";
const failed = () => new DeletionStepError("media_unavailable");

/** Background transport only. Authorization must recheck the live job lease,
 * private inventory, exclusive ownership and writer suppression. Never bind
 * this factory to a member-facing photo or account-request route. */
export function createAccountDeletionPhotoEraser(
  suppliedConfig: R2PhotoConfig,
  authorize: AuthorizePhotoErasure,
  fetcher: typeof fetch = fetch,
) {
  if (typeof authorize !== "function") throw failed();
  // Validate and copy configuration; an environment/caller change cannot retarget
  // an operation that is already using its inventory's planned store fingerprint.
  let config: R2PhotoConfig;
  try {
    const values = {
      BLUEBIRD_R2_ACCOUNT_ID: suppliedConfig.accountId,
      BLUEBIRD_R2_ACCESS_KEY_ID: suppliedConfig.accessKeyId,
      BLUEBIRD_R2_SECRET_ACCESS_KEY: suppliedConfig.secretAccessKey,
      BLUEBIRD_R2_LISTING_BUCKET: suppliedConfig.buckets["listing-media"],
      BLUEBIRD_R2_EVIDENCE_BUCKET: suppliedConfig.buckets["ask-evidence"],
    };
    if (!Object.values(values).every((value) => typeof value === "string")) throw failed();
    config = readR2PhotoConfig(values);
  } catch {
    throw failed();
  }
  const signer = new AwsClient({
    accessKeyId: config.accessKeyId,
    secretAccessKey: config.secretAccessKey,
    region: "auto",
    service: "s3",
    retries: 0,
  });
  const fingerprint = (bucket: PhotoBucket) =>
    photoSha256(
      JSON.stringify(["photo-erasure-v1", config.accountId, config.buckets[photoBucket(bucket)]]),
    );
  async function authorized(target: DeletionPhotoTarget, signal: AbortSignal) {
    signal.throwIfAborted();
    if ((await authorize(target, signal)) !== true) throw failed();
    signal.throwIfAborted();
  }

  async function request(
    bucket: PhotoBucket,
    key: string | null,
    signal: AbortSignal,
    init: RequestInit,
  ) {
    const deadline = AbortSignal.any([signal, AbortSignal.timeout(15_000)]);
    deadline.throwIfAborted();
    const url = `https://${config.accountId}.r2.cloudflarestorage.com/${config.buckets[bucket]}${key === null ? "" : `/${key}`}`;
    const signed = await signer.sign(url, {
      ...init,
      signal: deadline,
      redirect: "error",
      aws: { allHeaders: true },
    });
    deadline.throwIfAborted();
    const response = await fetcher(signed);
    if (deadline.aborted) {
      await response.body?.cancel().catch(() => undefined);
      deadline.throwIfAborted();
    }
    return response;
  }
  async function head(bucket: PhotoBucket, key: string | null, signal: AbortSignal) {
    const response = await request(bucket, key, signal, { method: "HEAD" });
    await response.body?.cancel();
    return response;
  }
  const isErased = (response: Response) =>
    response.status === 200 &&
    response.headers.get("content-length") === "0" &&
    response.headers.get(marker) === "v1" &&
    response.headers.get("cache-control") === "no-store" &&
    response.headers.get("content-type") === "application/octet-stream" &&
    !response.headers.has("content-disposition") &&
    !response.headers.has("content-encoding") &&
    [...response.headers.keys()].every((key) => !key.startsWith("x-amz-meta-") || key === marker);

  return {
    fingerprint,
    async erase(suppliedTarget: DeletionPhotoTarget, signal: AbortSignal) {
      try {
        // Do not let asynchronous authorization/provider callbacks mutate scope.
        const target = Object.freeze({
          bucket: photoBucket(suppliedTarget.bucket),
          path: suppliedTarget.path,
          variant: suppliedTarget.variant,
          sha256: suppliedTarget.sha256,
          bytes: suppliedTarget.bytes,
          storeFingerprint: suppliedTarget.storeFingerprint,
        });
        if (
          !["original", "thumbnail"].includes(target.variant) ||
          typeof target.sha256 !== "string" ||
          (target.variant === "thumbnail" && target.bucket !== "listing-media") ||
          !Number.isSafeInteger(target.bytes) ||
          target.bytes <= 0 ||
          target.bytes > (target.variant === "thumbnail" ? MAX_THUMBNAIL_BYTES : MAX_PHOTO_BYTES) ||
          target.storeFingerprint !== fingerprint(target.bucket)
        )
          throw failed();
        const key = photoObjectKey(target.path, target.sha256, target.variant === "thumbnail");
        await authorized(target, signal);
        const before = await head(target.bucket, key, signal);
        if (!isErased(before)) {
          const headers = new Headers({
            "content-type": "application/octet-stream",
            "content-length": "0",
            "cache-control": "no-store",
            [marker]: "v1",
          });
          if (before.status === 404) {
            // A missing/misconfigured bucket is not proof of a missing photo.
            if ((await head(target.bucket, null, signal)).status !== 200) throw failed();
            headers.set("if-none-match", "*");
          } else {
            const etag = before.headers.get("etag");
            if (
              before.status !== 200 ||
              before.headers.get("content-length") !== String(target.bytes) ||
              before.headers.get("x-amz-meta-sha256") !== target.sha256 ||
              !etag ||
              !/^"[a-f0-9]{32}(?:-[1-9][0-9]{0,5})?"$/i.test(etag)
            )
              throw failed();
            headers.set("if-match", etag);
          }
          await authorized(target, signal);
          // An empty fence without original metadata erases the bytes while keeping old
          // immutable upload URLs from recreating them. R2 documents atomic
          // conditional PUTs; conditional DELETE is not assumed to be supported.
          const written = await request(target.bucket, key, signal, {
            method: "PUT",
            headers,
            body: new Uint8Array(0).buffer,
          });
          await written.body?.cancel();
          if (written.status !== 200) throw failed();
          if (!isErased(await head(target.bucket, key, signal))) throw failed();
        }
        await authorized(target, signal);
        // This deliberately does not claim object absence or whole-account erasure.
        return { contentErased: true as const, fenceRetained: true as const };
      } catch {
        // Never retain signed requests, provider response bodies, paths or identities.
        throw failed();
      }
    },
  };
}
