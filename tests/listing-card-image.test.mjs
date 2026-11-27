import test from "node:test";
import assert from "node:assert/strict";
import {
  listingCardImageFallbackUrl,
  listingCardImageUrl,
  nativeListingCoverUrl,
} from "../src/lib/listing-card-image.ts";

test("card thumbnails use the verified Craigslist variant without touching detail URLs", () => {
  const original = "https://images.craigslist.org/00x0x_accRZPM5AdB_0CI0t2_1200x900.jpg";
  assert.equal(listingCardImageUrl(original), original.replace("1200x900", "600x450"));
  assert.equal(original.endsWith("1200x900.jpg"), true);
  for (const url of [
    original + "?signature=example",
    original + "#fragment",
    original.replace("images.craigslist.org", "images.craigslist.org.evil.test"),
    original.replace("https:", "http:"),
    "https://dealer.example/photo.jpg",
    "/images/local.jpg",
    "invalid",
  ])
    assert.equal(listingCardImageUrl(url), url);
});

test("opaque cover revisions change cache addresses without exposing storage paths", async () => {
  const { listingCoverRevision } = await import("../src/lib/listing-cover-revision.server.ts");
  const id = "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee";
  const first = await listingCoverRevision("member/photos/first-object.jpg");
  const same = await listingCoverRevision("member/photos/first-object.jpg");
  const next = await listingCoverRevision("member/photos/replacement-object.jpg");
  assert.match(first, /^[0-9a-f]{64}$/);
  assert.equal(first, same);
  assert.notEqual(first, next);
  assert.notEqual(nativeListingCoverUrl(id, first), nativeListingCoverUrl(id, next));
  assert(!nativeListingCoverUrl(id, first).includes("member/photos"));
  assert.equal(nativeListingCoverUrl(id, "untrusted&key=value"), null);
  assert.equal(nativeListingCoverUrl("private/path", first), null);
});

test("native cards can retry the original at the same visibility-checked listing route", () => {
  const id = "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee";
  const rev = "a".repeat(64);
  const original = `/media/listings/${id}/0`;
  assert.equal(
    listingCardImageFallbackUrl(nativeListingCoverUrl(id, rev)),
    `${original}?rev=${rev}`,
  );
  assert.equal(listingCardImageFallbackUrl(nativeListingCoverUrl(id)), original);
  assert.equal(listingCardImageFallbackUrl(original), null);
  assert.equal(listingCardImageFallbackUrl("https://photo.example/image?size=card"), null);
});
