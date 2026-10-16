import test from "node:test";
import assert from "node:assert/strict";
import {
  MARKETCHECK_ID,
  dedupeMarketCheckImages,
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
    "https://images.example/third.jpg",
  ]);
});

test("normalizes FSBO search rows and preserves provider counts", () => {
  const result = normalizeMarketCheckSearch({ num_found: 3, listings: [payload] }, "fsbo");
  assert.equal(result.numFound, 3);
  assert.equal(result.listings[0].sourceKind, "fsbo");
  assert.equal(result.listings[0].id, "marketcheck-fsbo-VIN123-abc");
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
