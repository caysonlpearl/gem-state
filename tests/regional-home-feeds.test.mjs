import test from "node:test";
import assert from "node:assert/strict";
import {
  HOME_FEED_REGIONS,
  homeFeedRegion,
  homeInRegionalFeed,
  homeAddressIdentity,
  homeFeedCapacity,
  homeSearchReserve,
} from "../src/lib/home-feed-regions.ts";
import { normalizeRedfinResult, normalizeRedfinProperty } from "../src/lib/redfin-contract.ts";

test("a Redfin rental search cannot relabel sale prices as monthly rent", () => {
  const sale = {
    property_id: "104797099",
    street_address: "12311 N Pebble Creek Dr",
    city: "Hayden",
    state: "ID",
    price: 1549000,
    search_status: "ACTIVE",
    mls_status: "Active",
  };
  assert.equal(normalizeRedfinResult({ data: { results: [sale] } }, "buy").homes.length, 1);
  assert.equal(normalizeRedfinResult({ data: { results: [sale] } }, "rent").homes.length, 0);
  for (const status of ["FOR_RENT", "For Rent", "for-lease"]) {
    const rental = { ...sale, price: 1800, search_status: status };
    const result = normalizeRedfinResult({ data: { results: [rental] } }, "rent");
    assert.equal(result.homes.length, 1);
    assert.equal(result.homes[0].priceCents, 180000);
    assert.equal(result.homes[0].mode, "rent");
  }
});
import {
  hasCompleteHomeDetails,
  propertyCacheFresh,
  propertyCacheFetchedAt,
  HOME_DETAIL_REFRESH_MS,
} from "../src/lib/openwebninja-cache.ts";
import { OPENWEBNINJA_ID } from "../src/lib/openwebninja-contract.ts";
const home = (city, extra = {}) => ({
  id: "1",
  address: "1 Main St",
  city,
  state: "ID",
  latitude: null,
  longitude: null,
  ...extra,
});
test("each selected region has exactly one provider, including Pocatello in Eastern Idaho", () => {
  assert.deepEqual(
    HOME_FEED_REGIONS.map((r) => r.provider),
    ["zillow", "realestate", "redfin"],
  );
  for (const [city, provider] of [
    ["Boise", "zillow"],
    ["Meridian", "zillow"],
    ["Caldwell", "zillow"],
    ["Idaho Falls", "realestate"],
    ["Pocatello", "realestate"],
    ["Rexburg", "realestate"],
    ["Coeur d'Alene", "redfin"],
    ["Sandpoint", "redfin"],
  ])
    assert.equal(homeFeedRegion(home(city)).provider, provider);
  for (const city of ["Twin Falls", "Lewiston"]) assert.equal(homeFeedRegion(home(city)), null);
  assert.equal(homeFeedRegion(home("Boise", { state: "OR" })), null);
  assert.equal(homeInRegionalFeed(home("Boise", { provider: "redfin", id: "redfin-1" })), false);
  assert.equal(homeInRegionalFeed(home("Sandpoint", { provider: "redfin", id: "redfin-1" })), true);
});
test("configured search polygons do not overlap", () => {
  for (let i = 0; i < HOME_FEED_REGIONS.length; i++)
    for (let j = i + 1; j < HOME_FEED_REGIONS.length; j++) {
      const a = HOME_FEED_REGIONS[i].bounds,
        b = HOME_FEED_REGIONS[j].bounds;
      assert.equal(
        a.west < b.east && b.west < a.east && a.south < b.north && b.south < a.north,
        false,
      );
    }
});
test("address identities deduplicate source aliases without merging separate units", () => {
  const a = home("Boise", { address: "111 North Main Street Apt #1" }),
    b = home("Boise", { address: "111 N Main St UNIT 1" });
  assert.equal(homeAddressIdentity(a), homeAddressIdentity(b));
  assert.notEqual(
    homeAddressIdentity(a),
    homeAddressIdentity({ ...b, address: "111 N Main St UNIT 2" }),
  );
});
test("300 monthly calls cover 40 search refreshes and 260 detail attempts, not 300 full homes", () => {
  const plan = homeFeedCapacity();
  assert.equal(plan.totalSearchCalls, 40);
  assert.equal(plan.totalDetailCalls, 260);
  assert.equal(plan.estimatedUsableHomes, 234);
  assert.deepEqual(
    plan.regions.map((r) => r.detailCalls),
    [85, 85, 90],
  );
});
test("Redfin search IDs are namespaced, unit numbers are retained, and inactive records are excluded", () => {
  const result = normalizeRedfinResult(
    {
      status: "OK",
      data: {
        results: [
          {
            property_id: "123",
            street_address: "111 Main St",
            unit_number: "1",
            city: "Sandpoint",
            state: "ID",
            zip_code: "83864",
            price: 300000,
            beds: 2,
            baths: 1,
            sqft: 1000,
            listing_url: "/ID/Sandpoint/111-Main-St-83864/home/123",
          },
          {
            property_id: "456",
            street_address: "2 Main St",
            city: "Sandpoint",
            state: "ID",
            price: 400000,
            search_status: "SOLD",
          },
        ],
      },
    },
    "buy",
  );
  assert.equal(result.homes.length, 1);
  assert.equal(result.homes[0].id, "redfin-123");
  assert.equal(result.homes[0].address, "111 Main St UNIT 1");
  assert.ok(OPENWEBNINJA_ID.test("openwebninja-redfin-123"));
  assert.match(result.homes[0].sourceUrl, /^https:\/\/www.redfin.com\//);
  assert.throws(() => normalizeRedfinResult({ status: "ERROR" }, "buy"), /unavailable/);
});
test("Redfin units already included in the street or unit field are not repeated", () => {
  for (const street of ["111 Main St", "111 Main St Unit B"])
    for (const unit of ["B", "Unit B", "#B"]) {
      const result = normalizeRedfinResult(
        {
          data: {
            results: [
              {
                property_id: "123",
                street_address: street,
                unit_number: unit,
                city: "Sandpoint",
                state: "ID",
                price: 300000,
              },
            ],
          },
        },
        "buy",
      );
      assert.equal(homeAddressIdentity(result.homes[0]), "ID|SANDPOINT|111 MAIN ST UNIT B");
    }
});
test("Redfin full records retain actual photos, descriptions, facts, history and attribution", () => {
  const detail = normalizeRedfinProperty({
    data: {
      property_id: "123",
      url: "/ID/Sandpoint/1-Main-St/home/123",
      beds: 3,
      baths: 2,
      sqft: 1600,
      year_built: 2001,
      property_type: "6",
      public_description: "Actual provider description.",
      photos: [{ url: "https://example.com/1.jpg" }, { url: "https://example.com/2.jpg" }],
      amenity_groups: [
        {
          title: "Interior",
          groups: [{ title: "Heating", entries: [{ name: "Heating", values: ["Forced Air"] }] }],
        },
      ],
      listing_agent: { name: "Test Agent" },
      listing_broker: { name: "Test Brokerage" },
      mls_name: "Test MLS",
      tax_history: [{ year: 2025, taxes: 1200, assessed_value: 250000 }],
      price_history: [{ date: "2026-11-01", event: "Listed", price: 300000 }],
      redfin_estimate: 310000,
    },
  });
  assert.equal(hasCompleteHomeDetails(detail), true);
  assert.equal(detail.description, "Actual provider description.");
  assert.equal(detail.images.length, 2);
  assert.equal(detail.yearBuilt, 2001);
  assert.match(detail.heating, /Forced Air/);
  assert.equal(detail.listedBy.agentName, "Test Agent");
  assert.equal(detail.taxHistory[0].amount, 1200);
  assert.equal(
    detail.propertyType,
    null,
    "undocumented numeric type codes must not be shown as labels",
  );
  assert.equal(
    detail.zestimate,
    null,
    "Redfin estimates must not be mislabeled as Zillow estimates",
  );
});
test("monthly freshness reuses recent legacy details but rejects stale and future-dated caches", () => {
  const now = Date.now(),
    legacy = (id) => JSON.stringify({ v: 3, kind: "property", id }),
    current = (id) => JSON.stringify({ v: 4, kind: "property", id });
  const row = (key, age, ttl) => ({
    cache_key: key,
    expires_at: new Date(now - age * 86400000 + ttl).toISOString(),
  });
  assert.equal(propertyCacheFresh(row(legacy("1"), 15, 365 * 86400000), now), true);
  assert.equal(propertyCacheFresh(row(legacy("1"), 32, 365 * 86400000), now), false);
  assert.equal(propertyCacheFresh(row(current("1"), 1, HOME_DETAIL_REFRESH_MS), now), true);
  assert.equal(propertyCacheFresh(row(current("1"), 32, HOME_DETAIL_REFRESH_MS), now), false);
  assert.equal(propertyCacheFresh(row(current("1"), -1, HOME_DETAIL_REFRESH_MS), now), false);
  assert.equal(propertyCacheFetchedAt({ cache_key: "bad-json" }), 0);
});

test("future weekly search credits stay protected even after repeated failed attempts", () => {
  const region = HOME_FEED_REGIONS[0],
    keys = new Set(["buy-1", "buy-2", "rent-1"]),
    now = Date.now();
  const request = (key, age) => ({
    cache_key: key,
    created_at: new Date(now - age * 86400000).toISOString(),
  });
  assert.equal(
    homeSearchReserve(
      region,
      [request("buy-1", 0), request("buy-1", 1), request("buy-1", 2)],
      keys,
      now,
    ),
    14,
  );
  const all = [...keys].flatMap((key) => [0, 7, 14, 21, 28].map((age) => request(key, age)));
  assert.equal(homeSearchReserve(region, all, keys, now), 0);
});

test("regional searches stay authoritative when expired, so legacy inventory cannot reappear", async () => {
  const { homesFromSavedSearches } = await import("../src/lib/openwebninja-cache.ts");
  const now = Date.now();
  const legacy = {
    cache_key: '{"v":1,"kind":"area-search","area":"treasure-valley","mode":"buy"}',
    payload: { homes: [{ ...home("Boise"), mode: "buy" }] },
    expires_at: new Date(now + 10 * 86400000).toISOString(),
  };
  assert.equal(homesFromSavedSearches([legacy], now).length, 1);
  assert.equal(homesFromSavedSearches([legacy], now, new Set(["treasure-valley"])).length, 0);
  const fresh = {
    cache_key: '{"v":3,"kind":"area-search","area":"treasure-valley","mode":"buy"}',
    payload: { homes: [{ ...home("Boise"), mode: "buy", priceCents: 35000000 }] },
    expires_at: new Date(now + 8 * 86400000).toISOString(),
  };
  assert.equal(
    homesFromSavedSearches([legacy, fresh], now, new Set(["treasure-valley"]))[0].priceCents,
    35000000,
  );
});
