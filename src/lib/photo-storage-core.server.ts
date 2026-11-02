import { Buffer } from "node:buffer";
import {
  MAX_PHOTO_BYTES,
  canonicalPhotoEtag,
  photoBucket,
  photoContentType,
  photoPath,
  samePhotoSource,
  type PhotoBucket,
  type PhotoReceipt,
  type PhotoSourceMetadata,
  type PhotoStorageMode,
  type PhotoThumbnail,
} from "./photo-storage";
import {
  photoObjectKey,
  photoSha256,
  photoSourceMd5,
  type R2PhotoStore,
} from "./r2-photo-storage.server";

export type PhotoSource = {
  sign(
    bucket: PhotoBucket,
    paths: string[],
    seconds: number,
    thumbnail: boolean,
  ): Promise<Map<string, string>>;
  upload(bucket: PhotoBucket, path: string, bytes: Uint8Array, type: string): Promise<void>;
  info(bucket: PhotoBucket, path: string): Promise<PhotoSourceMetadata | null>;
  download(bucket: PhotoBucket, path: string, maxBytes: number): Promise<Uint8Array>;
  copy(bucket: PhotoBucket, source: string, destination: string): Promise<void>;
};
export type PhotoReceipts = {
  read(bucket: PhotoBucket, paths: string[]): Promise<PhotoReceipt[]>;
  record(receipt: PhotoReceipt): Promise<void>;
  reserve(id: string, bytes: number): Promise<void>;
};

/** Settle the whole pair before returning an error so no writes outlive its lease. */
async function settlePhotoOperations<T>(operations: Promise<T>[]): Promise<T[]> {
  const results = await Promise.allSettled(operations);
  const values: T[] = [];
  let failure: PromiseRejectedResult | undefined;
  for (const result of results) {
    if (result.status === "fulfilled") values.push(result.value);
    else failure ??= result;
  }
  if (failure) throw failure.reason;
  return values;
}

export function createPhotoStorage(deps: {
  mode: PhotoStorageMode;
  uploadMode?: PhotoStorageMode;
  sourceFallbackExpiresAt?: number | null;
  source: PhotoSource;
  receipts: PhotoReceipts;
  r2?: R2PhotoStore;
  thumbnail(bytes: Uint8Array, type: string): Promise<PhotoThumbnail>;
  now?: () => number;
  warn?: (message: string) => void;
}) {
  const now = deps.now ?? Date.now;
  const uploadMode = deps.uploadMode ?? deps.mode;
  const warn = deps.warn ?? ((message: string) => console.warn(message));
  const health = new Map<PhotoBucket, { until: number; check: Promise<boolean> }>();
  const objects = new Map<string, { until: number; check: Promise<boolean> }>();
  const r2 = () => {
    if (!deps.r2) throw new Error("Private photo storage is not configured.");
    return deps.r2;
  };
  async function available(bucket: PhotoBucket) {
    const cached = health.get(bucket);
    if (cached && cached.until > now()) return cached.check;
    const check = r2()
      .available(bucket)
      .catch(() => false);
    health.set(bucket, { until: now() + 30_000, check });
    return check;
  }
  async function objectAvailable(bucket: PhotoBucket, key: string, bytes: number, sha256: string) {
    const id = JSON.stringify([bucket, key, bytes, sha256]);
    const cached = objects.get(id);
    if (cached && cached.until > now()) return cached.check;
    const check = r2()
      .matches(bucket, key, bytes, sha256)
      .catch(() => false);
    // Coalesce concurrent reads without retaining unbounded inventory in a worker.
    objects.delete(id);
    if (objects.size >= 2048) objects.delete(objects.keys().next().value!);
    objects.set(id, { until: now() + 30_000, check });
    return check;
  }
  async function sourceSign(
    bucket: PhotoBucket,
    paths: string[],
    seconds: number,
    thumbnail: boolean,
  ) {
    if (!paths.length) return new Map<string, string>();
    const cutoff = deps.mode === "r2" ? (deps.sourceFallbackExpiresAt ?? null) : null;
    if (cutoff !== null) {
      if (!Number.isFinite(cutoff)) return new Map<string, string>();
      seconds = Math.min(Math.floor(seconds), Math.floor((cutoff - now()) / 1000));
      if (!Number.isSafeInteger(seconds) || seconds < 1) return new Map<string, string>();
    }
    try {
      const signed = await deps.source.sign(bucket, paths, seconds, thumbnail);
      if (cutoff === null) return signed;
      // Supabase signs with its own clock after the request arrives. Inspect
      // actual expiry so latency/clock skew cannot extend the fallback window.
      // These URLs come only from the trusted source signer; this is an expiry
      // guard, not a replacement for source authentication/signature checking.
      return new Map(
        [...signed].filter(([, url]) => {
          try {
            const token = new URL(url).searchParams.get("token")?.split(".");
            if (!token || token.length !== 3 || token[1].length > 8192) return false;
            const expires = JSON.parse(Buffer.from(token[1], "base64url").toString("utf8")).exp;
            return (
              Number.isSafeInteger(expires) && expires * 1000 <= cutoff && expires * 1000 > now()
            );
          } catch {
            return false;
          }
        }),
      );
    } catch {
      warn("Photo source signing is temporarily unavailable.");
      return new Map<string, string>();
    }
  }
  async function signed(bucket: PhotoBucket, paths: string[], seconds = 3600, thumbnail = false) {
    photoBucket(bucket);
    const unique = [...new Set(paths)].filter((path) => {
      try {
        photoPath(path);
        return true;
      } catch {
        return false;
      }
    });
    if (!unique.length) return new Map<string, string>();
    if (deps.mode !== "r2") return sourceSign(bucket, unique, seconds, thumbnail);
    const urls = new Map<string, string>();
    try {
      const [records, healthy] = await Promise.all([
        deps.receipts.read(bucket, unique),
        available(bucket),
      ]);
      if (healthy) {
        await Promise.all(
          records.map(async (record) => {
            if (record.bucket !== bucket || !unique.includes(record.path) || !record.verifiedAt)
              return;
            const key = thumbnail ? record.thumbnailKey : record.key;
            const bytes = thumbnail ? record.thumbnailBytes : record.bytes;
            const sha256 = thumbnail ? record.thumbnailSha256 : record.sha256;
            if (!key || !bytes || !sha256) return;
            // Bucket health alone cannot detect a missing or altered individual photo.
            // HEAD checks metadata only; full bytes were verified before the receipt.
            if (!(await objectAvailable(bucket, key, bytes, sha256))) return;
            try {
              urls.set(record.path, await r2().sign(bucket, key, seconds));
            } catch {
              // Fall back per object, preserving other successfully signed photos.
            }
          }),
        );
      }
    } catch {
      warn("Private photo links are using the retained source.");
    }
    const missing = unique.filter((path) => !urls.has(path));
    for (const [path, url] of await sourceSign(bucket, missing, seconds, thumbnail))
      urls.set(path, url);
    return urls;
  }
  async function verifiedWrite(
    bucket: PhotoBucket,
    path: string,
    bytes: Uint8Array,
    contentType: string,
    thumbnail: PhotoThumbnail | null,
    source: PhotoSourceMetadata | null,
  ) {
    const sha256 = photoSha256(bytes);
    const key = photoObjectKey(path, sha256);
    const thumbHash = thumbnail ? photoSha256(thumbnail.bytes) : null;
    const thumbKey = thumbHash ? photoObjectKey(path, thumbHash, true) : null;
    await deps.receipts.reserve(
      photoSha256(`${bucket}/${path}/${sha256}`),
      bytes.byteLength + (thumbnail?.bytes.byteLength ?? 0),
    );
    await r2().put(bucket, key, bytes, contentType);
    await r2().verify(bucket, key, bytes.byteLength, sha256);
    if (thumbnail && thumbKey && thumbHash) {
      await r2().put(bucket, thumbKey, thumbnail.bytes, thumbnail.contentType);
      await r2().verify(bucket, thumbKey, thumbnail.bytes.byteLength, thumbHash);
    }
    const receipt: PhotoReceipt = {
      bucket,
      path,
      key,
      sha256,
      bytes: bytes.byteLength,
      contentType,
      thumbnailKey: thumbKey,
      thumbnailSha256: thumbHash,
      thumbnailBytes: thumbnail?.bytes.byteLength ?? null,
      thumbnailContentType: thumbnail?.contentType ?? null,
      sourceEtag: source?.etag ?? null,
      sourceUpdatedAt: source?.updatedAt ?? null,
      verifiedAt: new Date(now()).toISOString(),
    };
    // Visibility is committed only after both objects pass byte verification.
    await deps.receipts.record(receipt);
    return receipt;
  }
  async function upload(
    path: string,
    bytes: Uint8Array,
    type: string,
    evidence = true,
    preparedThumbnail?: PhotoThumbnail,
  ) {
    photoPath(path);
    const contentType = photoContentType(type);
    if (!bytes.byteLength || bytes.byteLength > MAX_PHOTO_BYTES)
      throw new Error("Invalid photo size.");
    const buckets: PhotoBucket[] = evidence ? ["ask-evidence", "listing-media"] : ["listing-media"];
    if (uploadMode !== "r2")
      for (const bucket of buckets) await deps.source.upload(bucket, path, bytes, contentType);
    if (uploadMode === "supabase") return;
    try {
      const thumbnail = preparedThumbnail ?? (await deps.thumbnail(bytes, contentType));
      for (const bucket of buckets) {
        const source = uploadMode === "mirror" ? await deps.source.info(bucket, path) : null;
        await verifiedWrite(
          bucket,
          path,
          bytes,
          contentType,
          bucket === "listing-media" ? thumbnail : null,
          source,
        );
      }
    } catch (error) {
      if (uploadMode === "r2") throw error;
      warn("Photo mirror is incomplete; the retained source remains authoritative.");
    }
  }
  async function copy(bucket: PhotoBucket, oldPath: string, newPath: string) {
    photoBucket(bucket);
    photoPath(oldPath);
    photoPath(newPath);
    if (oldPath === newPath) return;
    if (uploadMode !== "r2") await deps.source.copy(bucket, oldPath, newPath);
    if (uploadMode === "supabase") return;
    try {
      const [source] = await deps.receipts.read(bucket, [oldPath]);
      if (!source?.verifiedAt) {
        // Legacy objects without receipts continue through their original store.
        if (uploadMode === "r2") await deps.source.copy(bucket, oldPath, newPath);
        return;
      }
      if (source.bucket !== bucket || source.path !== oldPath)
        throw new Error("Seller photo verification does not match its source.");
      // Reuse immutable, verified bytes within the same private bucket. The
      // caller's seller-claim manifest still controls the new logical path.
      await deps.receipts.record({
        ...source,
        path: newPath,
        sourceEtag: null,
        sourceUpdatedAt: null,
        verifiedAt: new Date(now()).toISOString(),
      });
    } catch (error) {
      if (uploadMode === "r2") throw error;
      warn("Photo mirror transfer is incomplete; the retained source copy is available.");
    }
  }
  async function migrate(
    entries: { bucket: PhotoBucket; path: string; expected: PhotoSourceMetadata }[],
    maxDownloadBytes: number,
    preparedThumbnail?: PhotoThumbnail,
    reserveSourceDownload?: (bytes: number) => Promise<void>,
    preparedSourceBytes?: Uint8Array,
  ) {
    if (!deps.r2) throw new Error("Private photo storage is not configured.");
    if (!Number.isSafeInteger(maxDownloadBytes) || maxDownloadBytes <= 0)
      throw new Error("Invalid approved download budget.");
    if (!entries.length || entries.length > 2) throw new Error("Migrate one photo pair at a time.");
    for (const entry of entries) {
      photoBucket(entry.bucket);
      photoPath(entry.path);
    }
    if (
      entries.length === 2 &&
      (entries[0].path !== entries[1].path ||
        entries[0].bucket === entries[1].bucket ||
        entries[0].expected.bytes !== entries[1].expected.bytes ||
        entries[0].expected.contentType !== entries[1].expected.contentType ||
        !canonicalPhotoEtag(entries[0].expected.etag) ||
        canonicalPhotoEtag(entries[0].expected.etag) !==
          canonicalPhotoEtag(entries[1].expected.etag))
    )
      throw new Error("Photo pair metadata changed; review the transfer budget.");
    const first = entries.find((entry) => entry.bucket === "listing-media") ?? entries[0];
    const etag = canonicalPhotoEtag(first.expected.etag);
    if (entries.length === 2 && (!etag || !/^[a-f0-9]{32}$/i.test(etag)))
      throw new Error("Paired migration requires verified single-part source ETags.");
    if (first.expected.bytes > maxDownloadBytes || first.expected.bytes > MAX_PHOTO_BYTES)
      throw new Error("Photo exceeds the approved download budget.");
    // Check both stores before consuming source-photo egress.
    await settlePhotoOperations(
      entries.map(async (entry) => {
        const actual = await deps.source.info(entry.bucket, entry.path);
        if (!actual || !samePhotoSource(actual, entry.expected))
          throw new Error("Source photo changed; rebuild the migration plan.");
      }),
    );
    const complete = new Map<PhotoBucket, PhotoReceipt>();
    const saved = await settlePhotoOperations(
      entries.map((entry) => deps.receipts.read(entry.bucket, [entry.path])),
    );
    const verified = await settlePhotoOperations(
      entries.map(async (entry, index) => {
        const [receipt] = saved[index];
        if (!receipt?.verifiedAt) return null;
        if (
          receipt.bucket !== entry.bucket ||
          receipt.path !== entry.path ||
          !samePhotoSource(
            {
              bytes: receipt.bytes,
              contentType: receipt.contentType,
              etag: receipt.sourceEtag,
              updatedAt: receipt.sourceUpdatedAt,
            },
            entry.expected,
          )
        )
          throw new Error("Saved migration receipt differs; review before resuming.");
        if (
          entry.bucket === "listing-media" &&
          (!receipt.thumbnailKey || !receipt.thumbnailBytes || !receipt.thumbnailSha256)
        )
          throw new Error("Saved photo preview is incomplete.");
        const checks = [r2().verify(entry.bucket, receipt.key, receipt.bytes, receipt.sha256)];
        if (entry.bucket === "listing-media") {
          checks.push(
            r2().verify(
              entry.bucket,
              receipt.thumbnailKey!,
              receipt.thumbnailBytes!,
              receipt.thumbnailSha256!,
            ),
          );
        }
        await settlePhotoOperations(checks);
        return receipt;
      }),
    );
    for (const receipt of verified) if (receipt) complete.set(receipt.bucket, receipt);
    if (complete.size === entries.length)
      return { downloadedBytes: 0, receipts: entries.map((entry) => complete.get(entry.bucket)!) };
    await reserveSourceDownload?.(first.expected.bytes);
    const bytes =
      preparedSourceBytes ??
      (await deps.source.download(first.bucket, first.path, first.expected.bytes));
    if (bytes.byteLength !== first.expected.bytes) throw new Error("Source photo size changed.");
    // Pairing is limited to ordinary single-part MD5 ETags and requires an
    // actual MD5 check; multipart/opaque ETags cannot justify one download.
    if (etag && /^[a-f0-9]{32}$/i.test(etag) && photoSourceMd5(bytes) !== etag.toLowerCase())
      throw new Error("Source photo bytes did not match their ETag.");
    const thumbnail =
      preparedThumbnail ?? (await deps.thumbnail(bytes, first.expected.contentType));
    for (const entry of entries) {
      const prior = complete.get(entry.bucket);
      if (prior && prior.sha256 !== photoSha256(bytes))
        throw new Error("Copied photo differs from its receipt.");
    }
    // Recheck both sources before starting either target write.
    await settlePhotoOperations(
      entries.map(async (entry) => {
        if (complete.has(entry.bucket)) return;
        const current = await deps.source.info(entry.bucket, entry.path);
        if (!current || !samePhotoSource(current, entry.expected))
          throw new Error("Source photo changed during copying.");
      }),
    );
    const receipts = await settlePhotoOperations(
      entries.map((entry) => {
        const prior = complete.get(entry.bucket);
        return prior
          ? Promise.resolve(prior)
          : verifiedWrite(
              entry.bucket,
              entry.path,
              bytes,
              entry.expected.contentType,
              entry.bucket === "listing-media" ? thumbnail : null,
              entry.expected,
            );
      }),
    );
    return { downloadedBytes: bytes.byteLength, receipts };
  }
  return { mode: deps.mode, sign: signed, upload, copy, migrate, available };
}
