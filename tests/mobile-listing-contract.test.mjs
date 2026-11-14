import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { loadSourceModule } from "./helpers/load-source-module.mjs";
const { mobileListingEditInput, mobileListingActionSchema } = loadSourceModule(
  "lib/mobile-listing-contract.ts",
);
const owner = randomUUID(),
  other = randomUUID();
const input = {
  title: "Local bicycle",
  description: "A well cared for bicycle ready for a new home.",
  category: "general",
  condition: "used_good",
  priceCents: 15000,
  state: "ID",
  region: "Wrong region",
  city: "boise",
  fulfillmentMode: "local_pickup",
  itemDetails: { brand: "Example", itemType: "Bicycle" },
};
test("mobile editing uses the website's category, location and item validation plus a closed photo/parcel boundary", () => {
  const r = mobileListingEditInput(input, owner);
  assert.equal(r.city, "Boise");
  assert.equal(r.region, "Treasure Valley");
  assert.equal(r.parcelLengthIn, null);
  assert.deepEqual(r.publicMediaPaths, []);
  for (const extra of [
    { ownerId: other },
    { sellerId: other },
    { listingId: randomUUID() },
    { requestId: randomUUID() },
    { publicMediaPaths: [other + "/p.jpg"] },
    { publicMediaPaths: [owner + "/../p.jpg"] },
    { publicMediaPaths: [owner + "/p.jpg", owner + "/p.jpg"] },
    { parcelLengthIn: -5 },
    { parcelWeightLb: Infinity },
    { description: "short" },
    { city: "Not a real Idaho town" },
    { category: "cars-trucks" },
  ])
    assert.throws(() => mobileListingEditInput({ ...input, ...extra }, owner));
  assert.deepEqual(
    mobileListingActionSchema.parse({ action: "archive", version: "a".repeat(64) }).input,
    {},
  );
  for (const extra of [{ ownerId: other }, { action: "promote" }, { version: "old" }])
    assert.equal(
      mobileListingActionSchema.safeParse({ action: "archive", version: "a".repeat(64), ...extra })
        .success,
      false,
    );
});
test("vehicle edits share SQL compatibility keys with website create/edit and preserve structured details", () => {
  const r = mobileListingEditInput(
    {
      ...input,
      category: "cars-trucks",
      vehicle: {
        make: "toyota",
        model: "tacoma",
        year: 2020,
        mileage: 35000,
        bodyStyle: "Pickup",
        transmission: "Automatic",
        drivetrain: "4WD",
        fuelType: "Gasoline",
        titleStatus: "Clean",
        exteriorColor: "Blue",
        vin: "1FTFW1ET1EFA00001",
      },
    },
    owner,
  );
  assert.equal(r.vehicle.make, "Toyota");
  assert.equal(r.vehicle.model, "Tacoma");
  assert.equal(r.vehicle.body_style, "Pickup");
  assert.equal(r.vehicle.fuel_type, "Gasoline");
  assert.equal(r.vehicle.exterior_color, "Blue");
  assert.equal(r.vehicle.title_status, "Clean");
  assert(!("bodyStyle" in r.vehicle));
  assert.equal(r.vehicle.vin, "1FTFW1ET1EFA00001");
});
