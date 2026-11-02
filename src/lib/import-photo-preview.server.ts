import { Buffer } from "node:buffer";
import {
  MAX_IMPORT_PHOTO_BYTES,
  MAX_IMPORT_PREVIEW_BYTES,
  type PreparedImportPhoto,
  type ImportPhotoPreviewSource,
} from "./import-photo-preview";
import { makePhotoThumbnail } from "./photo-thumbnail.server";
import { photoSha256 } from "./r2-photo-storage.server";
import type { PhotoThumbnail } from "./photo-storage";
import type { createPhotoStorage } from "./photo-storage-core.server";

export function importPhotoUrl(value: string) {
  const url = new URL(value);
  const permitted = ["fbcdn.net", "ksldigital.com", "vinted.net", "whatnot.com", "sandhills.com"];
  if (
    url.protocol !== "https:" ||
    url.username ||
    url.password ||
    url.port ||
    !permitted.some((host) => url.hostname === host || url.hostname.endsWith(`.${host}`))
  )
    throw new Error("Unsupported source photo host.");
  return url.href;
}

type Original = { bytes: Uint8Array; contentType: string; sourceSha256: string };
/** Bounded public-CDN reads; redirects cannot escape the existing import hosts. */
export async function readImportPhoto(
  value: string,
  fetcher: typeof fetch = fetch,
): Promise<Original> {
  let url = importPhotoUrl(value);
  const signal = AbortSignal.timeout(20_000);
  for (let redirects = 0; redirects <= 3; redirects++) {
    const response = await fetcher(url, { redirect: "manual", signal, credentials: "omit" });
    if ([301, 302, 303, 307, 308].includes(response.status)) {
      await response.body?.cancel();
      const location = response.headers.get("location");
      if (!location || redirects === 3)
        throw new Error("Source photo redirect could not be followed.");
      url = importPhotoUrl(new URL(location, url).href);
      continue;
    }
    if (!response.ok || !response.body) throw new Error("Source photo could not be read.");
    const contentType = response.headers.get("content-type")?.split(";")[0]?.trim() || "image/jpeg";
    const declared = Number(response.headers.get("content-length"));
    if (!/^image\/[a-z0-9.+-]+$/i.test(contentType) || declared > MAX_IMPORT_PHOTO_BYTES) {
      await response.body.cancel();
      throw new Error("Source photo type or size is invalid.");
    }
    const reader = response.body.getReader();
    const chunks: Uint8Array[] = [];
    let size = 0;
    try {
      for (;;) {
        const part = await reader.read();
        if (part.done) break;
        size += part.value.byteLength;
        if (size > MAX_IMPORT_PHOTO_BYTES) throw new Error("Source photo exceeds 12 MB.");
        chunks.push(part.value);
      }
      if (!size) throw new Error("Source photo is empty.");
    } catch (error) {
      await reader.cancel().catch(() => undefined);
      throw error;
    } finally {
      reader.releaseLock();
    }
    const bytes = new Uint8Array(size);
    let offset = 0;
    for (const chunk of chunks) {
      bytes.set(chunk, offset);
      offset += chunk.byteLength;
    }
    return { bytes, contentType, sourceSha256: photoSha256(bytes) };
  }
  throw new Error("Source photo redirect could not be followed.");
}

export class ImportPhotoPreviewRequired extends Error {
  constructor(
    readonly prepared: PreparedImportPhoto[],
    readonly sources: ImportPhotoPreviewSource[],
    readonly allSources: ImportPhotoPreviewSource[] = sources,
  ) {
    super("Browser photo previews are required.");
  }
}
function encodePreview(url: string, sha256: string, preview: PhotoThumbnail): PreparedImportPhoto {
  if (
    !["image/jpeg", "image/png", "image/webp", "image/svg+xml"].includes(preview.contentType) ||
    !preview.bytes.length ||
    preview.bytes.length > MAX_IMPORT_PREVIEW_BYTES
  )
    throw new Error("Prepared import preview is invalid.");
  return {
    url,
    sourceSha256: sha256,
    contentType: preview.contentType as PreparedImportPhoto["contentType"],
    base64: Buffer.from(preview.bytes).toString("base64"),
  };
}

/** Sequential bounded bodies; discover every preview need before writing. */
export async function stageImportedPhotos(
  batchId: string,
  urls: string[],
  supplied: PreparedImportPhoto[],
  store: Pick<ReturnType<typeof createPhotoStorage>, "upload">,
  deps = { read: readImportPhoto, thumbnail: makePhotoThumbnail, uuid: () => crypto.randomUUID() },
) {
  if (urls.length > 8 || new Set(urls).size !== urls.length)
    throw new Error("Invalid source photo set.");
  const incoming = new Map<string, PreparedImportPhoto>();
  const ready = new Map<
    string,
    { original: ImportPhotoPreviewSource; thumbnail: PhotoThumbnail }
  >();
  for (const value of supplied) {
    if (
      !urls.includes(value.url) ||
      incoming.has(value.url) ||
      !/^[a-f0-9]{64}$/.test(value.sourceSha256) ||
      !["image/jpeg", "image/png", "image/webp", "image/svg+xml"].includes(value.contentType) ||
      !/^[A-Za-z0-9+/]+={0,2}$/.test(value.base64) ||
      value.base64.length > 4 * Math.ceil(MAX_IMPORT_PREVIEW_BYTES / 3)
    )
      throw new Error("Prepared import preview does not match this photo set.");
    incoming.set(value.url, value);
  }
  const needed: ImportPhotoPreviewSource[] = [];
  const allSources: ImportPhotoPreviewSource[] = [];
  let last: { url: string; original: Original } | undefined;
  for (const url of urls) {
    importPhotoUrl(url);
    const original = await deps.read(url);
    last = { url, original };
    const source = {
      url,
      sourceSha256: original.sourceSha256,
      bytes: original.bytes.length,
      contentType: original.contentType,
    };
    allSources.push(source);
    const provided = incoming.get(url);
    let thumbnail: PhotoThumbnail;
    if (provided) {
      if (provided.sourceSha256 !== source.sourceSha256)
        throw new Error("Source photo changed during preparation.");
      const bytes = new Uint8Array(Buffer.from(provided.base64, "base64"));
      if (!bytes.length || bytes.length > MAX_IMPORT_PREVIEW_BYTES)
        throw new Error("Prepared import preview exceeds its size limit.");
      thumbnail = await deps.thumbnail(bytes, provided.contentType);
    } else {
      try {
        thumbnail = await deps.thumbnail(original.bytes, original.contentType);
      } catch {
        // Only decoder work is offloaded. Failed source reads and changed
        // checksums escape normally and never cause an automatic stage retry.
        needed.push(source);
        continue;
      }
    }
    encodePreview(url, source.sourceSha256, thumbnail);
    ready.set(url, { original: source, thumbnail });
  }
  if (needed.length)
    throw new ImportPhotoPreviewRequired(
      [...ready].map(([url, value]) =>
        encodePreview(url, value.original.sourceSha256, value.thumbnail),
      ),
      needed,
      allSources,
    );
  const paths: string[] = [];
  for (const url of urls) {
    // Reuse the last preflight body; other originals are read sequentially,
    // avoiding an eight-original buffer in a memory-limited worker.
    const original = last?.url === url ? last.original : await deps.read(url);
    const preview = ready.get(url)!;
    if (
      original.sourceSha256 !== preview.original.sourceSha256 ||
      original.bytes.length !== preview.original.bytes ||
      original.contentType !== preview.original.contentType
    )
      throw new Error("Source photo changed before storage.");
    const ext = original.contentType.includes("png")
      ? "png"
      : original.contentType.includes("webp")
        ? "webp"
        : "jpg";
    const path = `_staging/${batchId}/${deps.uuid()}.${ext}`;
    await store.upload(path, original.bytes, original.contentType, true, preview.thumbnail);
    paths.push(path);
  }
  return paths;
}

export async function importPreviewSource(input: ImportPhotoPreviewSource) {
  const original = await readImportPhoto(input.url);
  if (
    original.sourceSha256 !== input.sourceSha256 ||
    original.bytes.length !== input.bytes ||
    original.contentType !== input.contentType
  )
    throw new Error("Source photo changed during preparation.");
  return { ...input, base64: Buffer.from(original.bytes).toString("base64") };
}
