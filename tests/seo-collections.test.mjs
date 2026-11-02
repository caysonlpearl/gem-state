import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import ts from "typescript";
import * as config from "../src/config/classifieds.ts";
import * as policy from "../src/lib/seo-policy.ts";
import * as collections from "../src/lib/seo-collections.ts";
import { matchesLandingCard } from "../src/lib/landing-card-pool.ts";
import { regionOfListing } from "../src/lib/market-stats.ts";
import { isIndexablePartnerDetail } from "../src/lib/partner-seo.ts";
const compile = (file, deps) => {
  const exports = {};
  vm.runInNewContext(
    ts.transpile(readFileSync(new URL(file, import.meta.url), "utf8"), {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
    }),
    {
      exports,
      console,
      require(name) {
        assert.ok(deps[name], name);
        return deps[name];
      },
    },
  );
  return exports;
};
const places = compile("../src/lib/place-pages.ts", {
  "@/config/classifieds": config,
  "@/lib/seo-policy": policy,
  "./seo-collections": collections,
});
const landings = compile("../src/lib/landing-pages.server.ts", {
  "@/lib/place-pages": places,
  "@/config/classifieds": config,
  "@/lib/classifieds.functions": { isReleaseQaListing: () => false },
  "@/lib/seo-policy": policy,
  "@/lib/listing-url": { listingPath: () => "/" },
  "@/lib/market-stats": { regionOfListing },
  "./seo-collections": collections,
});
const base = {
  id: "1",
  title: "Listing",
  priceCents: 100,
  city: "Boise",
  state: "ID",
  region: "Treasure Valley",
  createdAt: "2026-11-01",
  vehicle: null,
};

test("maintenance warming is bounded and rotates through only supported public pages", () => {
  const seen = new Set();
  for (let slot = 0; slot < 100; slot++) {
    const targets = collections.seoPrewarmTargets(slot * 15 * 60_000);
    assert.equal(targets.length, 2);
    for (const target of targets) {
      assert.equal(places.isKnownPlacePage(target.place, target.category), true);
      seen.add(`${target.place}:${target.category}`);
    }
  }
  for (const key of [
    "boise:cars-trucks",
    "idaho-falls:cars-trucks",
    "twin-falls:houses-for-rent",
    "boise:plumbers",
    "rentals:",
  ])
    assert.ok(seen.has(key), key);
});

test("the installed quarter-hour cadence reaches every target before the six-hour stale limit", () => {
  const expected = new Set([
    "boise:cars-trucks",
    "idaho-falls:cars-trucks",
    "homes:",
    "services:",
    ...collections.seoCollections.flatMap((collection) => [
      `${collection.slug}:`,
      ...collection.cities.map((city) => `${places.placeSlug(city)}:${collection.slug}`),
    ]),
  ]);
  // Start midway through the rotation, not at the first configured page.
  const start = Date.parse("2026-11-02T00:37:00Z");
  const seen = new Set();
  for (let minutes = 0; minutes < 240; minutes += 15) {
    for (const target of collections.seoPrewarmTargets(start + minutes * 60_000))
      seen.add(`${target.place}:${target.category}`);
  }
  assert.deepEqual([...seen].sort(), [...expected].sort());
});

test("the finite collection URLs resolve without collapsing onto their parent categories", () => {
  for (const c of collections.seoCollections) {
    const category = places.categoryFromUrlSlug(c.slug);
    assert.equal(category.slug, c.category);
    assert.equal(places.resolvedCategoryUrlSlug(category), c.slug);
    assert.equal(places.isKnownPlacePage(c.slug), true);
    for (const city of c.cities)
      assert.equal(places.isKnownPlacePage(places.placeSlug(city), c.slug), true);
  }
  assert.equal(places.isKnownPlacePage("star", "plumbers"), false);
  assert.equal(places.isKnownPlacePage("treasure-valley", "houses-for-rent"), false);
  assert.equal(places.isKnownPlacePage("../private", "rentals"), false);
  assert.equal(places.isKnownPlacePage("boise", "made-up-filter"), false);
});

test("sitemap collection predicates agree with browse filtering across sale, rental, trade and job evidence", () => {
  const cards = [
    {
      ...base,
      categorySlug: "other-real-estate",
      home: { mode: "buy", propertyType: "Single-family home" },
    },
    {
      ...base,
      categorySlug: "other-real-estate",
      home: { mode: "rent", propertyType: "Single-family home" },
    },
    {
      ...base,
      categorySlug: "other-real-estate",
      home: { mode: "rent", propertyType: "Apartment" },
    },
    {
      ...base,
      categorySlug: "services",
      service: { subcategory: "Plumbers" },
      directory: { trades: ["Plumbers"] },
    },
    {
      ...base,
      categorySlug: "services",
      service: { subcategory: "House Cleaning" },
      directory: { trades: ["House Cleaning"] },
    },
    { ...base, categorySlug: "jobs", job: { employmentType: "Part-time" } },
    { ...base, categorySlug: "jobs", job: { employmentType: "Full-time" } },
  ];
  for (const c of collections.seoCollections)
    for (const card of cards)
      assert.equal(
        collections.collectionMatches(c, card),
        matchesLandingCard(card, c.filters),
        c.slug + " " + card.categorySlug,
      );
});

test("the same real city radius and home mode qualify sitemap collections", () => {
  const details = {
    city: "Filer",
    state: "ID",
    region: "Magic Valley",
    vehicle_make: null,
    vehicle_model: null,
    home_mode: "rent",
    home_property_type: "Single-family home",
  };
  const paths = landings.landingPathsFor("other-real-estate", details).map((x) => x.path);
  assert.ok(paths.includes("/idaho/twin-falls/houses-for-rent"));
  assert.ok(!paths.includes("/idaho/boise/houses-for-rent"));
  assert.ok(!paths.includes("/idaho/homes-for-sale"));
  assert.equal(
    landings.landingPathsFor("other-real-estate", { ...details, state: "UT" }).length,
    0,
  );
  const sale = landings
    .landingPathsFor("other-real-estate", { ...details, home_mode: "buy" })
    .map((x) => x.path);
  assert.ok(sale.includes("/idaho/homes-for-sale"));
  assert.ok(!sale.includes("/idaho/rentals"));
});

test("unclaimed businesses need verified useful facts; ownership alone is not an exclusion", () => {
  const now = Date.parse("2026-11-01T12:00:00Z");
  const business = {
    ...base,
    service: { businessAddress: "1 Main St, Boise, ID", serviceSummary: "", offerings: [] },
    directory: {
      claimed: false,
      address: "1 Main St",
      trades: ["Plumbers"],
      phone: "2085550100",
      website: null,
      hours: [{ day: "Monday", hours: "9–5" }],
      verifiedAt: "2026-10-30T12:00:00Z",
    },
  };
  assert.equal(isIndexablePartnerDetail(business, now), true);
  for (const extra of [
    { verifiedAt: null },
    { verifiedAt: "2025-01-01" },
    { address: null },
    { phone: null, website: null },
    { hours: [] },
  ])
    assert.equal(
      isIndexablePartnerDetail(
        { ...business, directory: { ...business.directory, ...extra } },
        now,
      ),
      false,
      JSON.stringify(extra),
    );
  assert.equal(
    isIndexablePartnerDetail({ ...business, externalJob: { url: "https://example.com" } }, now),
    false,
  );
});
