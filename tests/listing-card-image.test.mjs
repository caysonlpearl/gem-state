import test from "node:test";
import assert from "node:assert/strict";
import { listingCardImageUrl } from "../src/lib/listing-card-image.ts";

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
