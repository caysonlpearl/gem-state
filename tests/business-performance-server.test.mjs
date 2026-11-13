import { loadStaffTrafficExclusions } from "../src/lib/traffic-exclusions.server.ts";
import test from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import { readFileSync } from "node:fs";
import ts from "typescript";
import * as contract from "../src/lib/business-performance.ts";

test("reports use cached inventory, retain removed listings, and only persist changed attribution", async () => {
  const tables = {
    dealer_profiles: [
      {
        id: "mass",
        slug: "mass-motors-fairview",
        display_name: "M.A.S.S. Motors Fairview",
        city: "Boise",
        state: "ID",
        postal_code: "83713",
        website: "https://massmotors.com",
        owner_user_id: "owner",
      },
    ],
    user_roles: [{ user_id: "admin", role: "admin" }],
    dealer_members: [],
    seller_profiles: [],
    business_performance_entities: [],
    business_listing_attribution: [],
    business_sales_assumptions: [],
    business_tracking_release: [{ id: true, tracking_started_at: "2026-11-12T18:00:00Z" }],
    asks: [],
    analytics_events: [],
  };
  let writes = 0;
  const db = {
    from(table) {
      assert.ok(table in tables, table);
      let start = 0,
        end = 499,
        single = false;
      const filters = [];
      const query = {
        select: () => query,
        order: () => query,
        in: (column, values) => {
          filters.push((row) => values.includes(row[column]));
          return query;
        },
        or: (filter) => {
          if (table === "asks") return query;
          assert.match(filter, /name.in.*business_listing_clicked/);
          assert.match(filter, /user_id.in.*admin/);
          assert.match(filter, /user_id.in.*owner/);
          return query;
        },
        eq: () => query,
        gte: () => query,
        lt: () => query,
        not: () => query,
        range(a, b) {
          start = a;
          end = b;
          return query;
        },
        single() {
          single = true;
          return query;
        },
        async upsert(rows) {
          writes++;
          const key = table === "business_performance_entities" ? "business_key" : "listing_id";
          for (const row of rows) {
            const old = tables[table].findIndex((r) => r[key] === row[key]);
            if (old >= 0) tables[table][old] = row;
            else tables[table].push(row);
          }
          return { error: null };
        },
        then(resolve, reject) {
          return Promise.resolve({
            data: single
              ? tables[table][0]
              : tables[table]
                  .filter((row) => filters.every((filter) => filter(row)))
                  .slice(start, end + 1),
            error: null,
          }).then(resolve, reject);
        },
      };
      return query;
    },
  };
  let api = [
    {
      id: "marketcheck-dealer-42",
      title: "2024 Forester",
      city: "Boise",
      state: "ID",
      externalVehicle: {
        sourceKind: "dealer",
        dealer: {
          id: 100,
          name: "Mass Motors Fairview",
          website: "https://massmotors.com",
          city: "Boise",
          state: "ID",
          zip: "83713",
        },
      },
    },
  ];
  const statesRead = new Set();
  const exports = {};
  vm.runInNewContext(
    ts.transpile(
      readFileSync(new URL("../src/lib/business-performance.server.ts", import.meta.url), "utf8"),
      { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
    ),
    {
      exports,
      Date,
      Map,
      Set,
      Error,
      require(name) {
        if (name === "@/config/classifieds")
          return { marketplaceStateCodes: ["ID", "UT", "OR", "WA"] };
        if (name === "@/config/brand") return { brand: { domain: "onbluebird.com" } };
        if (name === "./business-performance") return contract;
        if (name === "./traffic-exclusions.server") return { loadStaffTrafficExclusions };
        if (name === "./dealer-feed.server")
          return { dealerFeedCards: async () => ({ cards: [], dealers: [] }) };
        if (name === "./marketcheck.server")
          return {
            marketCheckCards: async (input, options) => {
              assert.equal(options.cacheOnly, true);
              assert.equal(options.cacheReadTimeoutMs, 8000);
              statesRead.add(input.state);
              return api;
            },
          };
        if (name === "./dealer-feed-contract")
          return { mergeDealerFeedVehicles: (feed, api) => [...feed, ...api] };
        throw Error(name);
      },
    },
  );
  await exports.loadBusinessPerformance(db, 30, { persistAttribution: false });
  assert.equal(writes, 0, "owner analytics must not persist global attribution");
  let result = await exports.loadBusinessPerformance(db, 30);
  assert.deepEqual([...statesRead].sort(), ["ID", "OR", "UT", "WA"]);
  assert.equal(result.businesses.length, 1);
  assert.equal(result.businesses[0].activeListings, 1);
  assert.equal(
    result.aliases["marketcheck-dealer:100:boise:id:83713"],
    "dealer:mass-motors-fairview",
  );
  assert.equal(writes, 2);
  await exports.loadBusinessPerformance(db, 30);
  assert.equal(writes, 2, "unchanged report reads must not rewrite the directory");
  api = [];
  tables.analytics_events = [
    {
      name: "listing_viewed",
      props: { listing_id: "marketcheck-dealer-42", site_host: "onbluebird.com" },
      user_id: null,
      session_id: "browser",
      occurred_at: new Date().toISOString(),
      is_demo: false,
    },
  ];
  result = await exports.loadBusinessPerformance(db, 30);
  assert.equal(result.businesses[0].activeListings, 0);
  assert.equal(result.businesses[0].listingViews, 1);
  assert.equal(result.businesses[0].listings[0].title, "2024 Forester");
  assert.equal(result.businesses[0].listings[0].active, false);
  assert.equal(result.businesses[0].modeledSales, null);
  const diesel = {
    key: "seller:diesel",
    canonicalKey: "seller:diesel",
    kind: "dealer",
    name: "Diesel Depot",
    city: "",
    state: "",
    postalCode: "",
    website: "diesel-depot.com",
    dealerSlug: "",
    sellerSlug: "diesel",
  };
  tables.business_performance_entities.push({
    business_key: diesel.key,
    canonical_key: diesel.key,
    metadata: diesel,
  });
  tables.seller_profiles.push({ user_id: "diesel-owner", slug: "diesel" });
  tables.asks = [
    {
      id: "equipment",
      seller_id: "diesel-owner",
      dealer_id: null,
      products: { name: "Crane", status: "published" },
      is_demo: false,
      status: "active",
      approved_at: new Date().toISOString(),
      expires_at: new Date(Date.now() + 86400000).toISOString(),
    },
    {
      id: "private",
      seller_id: "private-person",
      dealer_id: null,
      products: { name: "Private listing", status: "published" },
      is_demo: false,
      status: "active",
      approved_at: new Date().toISOString(),
      expires_at: new Date(Date.now() + 86400000).toISOString(),
    },
  ];
  tables.analytics_events = [
    {
      name: "listing_viewed",
      props: { listing_id: "equipment", traffic_visit: "buyer" },
      user_id: null,
      session_id: "buyer",
      occurred_at: new Date().toISOString(),
    },
    {
      name: "listing_viewed",
      props: { listing_id: "equipment", traffic_visit: "owner" },
      user_id: null,
      session_id: "owner",
      occurred_at: new Date().toISOString(),
    },
    {
      name: "account_opened",
      props: { traffic_visit: "owner" },
      user_id: "diesel-owner",
      session_id: "owner",
      occurred_at: new Date().toISOString(),
    },
  ];
  result = await exports.loadBusinessPerformance(db, 30);
  const row = result.businesses.find((b) => b.key === diesel.key);
  assert.equal(row.activeListings, 1);
  assert.equal(row.listingViews, 1);
  assert.equal(row.listings[0].title, "Crane");
  assert.equal(row.sellerSlug, "diesel");
  assert.equal(
    result.businesses.length,
    2,
    "unregistered private sellers do not become business records",
  );
});
