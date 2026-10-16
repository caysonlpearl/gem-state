import assert from "node:assert/strict";
import test from "node:test";

import { originalListingFor } from "../src/lib/import-original-listing.ts";

test("Vinted and Whatnot imports link back to their original listing", () => {
  assert.deepEqual(originalListingFor("https://www.vinted.com/items/10287666715"), {
    platform: "Vinted",
    url: "https://www.vinted.com/items/10287666715",
  });
  assert.equal(
    originalListingFor("https://www.whatnot.com/listing/TGlzdGluZ05vZGU6MTY0MTY2Njc5MA==")?.platform,
    "Whatnot",
  );
});

test("other sources and unsafe URLs keep Bluebird messaging", () => {
  assert.equal(originalListingFor("https://www.facebook.com/marketplace/item/123"), null);
  assert.equal(originalListingFor("https://classifieds.ksl.com/listing/123"), null);
  assert.equal(originalListingFor("javascript:alert(1)//vinted.com/items/1"), null);
  assert.equal(originalListingFor("http://www.vinted.com/items/1"), null);
  assert.equal(originalListingFor("https://vinted.com.evil.example/items/1"), null);
  assert.equal(originalListingFor(null), null);
});
