import assert from "node:assert/strict";
import test from "node:test";
import { checkHomepagePhoto, selectHomepagePhotoCards } from "../src/lib/homepage-photo-selection.server.ts";

test("featured photos skip removed images, preserve good-photo order and leave records intact", async () => {
  const cards = Array.from({ length: 16 }, (_, i) => ({ id: i, imageUrl: `https://example.com/${i}.jpg`, externalVehicle: {} }));
  const snapshot = JSON.stringify(cards);
  const calls = [];
  const selected = await selectHomepagePhotoCards(cards, async (url) => {
    const id = Number(new URL(url).pathname.split("/").at(-1).split(".")[0]);
    calls.push(id);
    return id >= 2 && id <= 7 ? "missing" : "available";
  });
  assert.deepEqual(selected.slice(0, 4).map((c) => c.id), [0, 1, 8, 9]);
  assert.equal(calls.length, 12);
  assert.equal(JSON.stringify(cards), snapshot);
  assert.deepEqual(selected.slice(-4), cards.slice(12));
});

test("unverified or absent photos remain reachable and native storage needs no external probe", async () => {
  const cards = [
    { id: "empty", imageUrl: null },
    { id: "unknown", imageUrl: "https://example.com/unknown.jpg", externalVehicle: {} },
    { id: "native", imageUrl: "https://storage.example/photo.jpg" },
  ];
  const calls = [];
  const selected = await selectHomepagePhotoCards(cards, async (url) => { calls.push(url); return "unknown"; });
  assert.deepEqual(selected.map((c) => c.id), ["native", "empty", "unknown"]);
  assert.deepEqual(calls, [cards[1].imageUrl]);
});

test("working thumbnails precede multi-megabyte dealer originals in the featured row", async () => {
  const cards = [
    { id: "original", imageUrl: "https://assets.cai-media-management.com/full-size.jpg", externalVehicle: {} },
    { id: "thumbnail", imageUrl: "https://platform.cstatic-images.com/xxlarge/photo.jpg", externalVehicle: {} },
    { id: "native", imageUrl: "https://storage.example/signed-thumbnail.jpg" },
  ];
  const result = await selectHomepagePhotoCards(cards, async () => "available");
  assert.deepEqual(result.map((card) => card.id), ["thumbnail", "native", "original"]);
});

test("photo probes are bounded, cached and never follow redirects or fetch arbitrary hosts", async (t) => {
  const calls = [];
  t.mock.method(globalThis, "fetch", async (url, init) => {
    calls.push({ url, init });
    return new Response(null, { status: url.includes("removed") ? 404 : url.includes("redirect") ? 302 : 200, headers: { "content-type": "image/jpeg" } });
  });
  for (const unsafe of ["http://images.craigslist.org/x", "https://images.craigslist.org.evil.test/x", "https://127.0.0.1/x", "https://user@images.craigslist.org/x", "https://images.craigslist.org:8443/x"])
    assert.equal(await checkHomepagePhoto(unsafe), "unknown");
  assert.equal(calls.length, 0);
  const removed = "https://prelogin.privateauto.com/removed-test.jpg";
  assert.equal(await checkHomepagePhoto(removed), "missing");
  assert.equal(await checkHomepagePhoto(removed), "missing");
  assert.equal(await checkHomepagePhoto("https://images.craigslist.org/ok-test.jpg"), "available");
  assert.equal(await checkHomepagePhoto("https://images.craigslist.org/redirect-test.jpg"), "unknown");
  assert.equal(calls.length, 3);
  assert.ok(calls.every(({ init }) => init.method === "HEAD" && init.redirect === "manual" && init.signal instanceof AbortSignal));
});
