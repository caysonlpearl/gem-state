import test from "node:test";
import assert from "node:assert/strict";
import { homeMapLocation, homePriceCut, homeRecommendationRows } from "../src/lib/home-shopping.ts";

test("public home addresses pin the property while private sellers keep a city-level map", () => {
  const listing = {
    title: "14379 N Pristine Cir",
    city: "Rathdrum",
    state: "ID",
    postalCode: "83858",
  };
  assert.equal(homeMapLocation(listing).exact, false);
  assert.equal(decodeURIComponent(homeMapLocation(listing).query), "Rathdrum, ID, 83858");
  const mapped = homeMapLocation({ ...listing, externalHome: { address: listing.title } });
  assert.equal(mapped.exact, true);
  assert.equal(decodeURIComponent(mapped.query), "14379 N Pristine Cir, Rathdrum, ID, 83858");
  assert.equal(
    decodeURIComponent(
      homeMapLocation({
        ...listing,
        title: "A cabin",
        externalHome: { latitude: 47.8, longitude: -116.9 },
      }).query,
    ),
    "47.8,-116.9",
  );
});

test("price-cut badge uses current listing reductions, never an old sale or unrelated high price", () => {
  assert.deepEqual(
    homePriceCut(40990000, [
      { label: "Listed for sale", amount: 425500, date: "2026-08-18" },
      { label: "Price change", amount: 409900, date: "2026-09-18" },
    ]),
    { amount: 15600, date: "2026-09-18" },
  );
  assert.equal(
    homePriceCut(40000000, [{ label: "Last recorded sale", amount: 450000, date: "2024-01-01" }]),
    null,
  );
  assert.equal(
    homePriceCut(40000000, [
      { label: "Price change", amount: 400000, date: "2026-09-18" },
      { label: "Sold", amount: 450000, date: "2026-01-01" },
      { label: "Listed", amount: 500000, date: "2025-01-01" },
    ]),
    null,
  );
  assert.equal(homePriceCut(45000000, [{ label: "Original list price", amount: 400000 }]), null);
  assert.deepEqual(homePriceCut(40000000, [{ label: "Original list price", amount: 425000 }]), {
    amount: 25000,
    date: null,
  });
});

test("home recommendations preserve sale/rental mode, local priority, similarity and distinct rows", () => {
  const current = {
    id: "current",
    title: "1 Main St",
    city: "Rathdrum",
    state: "ID",
    priceCents: 45000000,
    home: { mode: "buy", bedrooms: 3, squareFeet: 1600 },
  };
  const make = (id, patch = {}) => ({ ...current, id, title: `123 ${id} Oak St`, ...patch });
  const pool = [
    current,
    make("near", { priceCents: 46000000 }),
    make("mansion", { priceCents: 400000000 }),
    make("other-state", { state: "UT" }),
    make("rent", { home: { ...current.home, mode: "rent" } }),
    ...Array.from({ length: 18 }, (_, i) =>
      make(`id-${i}`, { city: "Boise", priceCents: 45000000 + i * 100000 }),
    ),
  ];
  pool.push({ ...pool[1], id: "same-address" });
  const { similar, moreHomes } = homeRecommendationRows(current, pool);
  assert.equal(similar[0].id, "near");
  const all = [...similar, ...moreHomes];
  assert.equal(all.length, 16);
  assert.equal(new Set(all.map((x) => x.id)).size, 16);
  assert.ok(!all.some((x) => ["current", "rent", "other-state", "same-address"].includes(x.id)));
});
