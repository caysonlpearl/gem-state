import test from "node:test";
import assert from "node:assert/strict";
import {
  MARKETCHECK_ID,
  dedupeMarketCheckImages,
  freshMarketCheckInventory,
  marketCheckImages,
  normalizeMarketCheckListing,
  normalizeMarketCheckSearch,
  parseMarketCheckId,
} from "../src/lib/marketcheck-contract.ts";

const dealer = {
  id: 42,
  name: "Bluebird Motors",
  dealer_type: "independent",
  website: "dealer.example.com",
  street: "1 Main St",
  city: "Boise",
  state: "ID",
  zip: "83702",
  phone: "208-555-0100",
};

const payload = {
  id: "VIN123-abc",
  vin: "1HGBH41JXMN109186",
  heading: "2024 Toyota Camry XSE",
  price: 32995,
  msrp: 34500,
  fees: 499,
  price_includes_fees: false,
  ref_price: 33995,
  price_change_percent: -2.94,
  miles: 1200,
  dom: 21,
  dom_active: 14,
  dos_active: 12,
  seller_type: "dealer",
  inventory_type: "used",
  is_certified: 1,
  stock_no: "BB-123",
  vehicle_status: "Available",
  vdp_url: "http://dealer.example.com/cars/123",
  car_location: { seller_name: "Bluebird Motors", city: "Boise", state: "ID", zip: "83702" },
  media: {
    photo_links_cached: [
      "https://images.example/car.jpg?size=small",
      "https://images.example/car.jpg?size=large",
      "https://images.example/interior.jpg",
    ],
    photo_links: ["http://images.example/car.jpg", "https://images.example/third.jpg"],
  },
  dealer,
  build: {
    year: 2024,
    make: "Toyota",
    model: "Camry",
    trim: "XSE",
    body_type: "Sedan",
    transmission: "Automatic",
    drivetrain: "FWD",
    fuel_type: "Gasoline",
    engine: "2.5L I4",
    engine_size: 2.5,
    cylinders: 4,
    doors: 4,
    std_seating: "5",
    city_mpg: 28,
    highway_mpg: 39,
    powertrain_type: "Combustion",
  },
  extra: {
    seller_comments: "One owner, clean interior.",
    options: ["Sunroof"],
    features: ["Apple CarPlay"],
    high_value_features: ["Premium audio"],
    options_packages: ["Technology package"],
  },
  financing_options: { loan_term: 60, loan_apr: 6.9, estimated_monthly_payment: 650 },
  leasing_options: { lease_term: 36, estimated_monthly_payment: 499 },
  last_seen_at_date: "2026-10-15T12:00:00Z",
};

test("normalizes dealer listing details and retains the raw payload", () => {
  const listing = normalizeMarketCheckListing(payload, "dealer");
  assert.ok(listing);
  assert.equal(listing.id, "marketcheck-dealer-VIN123-abc");
  assert.equal(listing.location.city, "Boise");
  assert.equal(listing.location.state, "ID");
  assert.equal(listing.build.make, "Toyota");
  assert.equal(listing.build.engine, "2.5L I4");
  assert.equal(listing.extra.sellerComments, "One owner, clean interior.");
  assert.equal(listing.finance?.loanTerm, 60);
  assert.equal(listing.lease?.term, 36);
  assert.equal(listing.dealer?.name, "Bluebird Motors");
  assert.equal(listing.raw, payload);
  assert.deepEqual(marketCheckImages(listing), [
    "https://images.example/car.jpg?size=small",
    "https://images.example/interior.jpg",
  ]);
});

test("normalizes FSBO search rows and preserves provider counts", () => {
  const result = normalizeMarketCheckSearch({ num_found: 3, listings: [payload] }, "fsbo");
  assert.equal(result.numFound, 3);
  assert.equal(result.listings[0].sourceKind, "fsbo");
  assert.equal(result.listings[0].id, "marketcheck-fsbo-VIN123-abc");
  assert.equal(result.listings[0].dealer, null);
  assert.equal(result.listings[0].sellerType, "Private seller");
});

test("deduplicates image variants while preserving distinct photos", () => {
  assert.deepEqual(
    dedupeMarketCheckImages([
      "http://images.example/a.jpg?width=320",
      "https://images.example/a.jpg?width=1280",
      "https://images.example/b.jpg",
    ]),
    ["https://images.example/a.jpg?width=320", "https://images.example/b.jpg"],
  );
});

test("validates partner IDs", () => {
  assert.ok(MARKETCHECK_ID.test("marketcheck-dealer-VIN123-abc"));
  assert.ok(MARKETCHECK_ID.test("marketcheck-fsbo-123"));
  assert.deepEqual(parseMarketCheckId("marketcheck-fsbo-123"), {
    sourceKind: "fsbo",
    providerId: "123",
  });
  assert.equal(parseMarketCheckId("marketcheck-auction-123"), null);
});

test("never sends key-bearing photo links and fills a private seller's city", async () => {
  const { normalizeMarketCheckListing, marketCheckImages, finalizeMarketCheckListing } =
    await import("../src/lib/marketcheck-contract.ts");
  const listing = normalizeMarketCheckListing(
    {
      id: "VIN1-abc",
      heading: "2004 Toyota Prius",
      media: {
        photo_links: ["https://images.craigslist.org/a_1200x900.jpg"],
        photo_links_cached: ["https://api.marketcheck.com/v2/image/cache/car/x/1?api_key=mc_live_secret"],
      },
      dealer: { name: "Private Seller", city: "Moscow", state: "ID", zip: "83844" },
    },
    "fsbo",
  );
  assert.deepEqual(marketCheckImages(listing), ["https://images.craigslist.org/a_1200x900.jpg"]);
  assert.ok(!JSON.stringify(listing.media).includes("api_key"));
  assert.equal(listing.location.city, "Moscow");
  assert.equal(listing.location.state, "ID");
  assert.equal(listing.dealer, null);

  // Listings cached before the fix are cleaned on the way out.
  const stale = {
    ...listing,
    location: { ...listing.location, city: "", state: "" },
    media: { photoLinks: listing.media.photoLinks, photoLinksCached: ["https://x.test/1?api_key=k"] },
    raw: { dealer: { city: "Viola", state: "ID" } },
  };
  const fixed = finalizeMarketCheckListing(stale);
  assert.equal(fixed.location.city, "Viola");
  assert.deepEqual(fixed.media.photoLinksCached, []);
});

test("reassembles a complete fresh inventory from one cache read", async () => {
  const expiresAt = "2026-10-21T00:00:00.000Z";
  const rows = [
    {
      cache_key: JSON.stringify({ v: 3, kind: "dealer", state: "ID", start: 0 }),
      expires_at: expiresAt,
      payload: { num_found: 1, listings: [payload] },
    },
  ];
  const listings = freshMarketCheckInventory(rows, "ID", "dealer", {
    pages: 6,
    pageSize: 50,
    now: Date.parse("2026-10-20T12:00:00Z"),
  });
  assert.equal(listings?.length, 1);
  assert.equal(listings?.[0]?.location.state, "ID");
});

test("falls back to the per-page refresh when a fresh inventory is incomplete", async () => {
  const expiresAt = "2026-10-21T00:00:00.000Z";
  const fullPage = Array.from({ length: 50 }, () => payload);
  const rows = [
    {
      cache_key: JSON.stringify({ v: 3, kind: "dealer", state: "ID", start: 0 }),
      expires_at: expiresAt,
      payload: { numFound: 51, listings: fullPage },
    },
  ];
  assert.equal(
    freshMarketCheckInventory(rows, "ID", "dealer", {
      pages: 6,
      pageSize: 50,
      now: Date.parse("2026-10-20T12:00:00Z"),
    }),
    null,
  );
});

test("keeps cache-page order and ignores other states, providers, and out-of-range pages", () => {
  const expiresAt = "2026-10-21T00:00:00.000Z";
  const pagePayload = (id, heading) => ({ ...payload, id, vin: `${id}-VIN`, heading });
  const rows = [
    {
      cache_key: JSON.stringify({ v: 3, kind: "dealer", state: "ID", start: 2 }),
      expires_at: expiresAt,
      payload: { numFound: 3, listings: [pagePayload("C", "Third page")] },
    },
    {
      cache_key: JSON.stringify({ v: 3, kind: "fsbo", state: "ID", start: 2 }),
      expires_at: expiresAt,
      payload: { numFound: 3, listings: [pagePayload("X", "Wrong provider")] },
    },
    {
      cache_key: JSON.stringify({ v: 3, kind: "dealer", state: "CA", start: 0 }),
      expires_at: expiresAt,
      payload: { numFound: 1, listings: [pagePayload("Y", "Wrong state")] },
    },
    {
      cache_key: JSON.stringify({ v: 3, kind: "dealer", state: "ID", start: 0 }),
      expires_at: expiresAt,
      payload: {
        numFound: 3,
        listings: [pagePayload("A", "First page"), pagePayload("B", "Second page")],
      },
    },
    {
      cache_key: JSON.stringify({ v: 3, kind: "dealer", state: "ID", start: 4 }),
      expires_at: expiresAt,
      payload: { numFound: 1, listings: [pagePayload("Z", "Out of range")] },
    },
  ];
  const listings = freshMarketCheckInventory(rows, "ID", "dealer", {
    pages: 2,
    pageSize: 2,
    now: Date.parse("2026-10-20T12:00:00Z"),
  });
  assert.deepEqual(
    listings?.map((listing) => listing.heading),
    ["First page", "Second page", "Third page"],
  );
});

test("falls back when any required page is stale or a cache key is duplicated", () => {
  const pagePayload = (id) => ({ ...payload, id, vin: `${id}-VIN` });
  const staleRows = [
    {
      cache_key: JSON.stringify({ v: 3, kind: "dealer", state: "ID", start: 0 }),
      expires_at: "2026-10-21T00:00:00.000Z",
      payload: { numFound: 51, listings: Array.from({ length: 50 }, () => pagePayload("A")) },
    },
    {
      cache_key: JSON.stringify({ v: 3, kind: "dealer", state: "ID", start: 50 }),
      expires_at: "2026-10-20T11:59:00.000Z",
      payload: { numFound: 51, listings: [pagePayload("B")] },
    },
  ];
  assert.equal(
    freshMarketCheckInventory(staleRows, "ID", "dealer", {
      pages: 2,
      pageSize: 50,
      now: Date.parse("2026-10-20T12:00:00Z"),
    }),
    null,
  );

  const duplicateRows = [
    staleRows[0],
    { ...staleRows[0], payload: { numFound: 51, listings: [pagePayload("C")] } },
  ];
  assert.equal(
    freshMarketCheckInventory(duplicateRows, "ID", "dealer", {
      pages: 2,
      pageSize: 50,
      now: Date.parse("2026-10-20T12:00:00Z"),
    }),
    null,
  );
});
