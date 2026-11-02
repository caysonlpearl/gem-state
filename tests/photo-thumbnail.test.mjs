import test from "node:test";
import assert from "node:assert/strict";
import { PhotonImage } from "@cf-wasm/photon";
import { imageSize } from "image-size";
import { loadPhotoModules } from "./photo-storage-fixture.mjs";

const { makePhotoThumbnail, orientPreviewPixels } = loadPhotoModules()("./photo-thumbnail.server");

test("all eight EXIF orientations preserve exact pixel positions", () => {
  const rgba = Uint8Array.from([1, 2, 3, 4, 5, 6].flatMap((red) => [red, 0, 0, 255]));
  const expected = [
    [1, 2, 3, 4, 5, 6],
    [3, 2, 1, 6, 5, 4],
    [6, 5, 4, 3, 2, 1],
    [4, 5, 6, 1, 2, 3],
    [1, 4, 2, 5, 3, 6],
    [4, 1, 5, 2, 6, 3],
    [6, 3, 5, 2, 4, 1],
    [3, 6, 2, 5, 1, 4],
  ];
  for (let orientation = 1; orientation <= 8; orientation++) {
    const result = orientPreviewPixels(rgba, 3, 2, orientation);
    assert.deepEqual(
      [...result.pixels].filter((_, i) => i % 4 === 0),
      expected[orientation - 1],
    );
  }
});
test("actual JPEG, PNG and WebP decoders produce bounded 640px thumbnails without altering originals", async () => {
  const raw = new Uint8Array(1280 * 720 * 4).fill(120);
  for (let i = 3; i < raw.length; i += 4) raw[i] = 255;
  const image = new PhotonImage(raw, 1280, 720);
  try {
    for (const [bytes, type] of [
      [image.get_bytes_jpeg(80), "image/jpeg"],
      [image.get_bytes(), "image/png"],
      [image.get_bytes_webp(), "image/webp"],
    ]) {
      const before = Buffer.from(bytes);
      const thumb = await makePhotoThumbnail(bytes, type);
      const dimensions = imageSize(thumb.bytes);
      assert.equal(dimensions.width, 640);
      assert.equal(dimensions.height, 360);
      assert.equal(dimensions.type, "jpg");
      assert.ok(thumb.bytes.length < 512 * 1024);
      assert.deepEqual(Buffer.from(bytes), before);
    }
  } finally {
    image.free();
  }
});
test("portrait previews retain card width and JPEG EXIF orientation without changing originals", async () => {
  const raw = new Uint8Array(720 * 1280 * 4).fill(255);
  const image = new PhotonImage(raw, 720, 1280);
  try {
    const portrait = await makePhotoThumbnail(image.get_bytes(), "image/png");
    assert.equal(portrait.width, 640);
    assert.equal(portrait.height, 1138);
    const jpeg = image.get_bytes_jpeg(80);
    const exif = Buffer.from(
      "ffe100224578696600004d4d002a00000008000101120003000000010006000000000000",
      "hex",
    );
    const oriented = Buffer.concat([jpeg.slice(0, 2), exif, jpeg.slice(2)]);
    const before = Buffer.from(oriented);
    assert.equal(imageSize(oriented).orientation, 6);
    const thumb = await makePhotoThumbnail(oriented, "image/jpeg");
    assert.equal(thumb.width, 640);
    assert.equal(thumb.height, 360);
    assert.deepEqual(oriented, before);
  } finally {
    image.free();
  }
});

test("transparent previews preserve alpha and the deployed diagnostic image decodes", async () => {
  const image = new PhotonImage(new Uint8Array(20 * 20 * 4).fill(100), 20, 20);
  try {
    const thumb = await makePhotoThumbnail(image.get_bytes(), "image/png");
    assert.equal(thumb.contentType, "image/webp");
  } finally {
    image.free();
  }
  const png = Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAAEElEQVR4AQEFAPr/AACVz/8EYQJkPACksAAAAABJRU5ErkJggg==",
    "base64",
  );
  assert.ok((await makePhotoThumbnail(png, "image/png")).bytes.length > 0);
});

test("oversized decoded images are rejected before processing; small vectors retain their original bytes", async () => {
  const image = new PhotonImage(new Uint8Array(20 * 20 * 4), 20, 20);
  try {
    await assert.rejects(
      () => makePhotoThumbnail(image.get_bytes(), "image/png", 10),
      /prepared thumbnail/,
    );
  } finally {
    image.free();
  }
  const svg = new TextEncoder().encode(
    '<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"/>',
  );
  const result = await makePhotoThumbnail(svg, "image/svg+xml");
  assert.equal(result.bytes, svg);
  assert.equal(result.contentType, "image/svg+xml");
});
