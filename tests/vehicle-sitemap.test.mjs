import test from "node:test";
import assert from "node:assert/strict";
import { vehicleLandingReferences } from "../src/lib/vehicle-sitemap.ts";
import { isIndexablePlaceInventory } from "../src/lib/seo-policy.ts";

const card = (id, createdAt = "2026-10-30T00:00:00Z") => ({
  id, createdAt, city: "Boise", state: "ID", region: "Treasure Valley",
  vehicle: { make: "Toyota", model: "Tacoma" },
});
test("cached vehicles preserve geography and taxonomy without generating seller records", () => {
  assert.deepEqual(vehicleLandingReferences([card("marketcheck-dealer-1")]), [{
    createdAt: "2026-10-30T00:00:00Z",
    details: { city: "Boise", state: "ID", region: "Treasure Valley", vehicle_make: "Toyota", vehicle_model: "Tacoma" },
  }]);
});
test("duplicates and undated inventory cannot inflate landing eligibility", () => {
  assert.equal(vehicleLandingReferences([card("one"), card("one"), card("bad", "invalid")]).length, 1);
});
test("provider inventory keeps the five-listing and thirty-day gates", () => {
  const now = Date.parse("2026-11-01T00:00:00Z");
  const refs = vehicleLandingReferences(Array.from({length:5}, (_,i) => card(String(i))));
  assert.equal(isIndexablePlaceInventory(refs.length, refs[0].createdAt, now), true);
  assert.equal(isIndexablePlaceInventory(refs.length - 1, refs[0].createdAt, now), false);
  assert.equal(isIndexablePlaceInventory(refs.length, "2026-09-01T00:00:00Z", now), false);
});