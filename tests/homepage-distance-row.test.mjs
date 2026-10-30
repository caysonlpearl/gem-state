import test from "node:test";
import assert from "node:assert/strict";
import { homepageDistanceRow } from "../src/lib/homepage-distance-row.ts";
const card = (id, city, extra = {}) => ({ id, city, state: "ID", ...extra });
const cards = [
  card("shown", "Boise"),
  card("boise", "Boise"),
  card("boise-2", "BOISE"),
  card("twin", "Twin Falls"),
  card("twin", "Twin Falls"),
  card("lewiston", "Lewiston"),
  card("ut", "Logan", { state: "UT" }),
  card("shipping", "Boise", { externalMerchandise: {} }),
  card("unknown", ""),
];
test("statewide homepage offers multiple Idaho cities instead of requiring out-of-state inventory", () => {
  const row = homepageDistanceRow(cards, false, (c) => c.state === "ID", new Set(["shown"]));
  assert.equal(row.title, "Around Idaho");
  assert.deepEqual(
    row.listings.map((c) => c.id),
    ["boise", "twin", "lewiston", "boise-2"],
  );
  assert.deepEqual(row.search, { allCategories: true, state: "ID" });
});
test("a selected local area shows only Idaho inventory outside that area and clears the destination filter", () => {
  const row = homepageDistanceRow(cards, true, (c) => c.city.toLowerCase() === "boise", new Set());
  assert.equal(row.title, "Farther away");
  assert.deepEqual(
    row.listings.map((c) => c.id),
    ["twin", "lewiston"],
  );
  for (const key of ["city", "postalCode", "radiusMiles", "latitude", "longitude", "region"])
    assert.equal(key in row.search, false);
});
test("empty inventory is not invented, and prior row allocations stay intact", () => {
  const shown = new Set(["boise"]);
  const row = homepageDistanceRow([card("boise", "Boise")], false, () => true, shown);
  assert.deepEqual(row.listings, []);
  assert.deepEqual([...shown], ["boise"]);
});
