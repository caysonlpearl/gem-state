import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

const configSource = await read("src/config/classifieds.ts");
const browseSource = await read("src/routes/browse.tsx");
const createSource = await read("src/routes/_authenticated/create-listing.tsx");
const contractsSource = await read("src/lib/classified-listing-contracts.ts");
const actionsSource = await read("src/components/classifieds/ListingActions.tsx");
const moderationSource = await read("src/routes/_authenticated/admin.classifieds.tsx");
const sellSource = await read("src/routes/sell.tsx");

test("classified taxonomy includes Idaho categories and automotive inventory", () => {
  assert.match(configSource, /cars-trucks/);
  assert.match(configSource, /furniture/);
  assert.match(configSource, /idahoRegions/);
  assert.match(configSource, /drivetrains: \[[\s\S]*4WD/);
});

test("browse and create flows expose the same vehicle fields", () => {
  for (const field of [
    "make",
    "model",
    "yearMin",
    "yearMax",
    "mileageMax",
    "bodyStyle",
    "transmission",
    "drivetrain",
    "fuelType",
    "titleStatus",
  ]) {
    assert.match(browseSource, new RegExp(field));
    assert.match(createSource, new RegExp(field.replace(/Min|Max/, "")));
  }
  assert.match(contractsSource, /state:/);
  assert.match(contractsSource, /region:/);
});

test("classified checkout and offers stay attached to one exact listing", () => {
  assert.match(actionsSource, /requestExactListing/);
  assert.match(actionsSource, /makeListingOffer/);
  assert.match(actionsSource, /askId: listing\.id/);
  assert.doesNotMatch(actionsSource, /variantId: listing\.variantId/);
});

test("admin moderation reviews classified listings instead of publishing them directly", () => {
  assert.match(moderationSource, /getAdminClassifiedQueue/);
  assert.match(moderationSource, /adminReviewAsk/);
  assert.match(moderationSource, /Approve listing/);
  assert.match(moderationSource, /Reject listing/);
});

test("public seller landing page is Gem State-specific", () => {
  assert.doesNotMatch(sellSource, /ParkVault|Disney|park merchandise|catalog product/i);
  assert.match(sellSource, /Gem State seller/);
  assert.match(sellSource, /exact-item photos/);
});
