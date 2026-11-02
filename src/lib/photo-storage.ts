export const PHOTO_BUCKETS = ["listing-media", "ask-evidence"] as const;
export type PhotoBucket = (typeof PHOTO_BUCKETS)[number];
export type PhotoStorageMode = "supabase" | "mirror" | "r2";
export const MAX_PHOTO_BYTES = 50 * 1024 * 1024;
export const MAX_THUMBNAIL_BYTES = 512 * 1024;
export const PHOTO_THUMBNAIL_WIDTH = 640;
export const PHOTO_THUMBNAIL_MAX_HEIGHT = 2560;

export function photoThumbnailDimensions(width: number, height: number) {
  const ratio = Math.min(1, PHOTO_THUMBNAIL_WIDTH / width, PHOTO_THUMBNAIL_MAX_HEIGHT / height);
  return {
    width: Math.max(1, Math.round(width * ratio)),
    height: Math.max(1, Math.round(height * ratio)),
  };
}

export function photoBucket(value: string): PhotoBucket {
  if (!(PHOTO_BUCKETS as readonly string[]).includes(value))
    throw new Error("Unsupported photo store.");
  return value as PhotoBucket;
}

export function photoPath(value: string): string {
  if (
    typeof value !== "string" ||
    !value ||
    new TextEncoder().encode(value).byteLength > 1024 ||
    value.includes("\\") ||
    [...value].some(
      (character) => character.charCodeAt(0) < 32 || character.charCodeAt(0) === 127,
    ) ||
    value.split("/").some((part) => !part || part === "." || part === "..")
  )
    throw new Error("Invalid photo path.");
  return value;
}

export function photoMode(value: string | undefined): PhotoStorageMode {
  return value === "mirror" || value === "r2" ? value : "supabase";
}

export function photoContentType(value: string): string {
  const type = String(value).split(";")[0].trim().toLowerCase();
  if (!/^image\/[a-z0-9.+-]+$/.test(type)) throw new Error("A photo must be an image.");
  return type === "image/jpg" ? "image/jpeg" : type;
}

export type PhotoThumbnail = {
  bytes: Uint8Array;
  contentType: string;
  width: number | null;
  height: number | null;
};

export type PhotoReceipt = {
  bucket: PhotoBucket;
  path: string;
  key: string;
  sha256: string;
  bytes: number;
  contentType: string;
  thumbnailKey: string | null;
  thumbnailSha256: string | null;
  thumbnailBytes: number | null;
  thumbnailContentType: string | null;
  sourceEtag: string | null;
  sourceUpdatedAt: string | null;
  verifiedAt: string;
};

export type PhotoSourceMetadata = {
  bytes: number;
  etag: string | null;
  contentType: string;
  updatedAt: string | null;
};

export function canonicalPhotoEtag(value: string | null | undefined) {
  return value?.trim().replace(/^"|"$/g, "") || null;
}

export function samePhotoSource(a: PhotoSourceMetadata, b: PhotoSourceMetadata) {
  return (
    a.bytes === b.bytes &&
    a.contentType === b.contentType &&
    canonicalPhotoEtag(a.etag) !== null &&
    canonicalPhotoEtag(a.etag) === canonicalPhotoEtag(b.etag) &&
    (a.updatedAt === b.updatedAt ||
      (a.updatedAt !== null &&
        b.updatedAt !== null &&
        Date.parse(a.updatedAt) === Date.parse(b.updatedAt)))
  );
}
