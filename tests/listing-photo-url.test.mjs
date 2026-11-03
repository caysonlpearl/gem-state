import test from "node:test";
import assert from "node:assert/strict";
import { listingPhotoUrl } from "../src/lib/listing-photo-url.ts";
import { socialImageMeta } from "../src/lib/seo-policy.ts";

test("native photos retain the stable private-storage route rather than an expiring gallery signature", () => {
  const listing = {
    id: "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee",
    images: [{ url: "https://storage.example/signed?token=temporary" }],
  };
  assert.equal(listingPhotoUrl(listing), `/media/listings/${listing.id}/0`);
  assert.equal(listingPhotoUrl(listing, 1), undefined);
});

test("partner metadata advertises the public gallery source in Open Graph and Twitter", () => {
  for (const kind of [
    "externalHome",
    "externalVehicle",
    "externalPet",
    "externalJob",
    "externalMerchandise",
    "directory",
  ]) {
    const listing = {
      id: "provider-id",
      [kind]: {},
      images: [{ url: "https://images.example/listing.jpg" }],
    };
    const url = listingPhotoUrl(listing);
    assert.equal(url, listing.images[0].url);
    const metadata = socialImageMeta("https://onbluebird.com", url, "Listing");
    assert.equal(metadata.find((entry) => entry.property === "og:image").content, url);
    assert.equal(metadata.find((entry) => entry.name === "twitter:image").content, url);
  }
});
