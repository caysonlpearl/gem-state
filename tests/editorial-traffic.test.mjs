import test from "node:test";
import assert from "node:assert/strict";
import { summarizeEditorialTraffic } from "../src/lib/editorial-traffic.ts";
import { eligibleTrafficEvents } from "../src/lib/traffic-summary.ts";

test("article clicks and attributed outcomes retain placement and distinct clicking visits", () => {
  const event = (name, props = {}) => ({
    name,
    user_id: null,
    props: { site_host: "onbluebird.com", traffic_visit: "v1", ...props },
  });
  const rows = summarizeEditorialTraffic([
    event("media_article_viewed", { article: "guide:rental" }),
    event("media_cta_clicked", { article: "guide:rental", placement: "guide_intro" }),
    event("media_cta_clicked", { article: "guide:rental", placement: "guide_end" }),
    event("listing_viewed", { media_article: "guide:rental" }),
    event("seller_contacted", { media_article: "guide:rental" }),
    event("classified_listing_started", { media_article: "guide:rental" }),
    event("classified_listing_submit_succeeded", { media_article: "guide:rental" }),
    event("media_article_viewed", { article: "preview" }),
  ]);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].views, 1);
  assert.equal(rows[0].clicks, 2);
  assert.equal(rows[0].clickingVisits, 1);
  assert.equal(rows[0].contacts, 1);
  assert.equal(rows[0].inquiries, 0);
  assert.equal(rows[0].postingStarts, 1);
  assert.equal(rows[0].submissions, 1);
  assert.deepEqual(rows[0].placements, { guide_intro: 1, guide_end: 1 });
});
test("completed inquiries deduplicate by acknowledgement and internal visits stay excluded", () => {
  const event = (props) => ({
    name: "inquiry_completed",
    user_id: null,
    props: {
      site_host: "onbluebird.com",
      traffic_visit: "v1",
      media_article: "guide:rental",
      ...props,
    },
  });
  const events = [
    event({ event_id: "message:1" }),
    event({ event_id: "message:1" }),
    event({ traffic_visit: "qa", event_id: "message:2", is_internal: true }),
  ];
  const rows = summarizeEditorialTraffic(
    eligibleTrafficEvents(events, { domain: "onbluebird.com", staffIds: new Set() }),
  );
  assert.equal(rows[0].inquiries, 1);
});
