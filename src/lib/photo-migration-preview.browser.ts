import {
  MAX_PREPARED_MIGRATION_SOURCE_BYTES,
  type PreparedMigrationPreview,
} from "./photo-migration.ts";

function base64(bytes: Uint8Array) {
  const chunks: string[] = [];
  for (let offset = 0; offset < bytes.length; offset += 0x8000)
    chunks.push(String.fromCharCode(...bytes.subarray(offset, offset + 0x8000)));
  return btoa(chunks.join(""));
}
import { MAX_PHOTO_BYTES, MAX_THUMBNAIL_BYTES } from "./photo-storage.ts";
import { browserPhotoThumbnail } from "./photo-thumbnail.browser.ts";

export type MigrationPreviewSource = {
  ordinal: number;
  sourceEtag: string;
  bytes: number;
  contentType: string;
  url: string;
};

/** One explicitly reserved source GET, no automatic retries or persistence. */
export async function prepareMigrationPreview(
  source: MigrationPreviewSource,
  deps = {
    fetch: (input: RequestInfo | URL, init?: RequestInit) => fetch(input, init),
    thumbnail: browserPhotoThumbnail,
  },
): Promise<PreparedMigrationPreview> {
  if (!Number.isSafeInteger(source.bytes) || source.bytes < 1 || source.bytes > MAX_PHOTO_BYTES)
    throw new Error("Invalid preview source size.");
  const response = await deps.fetch(source.url, {
    credentials: "omit",
    referrerPolicy: "no-referrer",
    cache: "no-store",
    signal: AbortSignal.timeout(20_000),
  });
  if (!response.ok || !response.body) throw new Error("Preview source could not be read.");
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    for (;;) {
      const part = await reader.read();
      if (part.done) break;
      size += part.value.byteLength;
      if (size > source.bytes) throw new Error("Preview source exceeds its reserved size.");
      chunks.push(part.value);
    }
    if (size !== source.bytes) throw new Error("Preview source size changed.");
  } catch (error) {
    await reader.cancel().catch(() => undefined);
    throw error;
  } finally {
    reader.releaseLock();
  }
  const blob = new Blob(chunks as BlobPart[], { type: source.contentType });
  const preview = await deps.thumbnail(blob);
  if (
    !preview.size ||
    preview.size > MAX_THUMBNAIL_BYTES ||
    !["image/jpeg", "image/webp", "image/png"].includes(preview.type)
  )
    throw new Error("Prepared preview is invalid or too large.");
  const bytes = new Uint8Array(await preview.arrayBuffer());
  return {
    ordinal: source.ordinal,
    sourceEtag: source.sourceEtag,
    contentType: preview.type as PreparedMigrationPreview["contentType"],
    base64: base64(bytes),
    ...(blob.size <= MAX_PREPARED_MIGRATION_SOURCE_BYTES
      ? { sourceBase64: base64(new Uint8Array(await blob.arrayBuffer())) }
      : {}),
  };
}
