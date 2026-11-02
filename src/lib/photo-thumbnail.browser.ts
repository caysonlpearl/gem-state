import { MAX_THUMBNAIL_BYTES, photoThumbnailDimensions } from "./photo-storage.ts";

export async function browserPhotoThumbnail(file: Blob): Promise<Blob> {
  if (file.type === "image/svg+xml" && file.size <= MAX_THUMBNAIL_BYTES) return file;
  let bitmap: ImageBitmap | HTMLImageElement;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    const url = URL.createObjectURL(file);
    try {
      const image = new Image();
      image.src = url;
      await image.decode();
      bitmap = image;
    } finally {
      URL.revokeObjectURL(url);
    }
  }
  const canvas = document.createElement("canvas");
  try {
    const target = photoThumbnailDimensions(bitmap.width, bitmap.height);
    canvas.width = target.width;
    canvas.height = target.height;
    const context = canvas.getContext("2d");
    if (!context) throw new Error("Could not prepare this photo.");
    context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    const result = await new Promise<Blob>((resolve, reject) =>
      canvas.toBlob(
        (blob) => (blob ? resolve(blob) : reject(new Error("Could not prepare this photo."))),
        "image/webp",
        0.72,
      ),
    );
    if (result.size > MAX_THUMBNAIL_BYTES)
      throw new Error("Could not prepare a small photo preview.");
    return result;
  } finally {
    if ("close" in bitmap) bitmap.close();
    canvas.width = 0;
    canvas.height = 0;
  }
}
