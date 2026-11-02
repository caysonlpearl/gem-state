import { imageSize } from "image-size";

import {
  MAX_THUMBNAIL_BYTES,
  photoThumbnailDimensions,
  photoContentType,
  type PhotoThumbnail,
} from "./photo-storage";

export function orientPreviewPixels(
  pixels: Uint8Array,
  width: number,
  height: number,
  orientation: number,
) {
  const swap = orientation >= 5 && orientation <= 8;
  const outWidth = swap ? height : width;
  const out = new Uint8Array(pixels.length);
  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++) {
      const [dx, dy] =
        orientation === 2
          ? [width - 1 - x, y]
          : orientation === 3
            ? [width - 1 - x, height - 1 - y]
            : orientation === 4
              ? [x, height - 1 - y]
              : orientation === 5
                ? [y, x]
                : orientation === 6
                  ? [height - 1 - y, x]
                  : orientation === 7
                    ? [height - 1 - y, width - 1 - x]
                    : orientation === 8
                      ? [y, width - 1 - x]
                      : [x, y];
      out.set(
        pixels.subarray((y * width + x) * 4, (y * width + x) * 4 + 4),
        (dy * outWidth + dx) * 4,
      );
    }
  return { pixels: out, width: outWidth, height: swap ? width : height };
}

/** Bound decoding before entering WASM; originals are retained unchanged. */
export async function makePhotoThumbnail(
  bytes: Uint8Array,
  contentType: string,
  maxPixels = 8_000_000,
): Promise<PhotoThumbnail> {
  const type = photoContentType(contentType);
  // Small vector photos already scale without a larger raster download.
  if (type === "image/svg+xml" && bytes.byteLength <= MAX_THUMBNAIL_BYTES)
    return { bytes, contentType: type, width: null, height: null };
  const dimensions = imageSize(bytes);
  const width = dimensions.width;
  const height = dimensions.height;
  if (!width || !height || width * height > maxPixels || Math.max(width, height) > 20_000)
    throw new Error("This photo needs a prepared thumbnail before storage can switch.");
  const { photoProcessor } = await import("./photo-photon.server");
  const { PhotonImage, resize, SamplingFilter } = photoProcessor();
  const input = PhotonImage.new_from_byteslice(bytes);
  let output: ReturnType<typeof resize> | null = null;
  try {
    const orientation = dimensions.orientation ?? 1;
    const swap = orientation >= 5 && orientation <= 8;
    const target = photoThumbnailDimensions(swap ? height : width, swap ? width : height);
    output = resize(
      input,
      swap ? target.height : target.width,
      swap ? target.width : target.height,
      SamplingFilter.Triangle,
    );
    if (orientation >= 2 && orientation <= 8) {
      const oriented = orientPreviewPixels(
        output.get_raw_pixels(),
        output.get_width(),
        output.get_height(),
        orientation,
      );
      output.free();
      output = new PhotonImage(oriented.pixels, oriented.width, oriented.height);
    }
    const pixels = output.get_raw_pixels();
    let alpha = false;
    for (let i = 3; i < pixels.length; i += 4)
      if (pixels[i] !== 255) {
        alpha = true;
        break;
      }
    const thumbnail = alpha ? output.get_bytes_webp() : output.get_bytes_jpeg(70);
    if (!thumbnail.byteLength || thumbnail.byteLength > MAX_THUMBNAIL_BYTES)
      throw new Error("Photo thumbnail exceeds its storage budget.");
    return {
      bytes: thumbnail,
      contentType: alpha ? "image/webp" : "image/jpeg",
      width: output.get_width(),
      height: output.get_height(),
    };
  } finally {
    output?.free();
    input.free();
  }
}
