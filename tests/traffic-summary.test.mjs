import test from "node:test";
import assert from "node:assert/strict";

import { summarizeTraffic } from "../src/lib/traffic-summary.ts";

const live = "onbluebird.com";
const event = (name, props, user_id = null) => ({
  name,
  user_id,
  props: { site_host: live, ...props },
});
const fromGoogle = (visit, extra = {}) => ({
  traffic_source: "google",
  traffic_channel: "search",
  traffic_visit: visit,
  ...extra,
});

const summarize = (events, staff = []) =>
  summarizeTraffic(events, { staffIds: new Set(staff), domain: live, windowDays: 30 });

test("counts visits, views and contacts per channel and source", () => {
  const result = summarize([
    event(
      "visit_started",
      fromGoogle("v1", { landing_path: "/guides/how-to-sell-a-car-in-idaho" }),
    ),
    event("listing_viewed", fromGoogle("v1")),
    event("seller_contacted", fromGoogle("v1", { method: "call" })),
    event("seller_contacted", fromGoogle("v1", { method: "text" })),
    event("visit_started", fromGoogle("v2", { landing_path: "/" })),
    event("visit_started", {
      traffic_source: "chatgpt",
      traffic_channel: "ai",
      traffic_visit: "v3",
      landing_path: "/",
    }),
  ]);
  assert.equal(result.totals.visits, 3);
  assert.equal(result.totals.listingViews, 1);
  assert.equal(result.totals.contacts, 2);
  // Two taps in one visit count once as a contacting visit.
  assert.equal(result.totals.contactingVisits, 1);
  const search = result.byChannel.find((row) => row.channel === "search");
  assert.deepEqual(
    { visits: search.visits, contacts: search.contacts, contactingVisits: search.contactingVisits },
    { visits: 2, contacts: 2, contactingVisits: 1 },
  );
  assert.equal(result.byChannel.find((row) => row.channel === "ai").visits, 1);
  assert.deepEqual(result.contactMethods.map((item) => item.method).sort(), ["call", "text"]);
  assert.deepEqual(result.topLandingPages[0], { path: "/", visits: 2, fromSearchOrAi: 2 });
});

test("leaves out staff, dev and preview hosts", () => {
  const result = summarize(
    [
      event("visit_started", fromGoogle("staff"), "staff-user"),
      {
        name: "visit_started",
        user_id: null,
        props: { ...fromGoogle("dev"), site_host: "localhost" },
      },
      {
        name: "visit_started",
        user_id: null,
        props: { ...fromGoogle("www"), site_host: "www.onbluebird.com" },
      },
    ],
    ["staff-user"],
  );
  assert.equal(result.totals.visits, 1);
});

test("events from before tracking show as unknown", () => {
  const result = summarize([{ name: "listing_viewed", user_id: null, props: {} }]);
  assert.equal(result.byChannel[0].channel, "unknown");
  assert.equal(result.totals.listingViews, 1);
});
