import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";

test("all eight supplied icons have unique opaque native assets and matching previews", () => {
  const sources = JSON.parse(
    readFileSync(new URL("../docs/app-icon-sources.json", import.meta.url)),
  );
  assert.equal(sources.length, 8);
  assert.equal(new Set(sources.map((icon) => icon.id)).size, 8);
  const hashes = new Set();
  for (const icon of sources) {
    const directory = new URL(
      `../apps/mobile/ios/App/App/Assets.xcassets/${icon.native}.appiconset/`,
      import.meta.url,
    );
    const catalog = JSON.parse(readFileSync(new URL("Contents.json", directory)));
    const image = readFileSync(new URL(catalog.images[0].filename, directory));
    assert.equal(image.subarray(1, 4).toString(), "PNG");
    assert.equal(image.readUInt32BE(16), 1024);
    assert.equal(image.readUInt32BE(20), 1024);
    assert.equal(image[25], 2, "Native icon must be RGB without transparency");
    hashes.add(createHash("sha256").update(image).digest("hex"));
    const preview = readFileSync(new URL(`../public/app-icons/${icon.id}.png`, import.meta.url));
    assert.equal(preview.readUInt32BE(16), 192);
    assert.equal(preview.readUInt32BE(20), 192);
    assert.match(icon.sha256, /^[a-f0-9]{64}$/);
  }
  assert.equal(hashes.size, 8);
});
