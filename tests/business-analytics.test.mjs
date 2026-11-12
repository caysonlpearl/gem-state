import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import ts from "typescript";
import * as contract from "../src/lib/business-performance.ts";
import * as policy from "../src/lib/analytics-policy.ts";
const business = {
  key: "dealer:test",
  canonicalKey: "dealer:test",
  kind: "dealer",
  name: "Real Business",
  city: "Boise",
  state: "ID",
  website: "realdealer.com",
  dealerSlug: "real-dealer",
  postalCode: "83704",
};
function fixture() {
  const stored = new Map(),
    calls = [];
  let success = false;
  const storage = {
    getItem: (key) => stored.get(key) ?? null,
    setItem: (key, value) => stored.set(key, value),
  };
  const exports = {};
  class Element {
    constructor(anchor) {
      this.anchor = anchor;
    }
    closest() {
      return this.anchor;
    }
  }
  vm.runInNewContext(
    ts.transpile(
      readFileSync(new URL("../src/lib/business-analytics.ts", import.meta.url), "utf8"),
      { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
    ),
    {
      exports,
      crypto,
      Element,
      URL,
      Date,
      localStorage: storage,
      sessionStorage: storage,
      navigator: { userAgent: "Normal browser" },
      window: { location: { origin: "https://onbluebird.com", search: "?_qa=1" } },
      require(name) {
        if (name === "./analytics")
          return {
            trackEvent: async (name, props) => {
              calls.push({ name, props });
              return success;
            },
          };
        if (name === "./business-performance") return contract;
        if (name === "./analytics-policy") return policy;
        throw Error(name);
      },
    },
  );
  return {
    api: exports,
    calls,
    stored,
    Element,
    success: () => {
      success = true;
    },
  };
}
const drain = () => new Promise((resolve) => setImmediate(resolve));
test("outbound actions survive failed delivery, retain their event ID and QA flag, and flush later", async () => {
  const f = fixture();
  f.api.trackBusinessEvent("business_action", business, { method: "website" });
  await drain();
  const queued = JSON.parse(f.stored.get("bluebird_business_events_v1"));
  assert.equal(queued.length, 1);
  assert.equal(queued[0].props.is_internal, true);
  f.success();
  f.api.flushBusinessEvents();
  await drain();
  assert.equal(JSON.parse(f.stored.get("bluebird_business_events_v1")).length, 0);
  assert.equal(f.calls[0].props.event_id, f.calls[1].props.event_id);
});
test("only business links are referrals, and original listing links stay distinct from homepage links", async () => {
  const f = fixture();
  f.success();
  const listing = {
    id: "marketcheck-dealer-1",
    title: "A car",
    city: "Boise",
    state: "ID",
    externalVehicle: {
      sourceKind: "dealer",
      dealer: { id: 1, name: "Real Business", website: "https://realdealer.com" },
      sourceUrl: "https://realdealer.com/car/1",
    },
  };
  const click = (href, dataset = {}) =>
    f.api.trackBusinessAnchor({ target: new f.Element({ href, dataset }) }, listing);
  click("https://realdealer.com/");
  click("https://realdealer.com/car/1", { businessAction: "vehicle_source" });
  click("https://carfax.com/report");
  click("https://photos.example/car.jpg");
  click("tel:12345");
  await drain();
  assert.deepEqual(
    f.calls.map((c) => c.props.method),
    ["website", "vehicle_source"],
  );
  assert.doesNotThrow(() =>
    f.api.trackBusinessAnchor(
      { target: new f.Element({ href: "https://realdealer.com", dataset: {} }) },
      { ...listing, externalVehicle: { ...listing.externalVehicle, sourceUrl: "https://[" } },
    ),
  );
});
test("slim cards retain dealer attribution without copying provider payloads", async () => {
  const f = fixture();
  f.success();
  f.api.trackBusinessListingOpen({
    id: "marketcheck-dealer-77",
    title: "2024 Subaru",
    businessAttribution: business,
    externalVehicle: { sourceKind: "dealer" },
  });
  await drain();
  assert.equal(f.calls[0].name, "business_listing_clicked");
  assert.equal(f.calls[0].props.business_key, business.key);
  assert.equal(f.calls[0].props.business_listing_title, "2024 Subaru");
  assert.equal(f.calls[0].props.business_listing_source, "MarketCheck API");
  f.api.trackBusinessListingOpen({
    id: "marketcheck-fsbo-88",
    title: "Private car",
    externalVehicle: { sourceKind: "fsbo" },
  });
  assert.equal(f.calls.length, 1);
});
test("native card/profile events can be attributed server-side without exposing seller account data", async () => {
  const f = fixture();
  f.success();
  f.api.trackBusinessListingOpen({ id: "native-equipment-listing" });
  f.api.trackBusinessEvent("business_profile_viewed", null, { seller_slug: "diesel" });
  f.api.trackBusinessAnchor(
    { target: new f.Element({ href: "https://onbluebird.com/sellers/diesel", dataset: {} }) },
    { id: "native-equipment-listing", seller: { slug: "diesel" } },
  );
  await drain();
  assert.deepEqual(
    f.calls.map((c) => c.name),
    ["business_listing_clicked", "business_profile_viewed", "business_action"],
  );
  assert.equal(f.calls[0].props.business_key, undefined);
  assert.equal(f.calls[0].props.business_listing_title, "");
  assert.equal(f.calls[2].props.method, "dealer_profile");
  f.api.trackBusinessListingOpen({ id: "demo", isMock: true });
  assert.equal(f.calls.length, 3);
});
