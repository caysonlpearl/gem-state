import { dealerContactPriceLabel } from "../src/lib/vehicle-shopping.ts";
import test from "node:test";
import assert from "node:assert/strict";
import {
  dealerInventoryPage,
  vehiclePriceComparison,
  hasApprovedDealer,
} from "../src/lib/vehicle-shopping.ts";

test("dealer inventory pages include every vehicle once, clamp pages and keep totals", () => {
  const cars = Array.from({ length: 242 }, (_, i) => i);
  const pages = Array.from({ length: 11 }, (_, i) => dealerInventoryPage(cars, i + 1));
  assert.deepEqual(
    pages.flatMap((p) => p.listings),
    cars,
  );
  assert.equal(pages[10].listings.length, 2);
  assert.equal(pages[0].listingCount, 242);
  assert.equal(dealerInventoryPage(cars, 999).page, 11);
  assert.equal(dealerInventoryPage(cars, -2).page, 1);
  assert.deepEqual(dealerInventoryPage([], 2).listings, []);
});
test("price comparisons use actual higher MSRP or previous price without inventing a discount", () => {
  assert.deepEqual(
    vehiclePriceComparison({ priceCents: 3500000, vehiclePricing: { msrpCents: 3900000 } }),
    { cents: 3900000, label: "MSRP", savingsCents: 400000 },
  );
  assert.equal(
    vehiclePriceComparison({ priceCents: 3500000, externalVehicle: { msrp: 34000 } }),
    null,
  );
  assert.equal(vehiclePriceComparison({ priceCents: 3500000, externalVehicle: { msrp: 0 } }), null);
  assert.equal(vehiclePriceComparison({ priceCents: 3500000 }), null);
  assert.equal(
    vehiclePriceComparison({ priceCents: 3500000, externalVehicle: { msrp: NaN } }),
    null,
  );
  assert.equal(
    vehiclePriceComparison({ priceCents: 3500000, externalVehicle: { referencePrice: 37000 } })
      .label,
    "Previous price",
  );
});
test("only a Bluebird dealership profile enables the approved dealer contact experience", () => {
  assert.equal(hasApprovedDealer({ dealer: { slug: "twin-falls-subaru" } }), true);
  assert.equal(hasApprovedDealer({ dealer: { slug: "" } }), false);
  assert.equal(hasApprovedDealer({ dealer: null }), false);
});

test("only missing dealer feed prices use inquiry pricing", () => {
  assert.equal(
    dealerContactPriceLabel({ id: "dealerfeed-example", priceCents: 0 }),
    "Contact For Price",
  );
  assert.equal(dealerContactPriceLabel({ id: "dealerfeed-example", priceCents: 10000 }), null);
  assert.equal(dealerContactPriceLabel({ id: "native-id", priceCents: 0 }), null);
});
