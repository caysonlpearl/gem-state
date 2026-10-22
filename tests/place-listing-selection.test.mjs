import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { selectPlaceListingCards } from "../src/lib/place-listing-selection.ts";

const cards = (categorySlug, count) =>
  Array.from({ length: count }, (_, i) => ({ id: `${categorySlug}-${i}`, categorySlug }));
test("broad place display does not let a recent provider batch hide other available categories", () => {
  const jobs = cards("jobs", 50);
  const home = cards("home-garden", 88);
  const collectibles = cards("collectibles", 18);
  const source = [...jobs, ...home, ...collectibles];
  const selected = selectPlaceListingCards(source, 24);
  assert.equal(selected.length, 24);
  assert.deepEqual(
    selected.slice(0, 6).map((x) => x.id),
    ["jobs-0", "home-garden-0", "collectibles-0", "jobs-1", "home-garden-1", "collectibles-1"],
  );
  for (const category of ["jobs", "home-garden", "collectibles"])
    assert.equal(selected.filter((x) => x.categorySlug === category).length, 8);
  assert.ok(
    selected.every((x) => source.includes(x)),
    "only real original cards returned",
  );
});
test("depleted small buckets fill remaining slots from available inventory", () => {
  const source = [...cards("pets", 2), ...cards("jobs", 100), ...cards("tools", 1)];
  const selected = selectPlaceListingCards(source, 24);
  assert.equal(selected.length, 24);
  assert.equal(selected.filter((x) => x.categorySlug === "jobs").length, 21);
  assert.deepEqual(
    selected.filter((x) => x.categorySlug === "jobs").map((x) => x.id),
    cards("jobs", 21).map((x) => x.id),
  );
});
test("single-category, empty and underfilled samples retain honest inventory", () => {
  assert.deepEqual(selectPlaceListingCards([], 24), []);
  const one = cards("jobs", 30);
  assert.deepEqual(selectPlaceListingCards(one, 24), one.slice(0, 24));
  const small = [...cards("tools", 2), ...cards("pets", 1)];
  assert.equal(selectPlaceListingCards(small, 24).length, 3);
});
test("input and card objects are not mutated; duplicate ids cannot occupy two slots", () => {
  const original = Object.freeze(cards("jobs", 3).map(Object.freeze));
  assert.deepEqual(selectPlaceListingCards(original, 2), original.slice(0, 2));
  const source = [original[0], { ...original[0], categorySlug: "tools" }, original[1]];
  assert.deepEqual(selectPlaceListingCards(source, 24), [original[0], original[1]]);
});
test("unknown categories are one stable bucket and invalid limits return no cards", () => {
  const source = [
    { id: "a" },
    { id: "b", categorySlug: null },
    { id: "c", categorySlug: "" },
    ...cards("tools", 2),
  ];
  assert.deepEqual(
    selectPlaceListingCards(source, 5).map((x) => x.id),
    ["a", "tools-0", "b", "tools-1", "c"],
  );
  for (const limit of [0, -1, 1.5, NaN, Infinity])
    assert.deepEqual(selectPlaceListingCards(source, limit), []);
  assert.deepEqual(selectPlaceListingCards(source, 1), [source[0]]);
});
test("only broad place pages diversify; category and vehicle pages keep existing order and schema shares displayed cards", () => {
  const source = readFileSync(
    new URL("../src/lib/place-pages.functions.ts", import.meta.url),
    "utf8",
  );
  assert.match(
    source,
    /listings:\s*place && !category\s*\? selectPlaceListingCards\(main\.listings, SHOWN_LISTINGS\)\s*: main\.listings\.slice\(0, SHOWN_LISTINGS\)/,
  );
  assert.equal((source.match(/selectPlaceListingCards\(main\.listings/g) || []).length, 1);
  assert.match(
    source.slice(source.indexOf("export const getVehiclePage")),
    /listings: main\.listings\.slice\(0, SHOWN_LISTINGS\)/,
  );
  const head = readFileSync(new URL("../src/lib/place-page-route.ts", import.meta.url), "utf8");
  assert.match(head, /listings: data\.regionGroups\.length[\s\S]*?: data\.listings/);
  const page = readFileSync(
    new URL("../src/components/classifieds/PlacePage.tsx", import.meta.url),
    "utf8",
  );
  assert.match(page, /data\.listings\.map\(/);
});
