import test from "node:test";
import assert from "node:assert/strict";
import { mixMobileSaleFeed, mobileSaleItem } from "../src/lib/mobile-sale-feed.ts";
import { mobileCachedSearch, mobileSearchPage } from "../src/lib/mobile-catalog.ts";
const card = (id, categorySlug, priceCents = 1000, discoverySellerKey = id) => ({
  id,
  title: id,
  categorySlug,
  categoryName: categorySlug,
  priceCents,
  createdAt: "2026-11-14T00:00:00Z",
  city: "Boise",
  state: "ID",
  imageUrl: null,
  discoverySellerKey,
});
const cars = Array.from({ length: 60 }, (_, i) =>
  card(`car-${i}`, "cars-trucks", (i + 1) * 1000, i < 30 ? "same-dealer" : `dealer-${i}`),
);
const things = [
  card("chair", "furniture", 2500),
  card("bike", "outdoor-sporting", 5000),
  card("drill", "tools-equipment", 3000),
];
test("a vehicle-heavy feed alternates categories and sellers, excludes work and stays deterministic across pages", () => {
  const input = [
    ...cars,
    ...things,
    card("work", "jobs"),
    card("cleaning", "services"),
    card("weapon", "firearms"),
    things[0],
  ];
  const result = mixMobileSaleFeed(input);
  assert.equal(result.length, 63);
  assert.equal(new Set(result.slice(0, 4).map((c) => c.categorySlug)).size, 4);
  assert.equal(
    result.filter((c) => c.categorySlug === "cars-trucks")[1].discoverySellerKey,
    "dealer-30",
  );
  assert.deepEqual(mixMobileSaleFeed(input), result);
  const first = result.slice(0, 24),
    second = mixMobileSaleFeed(input).slice(24, 48);
  assert(!first.some((c) => second.some((n) => n.id === c.id)));
  assert.equal(input.length, 67, "Input is not reordered or mutated");
});
test("permitted preferences influence an existing candidate without injecting unavailable or filtered records", () => {
  const result = mixMobileSaleFeed([...cars, ...things], ["missing", "chair", "car-40"]);
  assert.equal(result[0].id, "chair");
  assert.equal(result[1].id, "car-40");
  assert(!result.some((c) => c.id === "missing"));
  assert(!mobileSaleItem({ ...card("hidden-job", "general"), job: { employerName: "Test" } }));
});
test("cached fallback filters before mixing/paging and explicit price sort stays authoritative; dedicated jobs still work", () => {
  const now = Date.now();
  const snapshot = {
    sections: {
      all: {
        updatedAt: now,
        cards: [...cars, ...things, card("work", "jobs"), card("cleaning", "services")],
      },
    },
  };
  const mixed = mobileCachedSearch(snapshot, { priceMax: 50 }, now);
  assert(
    mixed.listings.every(
      (c) => c.priceCents <= 5000 && !["jobs", "services"].includes(c.categorySlug),
    ),
  );
  assert(mixed.listings.some((c) => c.id === "chair"));
  const sorted = mobileCachedSearch(snapshot, { sort: "price_low", priceMax: 50 }, now);
  assert.deepEqual(
    sorted.listings.map((c) => c.priceCents),
    [...sorted.listings.map((c) => c.priceCents)].sort((a, b) => a - b),
  );
  const jobs = mobileCachedSearch(snapshot, { category: "jobs" }, now);
  assert.deepEqual(
    jobs.listings.map((c) => c.id),
    ["work"],
  );
  assert.equal(
    mobileSearchPage({ listings: [card("work", "jobs")], page: 1, pageSize: 24, total: 1 }, {})
      .listings.length,
    0,
  );
  assert.equal(
    mobileSearchPage(
      { listings: [card("work", "jobs")], page: 1, pageSize: 24, total: 1 },
      { category: "jobs" },
    ).listings.length,
    1,
  );
});
