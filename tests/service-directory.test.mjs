import test from "node:test";
import assert from "node:assert/strict";
import {
  canIncludeDirectory,
  directoryCard,
  enrichmentFrom,
  matchBusiness,
  websiteDomain,
} from "../src/lib/service-directory-contract.ts";

const row = {
  id: "fsq-576cb84f2354446e4477434d",
  name: "Coelho Plumbing Services",
  trade: "Plumbers",
  trades: ["Plumbers", "Heating & Air Conditioning"],
  address: "123 Main St",
  city: "Nampa",
  state: "ID",
  postcode: "83651",
  latitude: 43.5,
  longitude: -116.5,
  phone: "(208) 466-2311",
  website: "https://www.coelhoplumbing.com/",
  email: null,
  facebook_id: null,
  instagram: null,
  source_refreshed_at: "2025-06-01",
  enrichment: null,
  enriched_at: null,
  claimed_by: null,
  imported_at: "2026-10-16T00:00:00Z",
};

test("directory businesses only answer filters they can honestly match", () => {
  assert.equal(canIncludeDirectory({ category: "services" }), true);
  assert.equal(
    canIncludeDirectory({ category: "services", serviceSubcategory: "Plumbers", city: "Nampa" }),
    true,
  );
  assert.equal(canIncludeDirectory({ category: "jobs" }), false);
  assert.equal(canIncludeDirectory({ q: "plumber" }), false);
  assert.equal(canIncludeDirectory({ category: "services", priceMax: 100 }), false);
  assert.equal(canIncludeDirectory({ category: "services", sellerSlug: "x" }), false);
  assert.equal(canIncludeDirectory({ category: "services", sort: "price_low" }), false);
});

test("a directory row becomes a service card that invites a quote, not a fake price", () => {
  const card = directoryCard(row, null);
  assert.equal(card.service.subcategory, "Plumbers");
  assert.equal(card.service.pricing, "Call for a quote");
  assert.equal(card.priceCents, 0);
  assert.equal(card.directory.claimed, false);
  assert.equal(card.directory.phone, "(208) 466-2311");
  assert.equal(card.service.businessAddress, "123 Main St, Nampa, ID, 83651");
});

test("only the same business's lookup is kept", () => {
  const other = {
    name: "Coelho Plumbing",
    phone_number: "+1 208-555-0000",
    full_address: "Boise, ID",
  };
  const samePhone = {
    name: "Coelho Plumbing Inc",
    phone_number: "+1 208-466-2311",
    full_address: "x",
  };
  const sameName = { name: "Coelho Plumbing Services LLC", full_address: "9 Elm, Nampa, ID 83651" };
  assert.equal(matchBusiness(row, [other]), null);
  assert.equal(matchBusiness(row, [other, samePhone]), samePhone);
  assert.equal(matchBusiness(row, [sameName]), sameName);
});

test("lookups keep rating, hours and Google links, and spot permanent closures", () => {
  const enriched = enrichmentFrom({
    rating: 4.7,
    review_count: 88,
    phone_number: "+1 208-466-2311",
    website: "https://coelho.example",
    place_link: "https://www.google.com/maps/place/x",
    working_hours: { Monday: ["8 AM-5 PM"], Sunday: ["Closed"] },
    business_status: "OPEN",
  });
  assert.equal(enriched.rating, 4.7);
  assert.deepEqual(enriched.hours, [
    { day: "Monday", hours: "8 AM-5 PM" },
    { day: "Sunday", hours: "Closed" },
  ]);
  assert.equal(enriched.closed, false);
  assert.equal(enrichmentFrom({ business_status: "CLOSED_PERMANENTLY" }).closed, true);
  assert.equal(enrichmentFrom({ place_link: "https://evil.example/maps" }).googleUrl, null);
});

test("logos come from a business's own site, never a social or builder page", () => {
  assert.equal(websiteDomain("https://www.coelhoplumbing.com/"), "coelhoplumbing.com");
  assert.equal(websiteDomain("coelhoplumbing.com"), "coelhoplumbing.com");
  assert.equal(websiteDomain("https://www.facebook.com/coelho"), null);
  assert.equal(websiteDomain(null), null);
});

test("lookups keep the business's own description and service list", () => {
  const enriched = enrichmentFrom({
    about: { summary: "Family-owned plumbers serving Canyon County since 1998." },
    business_services: ["water heater installation", { name: "Drain cleaning" }, "Drain cleaning"],
  });
  assert.equal(enriched.summary, "Family-owned plumbers serving Canyon County since 1998.");
  assert.deepEqual(enriched.services, ["Water heater installation", "Drain cleaning"]);
  const card = directoryCard({ ...row, enrichment: enriched }, null);
  assert.equal(card.service.serviceSummary, enriched.summary);
  assert.deepEqual(card.service.offerings, enriched.services);
});
