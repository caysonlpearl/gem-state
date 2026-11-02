import { canonicalImportSource } from "./import-refresh.ts";
import { browserPhotoThumbnail } from "./photo-thumbnail.browser.ts";
import {
  MAX_IMPORT_PHOTO_BYTES,
  MAX_IMPORT_PREVIEW_BYTES,
  type PreparedImportPhoto,
  type ImportPhotoPreviewSource,
} from "./import-photo-preview.ts";
import type { StageImportInput, StageImportResult } from "./fb-import.functions";

function encode(bytes: Uint8Array) {
  const chunks: string[] = [];
  for (let n = 0; n < bytes.length; n += 0x8000)
    chunks.push(String.fromCharCode(...bytes.subarray(n, n + 0x8000)));
  return btoa(chunks.join(""));
}
type SourceBody = ImportPhotoPreviewSource & { base64: string };
export async function prepareImportedPhotoPreview(
  source: ImportPhotoPreviewSource,
  load: (input: ImportPhotoPreviewSource) => Promise<SourceBody>,
  thumbnail = browserPhotoThumbnail,
): Promise<PreparedImportPhoto> {
  if (
    !Number.isSafeInteger(source.bytes) ||
    source.bytes < 1 ||
    source.bytes > MAX_IMPORT_PHOTO_BYTES ||
    !/^[a-f0-9]{64}$/.test(source.sourceSha256)
  )
    throw new Error("Invalid source photo preparation.");
  const body = await load(source);
  if (
    body.url !== source.url ||
    body.bytes !== source.bytes ||
    body.sourceSha256 !== source.sourceSha256 ||
    body.contentType !== source.contentType ||
    body.base64.length > 4 * Math.ceil(MAX_IMPORT_PHOTO_BYTES / 3) ||
    !/^[A-Za-z0-9+/]+={0,2}$/.test(body.base64)
  )
    throw new Error("Source photo changed during preparation.");
  const binary = atob(body.base64);
  if (binary.length !== source.bytes) throw new Error("Source photo size changed.");
  const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
  const original = new Blob([bytes], { type: source.contentType });
  const digest = Array.from(
    new Uint8Array(await crypto.subtle.digest("SHA-256", await original.arrayBuffer())),
    (byte) => byte.toString(16).padStart(2, "0"),
  ).join("");
  if (digest !== source.sourceSha256) throw new Error("Source photo checksum changed.");
  const small = await thumbnail(original);
  if (
    !small.size ||
    small.size > MAX_IMPORT_PREVIEW_BYTES ||
    !["image/jpeg", "image/png", "image/webp", "image/svg+xml"].includes(small.type)
  )
    throw new Error("Could not prepare a small photo preview.");
  return {
    url: source.url,
    sourceSha256: digest,
    contentType: small.type as PreparedImportPhoto["contentType"],
    base64: encode(new Uint8Array(await small.arrayBuffer())),
  };
}

/** Only a structured, confirmed preview need permits one row-specific retry. */
export async function stageImportWithPhotoPreviews(
  options: { data: StageImportInput },
  deps: {
    stage: (options: { data: StageImportInput }) => Promise<StageImportResult>;
    source: (input: ImportPhotoPreviewSource) => Promise<SourceBody>;
    thumbnail?: typeof browserPhotoThumbnail;
  },
): Promise<StageImportResult> {
  const first = await deps.stage(options);
  if (!first.photoPreviewRequests?.length) return first;
  const result = {
    ...first,
    failures: [...first.failures],
    failedUrls: [...first.failedUrls],
    photoPreviewRequests: [],
  };
  const seen = new Set<number>();
  for (const request of first.photoPreviewRequests) {
    const index = request.rowIndex;
    const item = options.data.items[index];
    if (
      !Number.isInteger(index) ||
      index < 0 ||
      !item ||
      seen.has(index) ||
      !result.failures.some((f) => f.rowIndex === index && f.reason === "photo_preview_required")
    )
      continue;
    seen.add(index);
    let retryStarted = false;
    try {
      const expected = [...new Set(item.photoUrls)];
      const supplied = [
        ...request.prepared.map((p) => p.url),
        ...request.sources.map((p) => p.url),
      ];
      if (
        !request.sources.length ||
        supplied.length !== expected.length ||
        new Set(supplied).size !== supplied.length ||
        supplied.some((url) => !expected.includes(url))
      )
        throw new Error("Preview request does not match this listing.");
      const previews = [...request.prepared];
      for (const source of request.sources)
        previews.push(await prepareImportedPhotoPreview(source, deps.source, deps.thumbnail));
      retryStarted = true;
      const retry = await deps.stage({
        data: {
          ...options.data,
          batchId: first.batchId,
          finalizeScan: false,
          items: [{ ...item, preparedPhotoPreviews: previews }],
        },
      });
      if (retry.batchId !== first.batchId) throw new Error("Staging batch changed.");
      result.staged += retry.staged;
      result.updated += retry.updated;
      result.flaggedRemoved += retry.flaggedRemoved;
      result.preservedActive += retry.preservedActive;
      result.recaptured += retry.recaptured;
      result.failed += retry.failed - 1;
      const canonical = canonicalImportSource(options.data.sourceProfileUrl, item.sourceUrl);
      result.failedUrls = result.failedUrls
        .filter((url) => {
          try {
            return canonicalImportSource(options.data.sourceProfileUrl, url) !== canonical;
          } catch {
            return url !== item.sourceUrl;
          }
        })
        .concat(retry.failedUrls);
      result.failures = result.failures
        .filter((f) => f.rowIndex !== index)
        .concat(retry.failures.map((f) => ({ ...f, rowIndex: index })));
    } catch {
      // A lost stage acknowledgement is not replayed. Other rows keep their
      // successful results, and this row remains selected for explicit review.
      result.failures = result.failures
        .filter((f) => f.rowIndex !== index)
        .concat({
          rowIndex: index,
          reason: retryStarted ? "request_interrupted" : "photo_preview_failed",
        });
    }
  }
  return result;
}
