import { createHash } from "node:crypto";
import { AwsClient } from "aws4fetch";

import type { PhotoBucket } from "./photo-storage";
import { MAX_PHOTO_BYTES, photoPath } from "./photo-storage";

export type R2PhotoConfig = {
  accountId: string;
  accessKeyId: string;
  secretAccessKey: string;
  buckets: Record<PhotoBucket, string>;
};

export function readR2PhotoConfig(env: Record<string, string | undefined>): R2PhotoConfig {
  const accountId = env["BLUEBIRD_R2_ACCOUNT_ID"] ?? "";
  const accessKeyId = env["BLUEBIRD_R2_ACCESS_KEY_ID"] ?? "";
  const secretAccessKey = env["BLUEBIRD_R2_SECRET_ACCESS_KEY"] ?? "";
  const listing = env["BLUEBIRD_R2_LISTING_BUCKET"] ?? "";
  const evidence = env["BLUEBIRD_R2_EVIDENCE_BUCKET"] ?? "";
  const validBucket = (value: string) => /^[a-z0-9][a-z0-9-]{1,61}[a-z0-9]$/.test(value);
  if (
    !/^[a-f0-9]{32}$/i.test(accountId) ||
    !accessKeyId ||
    !secretAccessKey ||
    !validBucket(listing) ||
    !validBucket(evidence) ||
    listing === evidence
  )
    throw new Error("Private photo storage configuration is incomplete.");
  return {
    accountId,
    accessKeyId,
    secretAccessKey,
    buckets: { "listing-media": listing, "ask-evidence": evidence },
  };
}

export function photoSha256(bytes: Uint8Array | string) {
  return createHash("sha256").update(bytes).digest("hex");
}

/** Only used to check an existing provider single-part ETag, never authorization. */
export function photoSourceMd5(bytes: Uint8Array) {
  return createHash("md5").update(bytes).digest("hex");
}

export function photoObjectKey(path: string, sha256: string, thumbnail = false) {
  photoPath(path);
  if (!/^[a-f0-9]{64}$/.test(sha256)) throw new Error("Invalid photo checksum.");
  return `${thumbnail ? "thumbnail" : "original"}/v1/${photoSha256(path)}/${sha256}`;
}

/** No bucket creation, public-access changes, deletion or automatic retries. */
export function createR2PhotoStore(config: R2PhotoConfig, fetcher: typeof fetch = fetch) {
  const signer = new AwsClient({
    accessKeyId: config.accessKeyId,
    secretAccessKey: config.secretAccessKey,
    region: "auto",
    service: "s3",
    retries: 0,
  });
  const endpoint = `https://${config.accountId}.r2.cloudflarestorage.com`;
  function objectUrl(bucket: PhotoBucket, key?: string) {
    const name = config.buckets[bucket];
    if (!name) throw new Error("Unsupported photo store.");
    if (key !== undefined) photoPath(key);
    return `${endpoint}/${name}${key === undefined ? "" : `/${key.split("/").map(encodeURIComponent).join("/")}`}`;
  }
  async function request(bucket: PhotoBucket, key: string | undefined, init: RequestInit = {}) {
    try {
      const signed = await signer.sign(objectUrl(bucket, key), {
        ...init,
        signal: init.signal ?? AbortSignal.timeout(15_000),
      });
      return await fetcher(signed);
    } catch {
      // A signed URL contains access material; never forward provider errors
      // or Request objects into logs or user-visible error messages.
      throw new Error("Private photo storage is temporarily unavailable.");
    }
  }
  async function signedUrl(
    bucket: PhotoBucket,
    key: string,
    expiresIn: number,
    init: RequestInit = {},
  ) {
    if (!Number.isInteger(expiresIn) || expiresIn < 60 || expiresIn > 86_400)
      throw new Error("Invalid photo link duration.");
    const url = new URL(objectUrl(bucket, key));
    url.searchParams.set("X-Amz-Expires", String(expiresIn));
    const signed = await signer.sign(url, { ...init, aws: { signQuery: true, allHeaders: true } });
    return signed;
  }
  return {
    async available(bucket: PhotoBucket) {
      const result = await request(bucket, undefined, {
        method: "HEAD",
        signal: AbortSignal.timeout(2000),
      });
      return result.ok;
    },
    async sign(bucket: PhotoBucket, key: string, expiresIn: number) {
      return (await signedUrl(bucket, key, expiresIn, { method: "GET" })).url;
    },
    async signUpload(
      bucket: PhotoBucket,
      key: string,
      bytes: number,
      contentType: string,
      sha256: string,
    ) {
      if (!Number.isSafeInteger(bytes) || bytes <= 0 || bytes > MAX_PHOTO_BYTES)
        throw new Error("Invalid photo size.");
      if (!/^[a-f0-9]{64}$/.test(sha256)) throw new Error("Invalid photo checksum.");
      const headers = {
        "content-type": contentType,
        "content-length": String(bytes),
        "x-amz-meta-sha256": sha256,
        "if-none-match": "*",
      };
      const signed = await signedUrl(bucket, key, 900, { method: "PUT", headers });
      return {
        url: signed.url,
        // Browsers set Host and Content-Length from the destination and Blob.
        // They remain signed, so changing the body length invalidates the PUT.
        headers: Object.fromEntries(
          [...signed.headers].filter(([name]) => !["host", "content-length"].includes(name)),
        ),
      };
    },
    async put(bucket: PhotoBucket, key: string, bytes: Uint8Array, contentType: string) {
      const response = await request(bucket, key, {
        method: "PUT",
        headers: {
          "content-type": contentType,
          "x-amz-meta-sha256": photoSha256(bytes),
          "cache-control": "private, max-age=3600",
          "if-none-match": "*",
        },
        body: bytes.slice().buffer as ArrayBuffer,
      });
      if (!response.ok && response.status !== 412) {
        await response.body?.cancel();
        throw new Error("A private photo could not be stored.");
      }
      await response.body?.cancel();
      // A prior immutable object (412) still needs an actual byte check.
    },
    async verify(
      bucket: PhotoBucket,
      key: string,
      expectedBytes: number,
      expectedSha256: string,
      collect = false,
    ): Promise<Uint8Array | null> {
      if (
        !Number.isSafeInteger(expectedBytes) ||
        expectedBytes <= 0 ||
        expectedBytes > MAX_PHOTO_BYTES ||
        !/^[a-f0-9]{64}$/.test(expectedSha256)
      )
        throw new Error("Invalid photo verification record.");
      const response = await request(bucket, key);
      if (!response.ok || !response.body) {
        await response.body?.cancel();
        throw new Error("Photo verification failed.");
      }
      const length = response.headers.get("content-length");
      if (length !== null && Number(length) !== expectedBytes) {
        await response.body.cancel();
        throw new Error("Photo size did not match.");
      }
      const hash = createHash("sha256");
      const reader = response.body.getReader();
      const chunks: Uint8Array[] = [];
      let count = 0;
      try {
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          count += value.byteLength;
          if (count > expectedBytes) throw new Error("Photo size did not match.");
          hash.update(value);
          if (collect) chunks.push(value);
        }
      } catch {
        await reader.cancel().catch(() => undefined);
        throw new Error("Photo verification failed.");
      } finally {
        reader.releaseLock();
      }
      if (count !== expectedBytes || hash.digest("hex") !== expectedSha256)
        throw new Error("Photo checksum did not match.");
      if (!collect) return null;
      const result = new Uint8Array(count);
      let offset = 0;
      for (const chunk of chunks) {
        result.set(chunk, offset);
        offset += chunk.byteLength;
      }
      return result;
    },
  };
}

export type R2PhotoStore = ReturnType<typeof createR2PhotoStore>;
