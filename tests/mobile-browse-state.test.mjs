import test from "node:test";
import assert from "node:assert/strict";
import {
  browseLocation,
  browseDestination,
  browseApiQuery,
  savedSearchDestination,
} from "../apps/mobile/src/browse-state.ts";
import { savedSearchBrowseInput } from "../src/lib/saved-search-contract.ts";

test("saved searches open without dropping meaningful legacy or unknown conditions", () => {
  const url = savedSearchDestination(
    {
      category: "other-real-estate",
      homeBedroomsMin: 3,
      homeAmenities: "Pool",
      mobileCatalog: true,
    },
    "saved-one",
  );
  const state = browseLocation("#" + url);
  assert.equal(state.params.get("homeBedroomsMin"), "3");
  assert.equal(state.params.get("homeAmenities"), "Pool");
  assert.equal(state.params.get("mobileCatalog"), null);
  assert.equal(state.search.bedrooms, "3+");
  const changed = browseLocation("#" + browseDestination({ sort: "price_low" }, state.params));
  assert.equal(changed.params.get("homeBedroomsMin"), "3");
  assert.equal(changed.params.get("homeAmenities"), "Pool");
  assert(
    savedSearchBrowseInput(Object.fromEntries(browseApiQuery(changed.params))).unsupported.includes(
      "homeAmenities",
    ),
  );
});
test("explicit field/category edits clear obsolete aliases while keeping unrelated filters", () => {
  const old = new URLSearchParams({
    category: "other-real-estate",
    homeBedroomsMin: "3",
    city: "Boise",
  });
  const changed = browseLocation("#" + browseDestination({ bedrooms: "4+" }, old));
  assert.equal(changed.params.get("homeBedroomsMin"), null);
  assert.equal(changed.search.bedrooms, "4+");
  assert.equal(changed.search.city, "Boise");
  const cars = browseLocation(
    "#" + browseDestination({ category: "cars-trucks", make: "Ford" }, old),
  );
  assert.equal(cars.params.get("bedrooms"), null);
  assert.equal(cars.params.get("homeBedroomsMin"), null);
  assert.equal(cars.search.make, "Ford");
  assert.equal(cars.search.city, "Boise");
});
test("native query metadata cannot override catalog scope and preserves website home defaults", () => {
  const query = browseApiQuery(
    new URLSearchParams({
      category: "other-real-estate",
      savedSearchId: "one",
      mobileCatalog: "false",
    }),
  );
  assert.equal(query.get("homeTab"), "buy");
  assert.equal(query.has("savedSearchId"), false);
  assert.equal(query.has("mobileCatalog"), false);
  const legacy = browseLocation("#/search?category=other-real-estate&homeMode=rent");
  assert.equal(legacy.search.homeTab, "rent");
});

test("serializing a full search record never strips conflicting or unknown conditions", () => {
  const raw = {
    category: "other-real-estate",
    homeBedroomsMin: "4",
    bedrooms: "3+",
    make: "Ford",
    futureFilter: "required",
  };
  const url = browseDestination(raw);
  const next = browseLocation("#" + url);
  for (const [key, value] of Object.entries(raw)) assert.equal(next.params.get(key), value);
});

test("legacy restricted-category aliases cannot expose native browse forms", () => {
  for (const key of ["category", "categorySlug", "section"])
    assert.equal(browseLocation(`#/search?${key}=firearms`).eligible, false);
  assert.equal(browseLocation("#/search?category=all").eligible, true);
});
