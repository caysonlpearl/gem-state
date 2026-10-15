import test from "node:test";
import assert from "node:assert/strict";
import {
  canIncludeMashvisorFilters,
  listedAt,
  MASHVISOR_ID,
  normalizeMashvisorHome,
} from "../src/lib/mashvisor-contract.ts";

test("feed homes only appear for for-sale Homes searches", () => {
  assert.equal(canIncludeMashvisorFilters({ category: "other-real-estate" }), true);
  assert.equal(canIncludeMashvisorFilters({ category: "other-real-estate", homeTab: "buy" }), true);
  assert.equal(canIncludeMashvisorFilters({ category: "other-real-estate", homeTab: "rent" }), false);
  assert.equal(canIncludeMashvisorFilters({ category: "cars-trucks" }), false);
});

test("filters the feed cannot honor hide feed homes", () => {
  assert.equal(
    canIncludeMashvisorFilters({ category: "other-real-estate", homePetsPolicy: "Cats" }),
    false,
  );
  assert.equal(
    canIncludeMashvisorFilters({ category: "other-real-estate", homeBedroomsMin: 3, priceMax: 400000 }),
    true,
  );
});

test("missing facts stay missing and price converts to cents", () => {
  const home = normalizeMashvisorHome({
    id: 42, list_price: 160000, address: "1 Main", city: "Boise", state: "id",
    baths: null, beds: 3, sqft: 0, image_url: "http://x.test/a.jpg",
  });
  assert.equal(home.priceCents, 16_000_000);
  assert.equal(home.baths, null);
  assert.equal(home.sqft, null);
  assert.equal(home.state, "ID");
  assert.equal(home.imageUrl, "https://x.test/a.jpg");
});

test("homes without a price are dropped", () => {
  assert.equal(normalizeMashvisorHome({ id: 1, address: "a", city: "Boise", state: "ID" }), null);
});

test("ids and listed dates", () => {
  assert.ok(MASHVISOR_ID.test("mashvisor-4473202"));
  assert.ok(!MASHVISOR_ID.test("mashvisor-abc"));
  const now = Date.parse("2026-10-15T00:00:00Z");
  assert.equal(listedAt({ daysOnMarket: 2 }, now), "2026-10-13T00:00:00.000Z");
  assert.equal(listedAt({ daysOnMarket: null }, now), new Date(0).toISOString());
});
