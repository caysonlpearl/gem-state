import test from "node:test";
import assert from "node:assert/strict";
import { loadPhotoModules } from "./photo-storage-fixture.mjs";

test("400 actual photo signings bound metadata concurrency and retain fallback for an altered object", async () => {
  const { createPhotoStorage } = loadPhotoModules()("./photo-storage-core.server");
  const records = Array.from({ length: 400 }, (_, i) => ({
    bucket: "listing-media",
    path: `seller/${i}.jpg`,
    key: `original/${i}`,
    bytes: 123,
    sha256: "a".repeat(64),
    verifiedAt: "2026-11-03T00:00:00Z",
    thumbnailKey: `thumb/${i}`,
    thumbnailBytes: 12,
    thumbnailSha256: "b".repeat(64),
  }));
  let active = 0,
    peak = 0,
    checked = 0;
  const fallback = [];
  const store = createPhotoStorage({
    mode: "r2",
    receipts: { read: async () => records },
    r2: {
      available: async () => true,
      matches: async (_bucket, key) => {
        checked++;
        active++;
        peak = Math.max(peak, active);
        const overloaded = active > 6;
        await new Promise((resolve) => setTimeout(resolve, 1));
        active--;
        return !overloaded && key !== "thumb/137";
      },
      sign: async (_bucket, key) => `https://private.example/${key}`,
    },
    source: {
      sign: async (_bucket, paths) => {
        fallback.push(...paths);
        return new Map(paths.map((path) => [path, `https://retained.example/${path}`]));
      },
    },
  });
  const result = await store.sign(
    "listing-media",
    records.map((r) => r.path),
    86400,
    true,
  );
  assert.equal(result.size, 400);
  assert.equal(checked, 400);
  assert.equal(peak, 6);
  assert.deepEqual(fallback, ["seller/137.jpg"]);
  assert.equal([...result.values()].filter((url) => url.includes("private.example")).length, 399);
});
