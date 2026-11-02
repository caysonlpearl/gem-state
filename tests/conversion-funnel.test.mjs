import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { summarizeConversionVisits } from "../src/lib/conversion-funnel.ts";
import { eligibleTrafficEvents } from "../src/lib/traffic-summary.ts";
import { isKnownAutomatedAgent } from "../src/lib/analytics-policy.ts";
const event = (name, second, props = {}, visit = "a") => ({
  name,
  user_id: null,
  occurred_at: new Date(1700000000000 + second * 1000).toISOString(),
  props: { traffic_visit: visit, site_host: "onbluebird.com", ...props },
});

test("direct listing visitors need no search and repeated actions count once per visit", () => {
  const report = summarizeConversionVisits([
    event("visit_started", 0, { landing_path: "/listings/car", device: "mobile" }),
    event("listing_viewed", 1),
    event("listing_viewed", 2),
    event("seller_contacted", 3),
    event("seller_contacted", 4),
    event("inquiry_completed", 5),
  ]);
  assert.equal(report.totals.visits, 1);
  assert.equal(report.totals.searched, 0);
  assert.equal(report.totals.viewed, 1);
  assert.equal(report.totals.contactedAfterView, 1);
  assert.equal(report.totals.inquiriesAfterContact, 1);
  assert.equal(report.byDevice[0].segment, "mobile");
  assert.equal(report.byLandingTemplate[0].segment, "listing");
});

test("out-of-order and equal-time actions do not invent ordered conversions", () => {
  const report = summarizeConversionVisits([
    event("visit_started", 0),
    event("inquiry_completed", 1),
    event("seller_contacted", 2),
    event("listing_viewed", 3),
    event("seller_contacted", 3),
  ]);
  assert.equal(report.totals.viewed, 1);
  assert.equal(report.totals.contactedAfterView, 0);
  assert.equal(report.totals.inquiriesAfterContact, 0);
});

test("client occurrence time can recover transport reordering but wild clock skew is rejected", () => {
  const report = summarizeConversionVisits([
    event("visit_started", 0),
    event("seller_contacted", 2, { event_at: 1700000003000 }),
    event("listing_viewed", 4, { event_at: 1700000001000 }),
    event("inquiry_completed", 1, { event_at: 1900000000000 }),
  ]);
  assert.equal(report.totals.contactedAfterView, 1);
  assert.equal(report.totals.inquiriesAfterContact, 0);
});

test("missing start or timing is disclosed, and old devices remain unknown", () => {
  const missingTime = event("seller_contacted", 2);
  delete missingTime.occurred_at;
  const report = summarizeConversionVisits([
    event("visit_started", 0),
    event("listing_viewed", 1),
    missingTime,
    event("seller_contacted", 4, {}, "old-tab"),
    { name: "listing_viewed", user_id: null, props: {} },
  ]);
  assert.equal(report.totals.visits, 1);
  assert.equal(report.byDevice[0].segment, "unknown");
  assert.equal(report.visitsWithoutStart, 1);
  assert.equal(report.eventsWithoutTime, 1);
  assert.equal(report.eventsWithoutVisit, 1);
});

test("results views and seller submission progression remain separate from buyer contact", () => {
  const report = summarizeConversionVisits([
    event("visit_started", 0, { landing_path: "/" }),
    event("search_completed", 1, { results: 0 }),
    event("search_completed", 2, { results: 12 }),
    event("classified_listing_submit_started", 3),
    event("classified_listing_submit_succeeded", 4),
  ]);
  assert.equal(report.totals.searched, 1);
  assert.equal(report.totals.noResults, 1);
  assert.equal(report.totals.submissionAttempts, 1);
  assert.equal(report.totals.submittedAfterAttempt, 1);
  assert.equal(report.totals.contactedAfterView, 0);
});

test("staff, marked QA, preview and duplicate exclusions remain in force", () => {
  const events = [
    event("visit_started", 0),
    event("visit_started", 0),
    event("listing_viewed", 1),
    event("visit_started", 0, { is_internal: true }, "qa"),
    event("visit_started", 0, { site_host: "preview.example" }, "preview"),
    event("visit_started", 0, {}, "staff"),
    { ...event("listing_viewed", 1, {}, "staff"), user_id: "admin" },
  ];
  const eligible = eligibleTrafficEvents(events, {
    staffIds: new Set(["admin"]),
    domain: "onbluebird.com",
  });
  assert.equal(summarizeConversionVisits(eligible).totals.visits, 1);
  assert.equal(isKnownAutomatedAgent("Mozilla/5.0 Google-InspectionTool/1.0"), true);
  assert.equal(isKnownAutomatedAgent("Mozilla/5.0 Chrome/153.0 Safari/537.36"), false);
});

test("admin reads include stage events and timestamps without weakening the role check", () => {
  const source = readFileSync(new URL("../src/lib/traffic.functions.ts", import.meta.url), "utf8");
  const reader = readFileSync(new URL("../src/lib/traffic-report.server.ts", import.meta.url), "utf8");
  assert.match(source, /has_role/);
  assert.match(source, /if \(isAdmin !== true\)/);
  assert.match(source, /loadTrafficReport\(supabase as unknown as SupabaseClient/);
  assert.match(reader, /"search_completed"/);
  assert.match(reader, /"classified_listing_submit_started"/);
  assert.match(reader, /"classified_listing_started"/);
  assert.match(reader, /user_id, occurred_at/);
  assert.match(reader, /summarizeConversionVisits\(eligibleTrafficEvents\(events, options\)\)/);
});

test("organic cohorts retain the original landing and exclude paid, AI and unknown visits", () => {
  const events = [
    event(
      "visit_started",
      0,
      { traffic_channel: "search", landing_path: "/idaho/boise/plumbers?utm_source=google" },
      "organic",
    ),
    event("listing_viewed", 1, {}, "organic"),
    event("seller_contacted", 2, {}, "organic"),
    event("inquiry_completed", 3, {}, "organic"),
    event("classified_listing_started", 4, {}, "organic"),
    event("classified_listing_started", 5, {}, "organic"),
    event("classified_listing_submit_started", 6, {}, "organic"),
    event("classified_listing_submit_succeeded", 7, {}, "organic"),
    event(
      "visit_started",
      0,
      { traffic_channel: "paid", landing_path: "/idaho/boise/plumbers" },
      "paid",
    ),
    event("classified_listing_started", 1, {}, "paid"),
    event(
      "visit_started",
      0,
      { traffic_channel: "ai", landing_path: "/idaho/boise/plumbers" },
      "ai",
    ),
    event("visit_started", 0, {}, "unknown"),
  ];
  const report = summarizeConversionVisits(events);
  assert.equal(report.totals.visits, 4);
  assert.equal(report.organic.visits, 1);
  assert.equal(report.organic.postingStarts, 1);
  assert.equal(report.organic.inquiriesAfterContact, 1);
  assert.equal(report.organic.submittedAfterAttempt, 1);
  assert.equal(report.byOrganicLandingPage.length, 1);
  assert.equal(report.byOrganicLandingPage[0].segment, "/idaho/boise/plumbers");
  assert.equal(report.byChannel.find((row) => row.segment === "paid").postingStarts, 1);
});
