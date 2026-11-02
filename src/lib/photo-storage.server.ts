import type { SupabaseClient } from "@supabase/supabase-js";

import {
  createPhotoStorage,
  type PhotoReceipts,
  type PhotoSource,
} from "./photo-storage-core.server";
import {
  MAX_PHOTO_BYTES,
  PHOTO_THUMBNAIL_WIDTH,
  photoBucket,
  photoContentType,
  photoMode,
  type PhotoBucket,
  type PhotoReceipt,
} from "./photo-storage";
import { createR2PhotoStore, photoSha256, readR2PhotoConfig } from "./r2-photo-storage.server";
import { serverEnv } from "./runtime-env.server";

export function currentPhotoMode() {
  return photoMode(serverEnv("BLUEBIRD_PHOTO_STORAGE_MODE"));
}

/** Keep new source copies during read validation unless R2-only writes are explicitly enabled. */
export function currentPhotoUploadMode() {
  const readMode = currentPhotoMode();
  const explicit = serverEnv("BLUEBIRD_PHOTO_UPLOAD_MODE");
  if (explicit === "r2" && readMode === "r2") return "r2" as const;
  if (explicit === "supabase") return "supabase" as const;
  if (explicit === "mirror" || readMode !== "supabase") return "mirror" as const;
  return "supabase" as const;
}

export function photoReceiptFromRow(row: Record<string, unknown>): PhotoReceipt {
  return {
    bucket: photoBucket(String(row["bucket"])),
    path: String(row["path"]),
    key: String(row["r2_key"]),
    sha256: String(row["sha256"]),
    bytes: Number(row["byte_size"]),
    contentType: String(row["content_type"]),
    thumbnailKey: row["thumbnail_key"] as string | null,
    thumbnailSha256: row["thumbnail_sha256"] as string | null,
    thumbnailBytes: row["thumbnail_bytes"] === null ? null : Number(row["thumbnail_bytes"]),
    thumbnailContentType: row["thumbnail_content_type"] as string | null,
    sourceEtag: row["source_etag"] as string | null,
    sourceUpdatedAt: row["source_updated_at"] as string | null,
    verifiedAt: String(row["verified_at"]),
  };
}

export function photoReceiptRow(receipt: PhotoReceipt) {
  return {
    bucket: receipt.bucket,
    path: receipt.path,
    r2_key: receipt.key,
    sha256: receipt.sha256,
    byte_size: receipt.bytes,
    content_type: receipt.contentType,
    thumbnail_key: receipt.thumbnailKey,
    thumbnail_sha256: receipt.thumbnailSha256,
    thumbnail_bytes: receipt.thumbnailBytes,
    thumbnail_content_type: receipt.thumbnailContentType,
    source_etag: receipt.sourceEtag,
    source_updated_at: receipt.sourceUpdatedAt,
  };
}

export function createSupabasePhotoReceipts(db: SupabaseClient): PhotoReceipts {
  return {
    async read(bucket, paths) {
      const rows: PhotoReceipt[] = [];
      for (let start = 0; start < paths.length; start += 500) {
        const { data, error } = await db
          .from("photo_object_receipts")
          .select("*")
          .eq("bucket", bucket)
          .in("path", paths.slice(start, start + 500))
          .abortSignal(AbortSignal.timeout(3000))
          .retry(false);
        if (error) throw new Error("Photo verification records are unavailable.");
        for (const row of data ?? []) rows.push(photoReceiptFromRow(row));
      }
      return rows;
    },
    async record(receipt) {
      const { error } = await db
        .rpc("record_private_photo", { _receipt: photoReceiptRow(receipt) })
        .abortSignal(AbortSignal.timeout(5000))
        .retry(false);
      if (error) throw new Error("Photo verification could not be committed.");
    },
    async reserve(id, bytes) {
      const { error } = await db
        .rpc("reserve_private_photo_bytes", { _id: id, _bytes: bytes })
        .abortSignal(AbortSignal.timeout(5000))
        .retry(false);
      if (error) throw new Error("The photo-storage budget could not reserve this upload.");
    },
  };
}

export function createSupabasePhotoSource(db: SupabaseClient): PhotoSource {
  return {
    async sign(bucket, paths, seconds, thumbnail) {
      const urls = new Map<string, string>();
      const store = db.storage.from(bucket);
      if (thumbnail) {
        // Limit in-flight transformations; the normal card-link cache still
        // handles the Supabase-only path and avoids repeated signing.
        for (let start = 0; start < paths.length; start += 8) {
          await Promise.all(
            paths.slice(start, start + 8).map(async (path) => {
              const { data } = await store.createSignedUrl(path, seconds, {
                transform: { width: PHOTO_THUMBNAIL_WIDTH, quality: 70 },
              });
              if (data?.signedUrl) urls.set(path, data.signedUrl);
            }),
          );
        }
        paths = paths.filter((path) => !urls.has(path));
      }
      for (let start = 0; start < paths.length; start += 500) {
        const { data, error } = await store.createSignedUrls(
          paths.slice(start, start + 500),
          seconds,
        );
        if (error) throw new Error("Photo source signing failed.");
        for (const item of data ?? [])
          if (item.path && item.signedUrl) urls.set(item.path, item.signedUrl);
      }
      return urls;
    },
    async upload(bucket, path, bytes, type) {
      const { error } = await db.storage.from(bucket).upload(path, bytes, { contentType: type });
      if (error) throw new Error("A listing photo could not be uploaded.");
    },
    async info(bucket, path) {
      const { data, error } = await db.storage.from(bucket).info(path);
      if (error) {
        if ("statusCode" in error && String(error.statusCode) === "404") return null;
        throw new Error("Photo source metadata is unavailable.");
      }
      if (!data?.size || !data.contentType) throw new Error("Photo source metadata is incomplete.");
      return {
        bytes: data.size,
        etag: data.etag ?? null,
        contentType: photoContentType(data.contentType),
        updatedAt: data.lastModified ?? data.updatedAt ?? null,
      };
    },
    async download(bucket, path, maxBytes) {
      if (!Number.isSafeInteger(maxBytes) || maxBytes <= 0 || maxBytes > MAX_PHOTO_BYTES)
        throw new Error("Invalid photo download budget.");
      const { data, error } = await db.storage.from(bucket).createSignedUrl(path, 60);
      if (error || !data?.signedUrl) throw new Error("Photo source is unavailable.");
      const response = await fetch(data.signedUrl, { signal: AbortSignal.timeout(20_000) });
      if (!response.ok || !response.body) throw new Error("Photo download failed.");
      const declared = response.headers.get("content-length");
      if (declared !== null && Number(declared) > maxBytes) {
        await response.body.cancel();
        throw new Error("Photo download exceeds the approved budget.");
      }
      const reader = response.body.getReader();
      const chunks: Uint8Array[] = [];
      let size = 0;
      try {
        for (;;) {
          const part = await reader.read();
          if (part.done) break;
          size += part.value.byteLength;
          if (size > maxBytes) throw new Error("Photo download exceeds the approved budget.");
          chunks.push(part.value);
        }
      } catch {
        await reader.cancel().catch(() => undefined);
        throw new Error("Photo download did not match its approved size.");
      } finally {
        reader.releaseLock();
      }
      const bytes = new Uint8Array(size);
      let offset = 0;
      for (const part of chunks) {
        bytes.set(part, offset);
        offset += part.byteLength;
      }
      return bytes;
    },
    async copy(bucket, source, destination) {
      const existing = await this.info(bucket, destination);
      if (existing) {
        const original = await this.info(bucket, source);
        if (original && existing.bytes === original.bytes && existing.etag === original.etag)
          return;
        throw new Error("The destination photo differs; no existing photo was overwritten.");
      }
      const { error } = await db.storage.from(bucket).copy(source, destination);
      if (error) {
        // A concurrent idempotent copy may have won. Verify it instead of
        // interpreting every Storage failure as a harmless duplicate.
        const original = await this.info(bucket, source);
        const copied = await this.info(bucket, destination);
        if (
          !original ||
          !copied ||
          original.bytes !== copied.bytes ||
          original.etag !== copied.etag
        )
          throw new Error("Photo transfer is incomplete; retry claiming.");
      }
    },
  };
}

let singleton: { key: string; store: ReturnType<typeof createPhotoStorage> } | null = null;

export async function getPhotoStorage(forceR2 = false) {
  const mode = currentPhotoMode();
  const uploadMode = currentPhotoUploadMode();
  const withR2 = forceR2 || mode !== "supabase" || uploadMode !== "supabase";
  const names = [
    "BLUEBIRD_R2_ACCOUNT_ID",
    "BLUEBIRD_R2_ACCESS_KEY_ID",
    "BLUEBIRD_R2_SECRET_ACCESS_KEY",
    "BLUEBIRD_R2_LISTING_BUCKET",
    "BLUEBIRD_R2_EVIDENCE_BUCKET",
  ];
  const env = Object.fromEntries(names.map((name) => [name, serverEnv(name)]));
  const key = `${mode}:${uploadMode}:${withR2}:${photoSha256(JSON.stringify(env))}`;
  if (singleton?.key === key) return singleton.store;
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const db = supabaseAdmin as unknown as SupabaseClient;
  const store = createPhotoStorage({
    mode,
    uploadMode,
    source: createSupabasePhotoSource(db),
    receipts: createSupabasePhotoReceipts(db),
    ...(withR2 ? { r2: createR2PhotoStore(readR2PhotoConfig(env)) } : {}),
    thumbnail: async (bytes, type) =>
      (await import("./photo-thumbnail.server")).makePhotoThumbnail(bytes, type),
  });
  singleton = { key, store };
  return store;
}

export async function signPrivatePhotoUrls(
  bucket: PhotoBucket,
  paths: string[],
  seconds = 3600,
  thumbnail = false,
) {
  return (await getPhotoStorage()).sign(bucket, paths, seconds, thumbnail);
}
