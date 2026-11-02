export const MAX_IMPORT_PHOTO_BYTES = 12 * 1024 * 1024;
export const MAX_IMPORT_PREVIEW_BYTES = 512 * 1024;
export type PreparedImportPhoto = {
  url: string;
  sourceSha256: string;
  contentType: "image/jpeg" | "image/png" | "image/webp" | "image/svg+xml";
  base64: string;
};
export type ImportPhotoPreviewSource = {
  url: string;
  sourceSha256: string;
  bytes: number;
  contentType: string;
};
export type ImportPhotoPreviewRequest = {
  rowIndex: number;
  prepared: PreparedImportPhoto[];
  sources: ImportPhotoPreviewSource[];
};
