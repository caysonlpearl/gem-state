import test from "node:test";
import assert from "node:assert/strict";
import { selectPartnerSharePhoto } from "../src/lib/partner-share-photo.server.ts";
import { listingPhotoUrl } from "../src/lib/listing-photo-url.ts";

test("only confirmed missing photos permit a bounded fallback, without changing the gallery", async () => {
  const images = ["missing", "also-missing", "blue-truck", "later"];
  const snapshot = JSON.stringify(images);
  const calls = [];
  const selected = await selectPartnerSharePhoto(images, async (url) => {
    calls.push(url);
    return url.includes("missing") ? "missing" : "available";
  });
  assert.equal(selected, "blue-truck");
  assert.deepEqual(calls, images.slice(0, 3));
  assert.equal(JSON.stringify(images), snapshot);
  const bounded = [];
  assert.equal(
    await selectPartnerSharePhoto(["0", "1", "2", "3", "4"], async (url) => {
      bounded.push(url);
      return "missing";
    }),
    "0",
  );
  assert.equal(bounded.length, 4);
});

test("working, blocked, redirected, timed-out and unknown leads never trigger fallback", async () => {
  for (const status of ["available", "unknown"]) {
    const calls = [];
    assert.equal(
      await selectPartnerSharePhoto(["lead", "other"], async (url) => {
        calls.push(url);
        return status;
      }),
      "lead",
    );
    assert.deepEqual(calls, ["lead"]);
  }
  assert.equal(
    await selectPartnerSharePhoto(["lead", "other"], async () => {
      throw new Error("timeout");
    }),
    "lead",
  );
  const calls = [];
  assert.equal(
    await selectPartnerSharePhoto(["missing", "blocked", "working"], async (url) => {
      calls.push(url);
      return url === "missing" ? "missing" : "unknown";
    }),
    "missing",
  );
  assert.deepEqual(calls, ["missing", "blocked"], "do not continue around a blocked candidate");
});

test("real photo transport uses only allowlisted HEADs and never reads bodies or follows redirects", async (t) => {
  const calls = [];
  t.mock.method(globalThis, "fetch", async (url, init) => {
    calls.push({ url, init });
    return new Response(null, {
      status: url.includes("blocked") ? 403 : url.includes("missing") ? 410 : 200,
      headers: { "content-type": "image/jpeg" },
    });
  });
  const base = "https://platform.cstatic-images.com/partner-share-fixture/";
  assert.equal(
    await selectPartnerSharePhoto([base + "missing.jpg", base + "blue.jpg"]),
    base + "blue.jpg",
  );
  assert.equal(calls.length, 2);
  assert.ok(
    calls.every(
      ({ init }) =>
        init.method === "HEAD" && init.redirect === "manual" && init.signal instanceof AbortSignal,
    ),
  );
  assert.equal(
    await selectPartnerSharePhoto([base + "blocked.jpg", base + "other.jpg"]),
    base + "blocked.jpg",
  );
  assert.equal(calls.length, 3);
  for (const unsafe of [
    "https://127.0.0.1/a",
    "https://user@platform.cstatic-images.com/a",
    "https://platform.cstatic-images.com.evil.test/a",
    "http://platform.cstatic-images.com/a",
  ]) {
    assert.equal(await selectPartnerSharePhoto([unsafe, base + "blue.jpg"]), unsafe);
  }
  assert.equal(calls.length, 3);
});

test("only an existing partner-gallery URL may replace metadata photo zero; native photos stay signed", () => {
  const images = [
    { url: "https://images.example/removed.jpg" },
    { url: "https://images.example/blue.jpg" },
  ];
  const listing = { id: "vehicle", externalVehicle: {}, images, shareImageUrl: images[1].url };
  assert.equal(listingPhotoUrl(listing), images[1].url);
  assert.equal(listingPhotoUrl(listing, 1), images[1].url);
  assert.equal(
    listingPhotoUrl({ ...listing, shareImageUrl: "https://unrelated.example/other.jpg" }),
    images[0].url,
  );
  assert.equal(
    listingPhotoUrl({ ...listing, externalVehicle: undefined }),
    "/media/listings/vehicle/0",
  );
});
