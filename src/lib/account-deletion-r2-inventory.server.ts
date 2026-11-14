import { AwsClient } from "aws4fetch";
import { XMLParser, XMLValidator } from "fast-xml-parser";
import { Buffer } from "node:buffer";
import { DeletionStepError } from "./account-deletion-worker";
import { photoSha256, readR2PhotoConfig, type R2PhotoConfig } from "./r2-photo-storage.server";
import { photoBucket, type PhotoBucket } from "./photo-storage";

export type DeletionR2Target = Readonly<{
  bucket: PhotoBucket;
  path: string;
  variant: "original" | "thumbnail";
  storeFingerprint: string;
}>;
export type DeletionR2Object = Readonly<{
  key: string;
  sha256: string;
  bytes: number;
  etag: string;
  modifiedAt: string;
}>;
const failed = () => new DeletionStepError("inventory_unavailable");
const object = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === "object" && !Array.isArray(value);
const cursorValid = (value: unknown): value is string =>
  typeof value === "string" &&
  value.length > 0 &&
  Buffer.byteLength(value) <= 4096 &&
  !/[\u0000-\u001f\u007f]/.test(value);

/** Lists every current content-hash copy under one logical photo's prefix.
 * Discovery is read-only and does not establish ownership, complete multipart
 * inventory, historical provider versions or authority to erase anything. */
export function createAccountDeletionR2Inventory(
  supplied: R2PhotoConfig,
  authorize: (target: DeletionR2Target, signal: AbortSignal) => Promise<true>,
  fetcher: typeof fetch = fetch,
) {
  let config: R2PhotoConfig;
  try {
    if (typeof authorize !== "function") throw failed();
    if (
      ![
        supplied.accountId,
        supplied.accessKeyId,
        supplied.secretAccessKey,
        supplied.buckets["listing-media"],
        supplied.buckets["ask-evidence"],
      ].every((value) => typeof value === "string")
    )
      throw failed();
    config = readR2PhotoConfig({
      BLUEBIRD_R2_ACCOUNT_ID: supplied.accountId,
      BLUEBIRD_R2_ACCESS_KEY_ID: supplied.accessKeyId,
      BLUEBIRD_R2_SECRET_ACCESS_KEY: supplied.secretAccessKey,
      BLUEBIRD_R2_LISTING_BUCKET: supplied.buckets["listing-media"],
      BLUEBIRD_R2_EVIDENCE_BUCKET: supplied.buckets["ask-evidence"],
    });
    if (
      ![config.accessKeyId, config.secretAccessKey].every(
        (value) => typeof value === "string" && value.length <= 16384 && !/[\r\n]/.test(value),
      )
    )
      throw failed();
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
  return {
    fingerprint,
    async scan(
      suppliedTarget: DeletionR2Target,
      parent: AbortSignal,
      cursor: string | null = null,
      limit = 50,
    ) {
      try {
        const target = Object.freeze({
          bucket: photoBucket(suppliedTarget.bucket),
          path: suppliedTarget.path,
          variant: suppliedTarget.variant,
          storeFingerprint: suppliedTarget.storeFingerprint,
        });
        if (
          typeof target.path !== "string" ||
          !target.path ||
          Buffer.byteLength(target.path) > 1024 ||
          target.path.includes("\u0000") ||
          !["original", "thumbnail"].includes(target.variant) ||
          (target.variant === "thumbnail" && target.bucket !== "listing-media") ||
          target.storeFingerprint !== fingerprint(target.bucket) ||
          !Number.isSafeInteger(limit) ||
          limit < 1 ||
          limit > 100 ||
          (cursor !== null && !cursorValid(cursor))
        )
          throw failed();
        const prefix = `${target.variant}/v1/${photoSha256(target.path)}/`;
        const signal = AbortSignal.any([parent, AbortSignal.timeout(15000)]);
        const authorized = async () => {
          signal.throwIfAborted();
          if ((await authorize(target, signal)) !== true) throw failed();
          signal.throwIfAborted();
        };
        await authorized();
        const url = new URL(
          `https://${config.accountId}.r2.cloudflarestorage.com/${config.buckets[target.bucket]}`,
        );
        url.searchParams.set("list-type", "2");
        url.searchParams.set("prefix", prefix);
        url.searchParams.set("encoding-type", "url");
        url.searchParams.set("max-keys", String(limit));
        if (cursor !== null) url.searchParams.set("continuation-token", cursor);
        const request = await signer.sign(url, {
          method: "GET",
          redirect: "error",
          cache: "no-store",
          signal,
        });
        signal.throwIfAborted();
        const response = await fetcher(request);
        if (
          response.status !== 200 ||
          !response.body ||
          !["application/xml", "text/xml"].includes(
            response.headers.get("content-type")?.split(";")[0]?.trim().toLowerCase() ?? "",
          )
        ) {
          await response.body?.cancel();
          throw failed();
        }
        const reader = response.body.getReader(),
          chunks: Uint8Array[] = [];
        let size = 0,
          complete = false;
        const cancel = () => {
          void reader.cancel().catch(() => undefined);
        };
        signal.addEventListener("abort", cancel, { once: true });
        let xml: string;
        try {
          while (true) {
            signal.throwIfAborted();
            const part = await reader.read();
            signal.throwIfAborted();
            if (part.done) {
              complete = true;
              break;
            }
            size += part.value.byteLength;
            if (size > 1024 * 1024) throw failed();
            chunks.push(part.value);
          }
          xml = Buffer.concat(chunks).toString("utf8");
        } finally {
          signal.removeEventListener("abort", cancel);
          if (!complete) await reader.cancel().catch(() => undefined);
          reader.releaseLock();
        }
        if (/<!DOCTYPE|<!ENTITY/i.test(xml) || XMLValidator.validate(xml) !== true) throw failed();
        const parsed: unknown = new XMLParser({
          ignoreAttributes: false,
          parseTagValue: false,
          trimValues: false,
          isArray: (_name, path) => path === "ListBucketResult.Contents",
        }).parse(xml);
        if (!object(parsed) || !object(parsed["ListBucketResult"]) || parsed["Error"] !== undefined)
          throw failed();
        const page = parsed["ListBucketResult"];
        const rows = page["Contents"] ?? [];
        if (
          page["Name"] !== config.buckets[target.bucket] ||
          page["EncodingType"] !== "url" ||
          typeof page["Prefix"] !== "string" ||
          decodeURIComponent(page["Prefix"]) !== prefix ||
          page["MaxKeys"] !== String(limit) ||
          !Array.isArray(rows) ||
          rows.length > limit ||
          page["KeyCount"] !== String(rows.length) ||
          page["CommonPrefixes"] !== undefined ||
          (page["IsTruncated"] !== "true" && page["IsTruncated"] !== "false") ||
          (page["ContinuationToken"] ?? null) !== cursor
        )
          throw failed();
        const done = page["IsTruncated"] === "false",
          next = page["NextContinuationToken"];
        if (
          (!done && (!cursorValid(next) || next === cursor || rows.length === 0)) ||
          (done && next !== undefined && next !== "")
        )
          throw failed();
        let previous = "";
        const objects = rows.map((row): DeletionR2Object => {
          if (
            !object(row) ||
            typeof row["Key"] !== "string" ||
            typeof row["Size"] !== "string" ||
            !/^(0|[1-9][0-9]{0,15})$/.test(row["Size"]) ||
            !Number.isSafeInteger(Number(row["Size"])) ||
            typeof row["ETag"] !== "string" ||
            !/^"[a-f0-9]{32}(?:-[1-9][0-9]{0,5})?"$/i.test(row["ETag"]) ||
            typeof row["LastModified"] !== "string" ||
            row["LastModified"].length > 40 ||
            !Number.isFinite(Date.parse(row["LastModified"]))
          )
            throw failed();
          const key = decodeURIComponent(row["Key"]);
          if (
            !key.startsWith(prefix) ||
            !/^[a-f0-9]{64}$/.test(key.slice(prefix.length)) ||
            key <= previous
          )
            throw failed();
          previous = key;
          return Object.freeze({
            key,
            sha256: key.slice(prefix.length),
            bytes: Number(row["Size"]),
            etag: row["ETag"],
            modifiedAt: new Date(row["LastModified"]).toISOString(),
          });
        });
        await authorized();
        return Object.freeze({
          objects: Object.freeze(objects),
          nextCursor: done ? null : (next as string),
          done,
        });
      } catch {
        throw failed();
      }
    },
  };
}
