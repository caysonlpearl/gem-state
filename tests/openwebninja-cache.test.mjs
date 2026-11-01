import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import ts from "typescript";
import { homesFromSavedSearches } from "../src/lib/openwebninja-cache.ts";
import { canonicalHomePropertyType } from "../src/lib/openwebninja-contract.ts";
import { matchesLandingCard } from "../src/lib/landing-card-pool.ts";
const now = Date.parse("2026-11-01T12:00:00Z");
const home = (id, city = "Twin Falls", mode = "rent", extra = {}) => ({
  id,
  address: "1 Main St",
  city,
  state: "ID",
  zip: "83301",
  propertyType: "Single Family",
  priceCents: 180000,
  beds: 3,
  baths: 2,
  sqft: 1500,
  imageUrl: "https://images.example/home.jpg",
  daysOnMarket: 1,
  latitude: null,
  longitude: null,
  mode,
  sourceUrl: null,
  isFeatured: false,
  openHouse: null,
  zestimate: null,
  rentZestimate: null,
  ...extra,
});
const row = (homes, mode = "rent", extra = {}) => ({
  cache_key: JSON.stringify({ v: 1, kind: "area-search", area: "magic-valley", mode }),
  payload: { homes },
  expires_at: "2026-11-10T12:00:00Z",
  ...extra,
});
test("saved regional and city searches deduplicate property ids using the newest saved copy and mode", () => {
  const rows = [
    row([home("1", "Twin Falls", "rent", { priceCents: 200000 })], "rent", {
      expires_at: "2026-11-12T12:00:00Z",
    }),
    row([home("1")]),
    row([home("1", "Twin Falls", "buy"), home("2", "Twin Falls", "buy")], "buy"),
    row([home("expired")], "rent", { expires_at: "2026-11-01T11:00:00Z" }),
    row([home("property")], "rent", { cache_key: JSON.stringify({ kind: "property", id: "5" }) }),
    row([home("bad-mode")], "buy"),
  ];
  const found = homesFromSavedSearches(rows, now);
  assert.equal(found.length, 2);
  assert.equal(found.find((h) => h.mode === "rent").priceCents, 200000);
  assert.ok(found.some((h) => h.mode === "buy"));
  assert.deepEqual(homesFromSavedSearches([], now), []);
});

function adapter(homes) {
  const source = readFileSync(
    new URL("../src/lib/openwebninja-listings.server.ts", import.meta.url),
    "utf8",
  );
  const exports = {};
  let reads = 0;
  const provider = new Proxy(
    {
      cachedHomes: async () => {
        reads++;
        return homes;
      },
    },
    {
      get(target, key) {
        if (key === "then") return undefined;
        if (key in target) return target[key];
        throw new Error("A public home read attempted a provider operation: " + String(key));
      },
    },
  );
  const compiled = ts.transpile(source, {
    target: ts.ScriptTarget.ES2022,
    module: ts.ModuleKind.CommonJS,
  });
  vm.runInNewContext(compiled, {
    exports,
    console,
    require(name) {
      if (name === "./openwebninja.server") return provider;
      if (name === "./landing-card-pool") return { matchesLandingCard };
      if (name === "./openwebninja-contract")
        return { canonicalHomePropertyType, listedAt: () => "2026-11-01T00:00:00Z" };
      throw new Error("Unexpected import " + name);
    },
  });
  return { exports, reads: () => reads };
}
test("generic SEO homes include both modes and every cached city without provider calls", async () => {
  const h = adapter([home("1"), home("2", "Boise", "buy"), home("3", "Filer")]);
  const input = { category: "other-real-estate", state: "ID" };
  assert.equal(h.exports.canIncludeOpenWebNinja(input), true);
  assert.equal((await h.exports.openWebNinjaCards(input)).length, 3);
  const rentals = await h.exports.openWebNinjaCards({
    ...input,
    homeTab: "rent",
    city: "Twin Falls",
    radiusMiles: 25,
  });
  assert.deepEqual(
    Array.from(rentals, (r) => r.id),
    ["openwebninja-1", "openwebninja-3"],
  );
  assert.equal(
    (
      await h.exports.openWebNinjaCards({
        ...input,
        homeTab: "buy",
        city: "Twin Falls",
        radiusMiles: 25,
      })
    ).length,
    0,
  );
  assert.equal(h.reads(), 3);
});
test("saved homes respect strict location, price, bedrooms, property and unsupported detail filters", async () => {
  const h = adapter([
    home("1"),
    home("2", "Boise", "buy"),
    home("3", "Twin Falls", "rent", { state: "UT" }),
  ]);
  const input = { category: "other-real-estate", homeTab: "rent", state: "ID", city: "Twin Falls" };
  assert.equal((await h.exports.openWebNinjaCards(input)).length, 1);
  assert.equal(
    (await h.exports.openWebNinjaCards({ ...input, homePropertyType: "Single-family home" }))
      .length,
    1,
  );
  for (const filter of [
    { priceMax: 1500 },
    { homeBedroomsMin: 4 },
    { homePropertyType: "Apartment" },
    { homeYearBuiltMin: 2020 },
    { state: "WA" },
  ])
    assert.equal(
      (await h.exports.openWebNinjaCards({ ...input, ...filter })).length,
      0,
      JSON.stringify(filter),
    );
  assert.equal((await h.exports.openWebNinjaCards({ ...input, category: "jobs" })).length, 0);
  assert.equal(h.exports.canIncludeOpenWebNinja({ ...input, homeTab: "build" }), false);
});
