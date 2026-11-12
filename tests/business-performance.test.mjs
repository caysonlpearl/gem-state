import test from "node:test";
import assert from "node:assert/strict";
import {
  businessForListing,
  businessProps,
  canonicalBusiness,
  summarizeBusinessPerformance,
  businessPerformanceCsv,
} from "../src/lib/business-performance.ts";
const mass = {
  key: "dealer:mass-motors-fairview",
  canonicalKey: "dealer:mass-motors-fairview",
  kind: "dealer",
  name: "M.A.S.S. Motors Fairview",
  city: "Boise",
  state: "ID",
  postalCode: "83704",
  website: "massmotors.com",
  dealerSlug: "mass-motors-fairview",
};
const listing = {
  id: "marketcheck-dealer-123",
  title: "2024 Subaru Forester",
  city: "Boise",
  state: "ID",
  externalVehicle: {
    sourceKind: "dealer",
    dealer: {
      id: 42,
      name: "MASS Motors",
      website: "https://www.massmotors.com",
      city: "Boise",
      state: "ID",
      zip: "83704",
    },
  },
};
const api = canonicalBusiness(businessForListing(listing), [mass]);
const link = {
  listingId: listing.id,
  businessKey: api.key,
  title: listing.title,
  source: "MarketCheck API",
  active: false,
};
const at = "2026-11-12T18:00:00Z";
const event = (name, props = {}, extra = {}) => ({
  name,
  props: {
    ...businessProps(api),
    listing_id: listing.id,
    site_host: "onbluebird.com",
    traffic_visit: "visit-1",
    ...props,
  },
  user_id: null,
  session_id: "browser-1",
  occurred_at: at,
  ...extra,
});
const report = (events, options = {}) =>
  summarizeBusinessPerformance({
    events,
    businesses: [mass, api],
    attributions: [link],
    staffIds: new Set(["staff"]),
    domain: "onbluebird.com",
    rates: new Map(),
    ...options,
  });
test("API and authorized records use the same verified business, but other branches stay separate", () => {
  assert.equal(api.canonicalKey, mass.key);
  assert.notEqual(
    canonicalBusiness({ ...api, postalCode: "83709" }, [mass]).canonicalKey,
    mass.key,
  );
  assert.notEqual(
    canonicalBusiness({ ...api, website: "anotherdealer.com" }, [mass]).canonicalKey,
    mass.key,
  );
  assert.notEqual(canonicalBusiness({ ...api, postalCode: "" }, [mass]).canonicalKey, mass.key);
  assert.equal(
    businessForListing({ ...listing, externalVehicle: { sourceKind: "fsbo", dealer: null } }),
    null,
  );
  assert.equal(businessForListing({ ...listing, isMock: true }), null);
});
test("historical attribution survives removed inventory and preserves per-listing activity", () => {
  const result = report([
    event("listing_viewed"),
    event("business_action", { method: "vehicle_source" }),
  ]);
  assert.equal(result.businesses.length, 1);
  const row = result.businesses[0];
  assert.equal(row.listingViews, 1);
  assert.equal(row.vehicleClicks, 1);
  assert.equal(row.activeListings, 0);
  assert.equal(row.listings[0].title, listing.title);
  assert.equal(row.listings[0].active, false);
  assert.equal(row.modeledSales, null);
});
test("staff, whole QA visits, bots, previews, demonstrations, and own-business traffic are excluded", () => {
  const result = report(
    [
      event("listing_viewed"),
      event(
        "listing_viewed",
        { traffic_visit: "staff" },
        { user_id: "staff", session_id: "staff" },
      ),
      event("listing_viewed", { traffic_visit: "qa", is_internal: true }),
      event("business_action", { traffic_visit: "qa", method: "website" }),
      event("listing_viewed", { is_bot: true, traffic_visit: "bot" }),
      event("listing_viewed", { site_host: "preview.lovable.app", traffic_visit: "preview" }),
      event("listing_viewed", {}, { is_demo: true }),
      event("listing_viewed", { traffic_visit: "owner" }, { user_id: "dealer-owner" }),
      event("business_action", { traffic_visit: "owner", method: "website" }),
    ],
    { ownerIds: new Map([[mass.key, new Set(["dealer-owner"])]]) },
  );
  assert.equal(result.businesses[0].listingViews, 1);
  assert.equal(result.businesses[0].websiteClicks, 0);
});
test("repeat actions do not become multiple interested browsers or confirmed sales", () => {
  const result = report(
    [
      event("listing_viewed"),
      event("business_action", { method: "website", event_id: "click-1" }),
      event("business_action", { method: "website", event_id: "click-1" }),
      event("business_action", {
        method: "call",
        traffic_visit: "return-visit",
        event_id: "click-2",
      }),
      event("inquiry_completed", { event_id: "message:accepted" }),
      event("inquiry_completed", { event_id: "message:accepted" }),
    ],
    { rates: new Map([[mass.key, 2]]) },
  );
  const row = result.businesses[0];
  assert.equal(row.websiteClicks, 1);
  assert.equal(row.calls, 1);
  assert.equal(row.inquiries, 1);
  assert.equal(row.uniqueBrowsers, 1);
  assert.equal(row.interestedBrowsers, 1);
  assert.equal(row.modeledSales, 0.02);
  assert.equal("confirmedSales" in row, false);
});
test("legacy listing-only events use saved attribution; unknown dealership events are visible as unattributed", () => {
  const legacy = event("listing_viewed", {
    business_key: null,
    business_kind: null,
    business_name: null,
  });
  const result = report([
    legacy,
    event("listing_viewed", {
      business_key: null,
      business_kind: null,
      business_name: null,
      listing_id: "marketcheck-dealer-gone",
    }),
  ]);
  assert.equal(result.businesses[0].listingViews, 1);
  assert.equal(result.unattributedEvents, 1);
});
test("profile visits, website referrals, original links, and contact taps remain separate", () => {
  const result = report([
    event("business_profile_viewed", { listing_id: null }),
    ...["dealer_profile", "website", "vehicle_source", "call", "text", "email", "directions"].map(
      (method) => event("business_action", { method, event_id: method }),
    ),
  ]);
  const row = result.businesses[0];
  assert.equal(row.profileViews, 1);
  assert.equal(row.profileClicks, 1);
  assert.equal(row.websiteClicks, 1);
  assert.equal(row.vehicleClicks, 1);
  assert.equal(row.calls, 1);
  assert.equal(row.texts, 1);
  assert.equal(row.emails, 1);
  assert.equal(row.directions, 1);
});
test("CSV exports identify modeled sales as unverified and escape spreadsheet formula injection", () => {
  const row = report([]).businesses[0];
  const csv = businessPerformanceCsv([{ ...row, name: '=HYPERLINK("bad")' }]);
  assert.ok(csv.includes("Modeled sales (unverified)"));
  assert.ok(csv.includes("'" + "=HYPERLINK"));
});
test("generic business attribution covers directory businesses, employers and brokers without inventing employers", () => {
  assert.equal(
    businessForListing({
      id: "fsq-123",
      title: "Local Plumber",
      directory: { website: "https://plumber.example" },
      city: "Boise",
      state: "ID",
    }).kind,
    "service",
  );
  assert.equal(
    businessForListing({ id: "adzuna-123", job: { employerName: "Real Company" }, state: "ID" })
      .kind,
    "employer",
  );
  assert.equal(
    businessForListing({ id: "adzuna-123", job: { employerName: "Confidential" }, state: "ID" }),
    null,
  );
  assert.equal(
    businessForListing({
      id: "openwebninja-123",
      externalHome: { listedBy: { brokerName: "Real Brokerage" } },
      state: "ID",
    }).kind,
    "broker",
  );
});
test("card activations are distinct from page views and do not imply purchase interest", () => {
  const row = report([
    event("business_listing_clicked", { event_id: "open-1" }),
    event("business_listing_clicked", { event_id: "open-1" }),
    event("listing_viewed"),
  ]).businesses[0];
  assert.equal(row.listingClicks, 1);
  assert.equal(row.listingViews, 1);
  assert.equal(row.listings[0].listingClicks, 1);
  assert.equal(row.interestedBrowsers, 0);
  assert.equal(row.modeledSales, null);
});

test("a later staff or owner account event excludes their anonymous pre-login views", () => {
  const result = report(
    [
      event("listing_viewed", { traffic_visit: "admin-visit" }),
      event(
        "admin_opened",
        {
          listing_id: null,
          business_key: null,
          business_kind: null,
          business_name: null,
          traffic_visit: "admin-visit",
        },
        { user_id: "staff" },
      ),
      event("listing_viewed", { traffic_visit: "owner-visit" }),
      event(
        "account_opened",
        {
          listing_id: null,
          business_key: null,
          business_kind: null,
          business_name: null,
          traffic_visit: "owner-visit",
        },
        { user_id: "dealer-owner" },
      ),
      event("listing_viewed", { traffic_visit: "real-buyer" }),
    ],
    { ownerIds: new Map([[mass.key, new Set(["dealer-owner"])]]) },
  );
  assert.equal(result.businesses[0].listingViews, 1);
  assert.equal(result.businesses[0].uniqueBrowsers, 1);
});
