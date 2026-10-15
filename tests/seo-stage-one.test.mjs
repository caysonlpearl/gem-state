import test from "node:test";
import assert from "node:assert/strict";
import {
  canonicalPagePath,
  isIndexableCollection,
  isIndexablePlaceInventory,
  isIndexableStorefront,
  isOutOfRangePage,
  isPrivateSeoPath,
  isSitemapAllowedPath,
  matchesSeoPlace,
  placeInventoryFilters,
  seoHostPolicy,
  socialImageMeta,
} from "../src/lib/seo-policy.ts";
import { isWithinClassifiedCityRadius } from "../src/config/classifieds.ts";
import {
  isInternalAnalyticsQuery,
  isKnownAutomatedAgent,
  performancePageTemplate,
  summarizeVitals,
} from "../src/lib/analytics-policy.ts";
import { eligibleTrafficEvents, summarizeTraffic } from "../src/lib/traffic-summary.ts";
import { classifyTrafficSource } from "../src/lib/traffic-source.ts";

test("pagination keeps category, results mode, rental mode and distinct page canonicals", () => {
  assert.equal(
    canonicalPagePath("/browse/", {
      category: "cars-trucks",
      vehicleMode: "results",
      page: 2,
      sort: "price-asc",
      city: "Boise",
      _verify: "qa",
    }),
    "/browse?category=cars-trucks&vehicleMode=results&page=2",
  );
  assert.equal(
    canonicalPagePath("/browse", {
      category: "other-real-estate",
      homeMode: "results",
      homeTab: "rent",
      page: 3,
    }),
    "/browse?category=other-real-estate&homeMode=results&homeTab=rent&page=3",
  );
  assert.equal(
    canonicalPagePath("/browse", { allCategories: true, page: 1 }),
    "/browse?allCategories=true",
  );
  assert.equal(
    canonicalPagePath("/browse", { group: "motors", page: 4 }),
    "/browse?group=motors&page=4",
  );
  assert.equal(canonicalPagePath("/idaho/eagle/", { token: "secret" }), "/idaho/eagle");
  assert.equal(canonicalPagePath("/claim-seller", { token: "secret" }), "/claim-seller");
});

test("thin collections and all noncurated filter permutations are noindex", () => {
  assert.equal(isIndexableCollection({ category: "pets", petMode: "results", page: 2 }, 5), true);
  assert.equal(isIndexableCollection({ category: "pets" }, 4), false);
  for (const [key, value] of Object.entries({
    q: "ring",
    city: "Eagle",
    radiusMiles: 25,
    latitude: 43.7,
    longitude: -116.3,
    minPrice: 0,
    maxPrice: 50,
    condition: "used_good",
    make: "Toyota||Ford",
    sort: "price-asc",
    view: "list",
    savedSearch: "id",
  })) {
    assert.equal(isIndexableCollection({ category: "general", [key]: value }, 50), false, key);
  }
  assert.equal(
    isIndexableCollection({ category: "general", sort: "newest", view: "grid", q: undefined }, 5),
    true,
  );
});

test("all private workflow families stay outside sitemap and noindex", () => {
  for (const path of [
    "/account",
    "/admin/traffic",
    "/auth/callback",
    "/claim-seller",
    "/messages",
    "/selling",
    "/buying",
    "/watchlist",
    "/notifications",
    "/onboarding",
    "/seller-setup",
    "/dealer-setup",
    "/create-listing",
    "/create-missing-listing",
    "/orders/invalid",
    "/shopper",
    "/shopper-payouts",
    "/suggest",
    "/lovable/email/preview",
  ]) {
    assert.equal(isPrivateSeoPath(path), true, path);
    assert.equal(isSitemapAllowedPath(path), false, path);
  }
  assert.equal(isSitemapAllowedPath("/shoppers/private"), false);
  assert.equal(isSitemapAllowedPath("/sellers/real-seller"), true);
  assert.equal(isIndexableStorefront(0), false);
  assert.equal(isIndexableStorefront(1), true);
});

test("sitemap and rendered place filters use Idaho and real 25 mile city geometry", () => {
  assert.deepEqual(placeInventoryFilters({ kind: "city", name: "Eagle" }, "jewelry-watches"), {
    state: "ID",
    city: "Eagle",
    radiusMiles: 25,
    category: "jewelry-watches",
  });
  const matches = (city, state, region = "Treasure Valley") =>
    matchesSeoPlace(
      { kind: "city", name: "Eagle" },
      { city, state, region },
      isWithinClassifiedCityRadius,
    );
  assert.equal(matches("Boise", "ID"), true);
  assert.equal(matches("Twin Falls", "ID"), false);
  assert.equal(matches("Boise", "UT"), false);
  assert.equal(matches("Unknown village", "ID"), false);
  assert.equal(
    matchesSeoPlace(
      { kind: "region", name: "North Idaho" },
      { city: "Eagle", state: "ID", region: "Treasure Valley" },
      isWithinClassifiedCityRadius,
    ),
    false,
  );
});

test("eligibility boundary and out of range pages agree", () => {
  const now = Date.parse("2026-10-15T12:00:00Z");
  const boundary = new Date(now - 30 * 86400000).toISOString();
  assert.equal(isIndexablePlaceInventory(5, boundary, now), true);
  assert.equal(
    isIndexablePlaceInventory(5, new Date(now - 30 * 86400000 - 1).toISOString(), now),
    false,
  );
  assert.equal(isIndexablePlaceInventory(4, boundary, now), false);
  assert.equal(isIndexablePlaceInventory(3, boundary, now, 3), true);
  assert.equal(isIndexablePlaceInventory(5, "invalid", now), false);
  assert.equal(isOutOfRangePage(2, 25, 24), false);
  assert.equal(isOutOfRangePage(3, 25, 24), true);
  assert.equal(isOutOfRangePage(1, 0, 24), false);
  assert.equal(isOutOfRangePage(2, 0, 24), true);
});

test("host redirects retain path/query and preview hosts never redirect into editor", () => {
  for (const host of ["www.onbluebird.com", "gemstateclassifieds.lovable.app"]) {
    assert.deepEqual(seoHostPolicy(new URL(`https://${host}/browse?category=pets&page=2`)), {
      redirect: "https://onbluebird.com/browse?category=pets&page=2",
      preview: false,
    });
  }
  assert.deepEqual(seoHostPolicy(new URL("https://onbluebird.com/")), {
    redirect: null,
    preview: false,
  });
  for (const host of ["preview-test.lovable.app", "id.lovableproject.com", "localhost"]) {
    assert.deepEqual(seoHostPolicy(new URL(`https://${host}/`)), { redirect: null, preview: true });
  }
});

test("shared preview metadata uses same listing photo in Open Graph and Twitter", () => {
  const meta = socialImageMeta(
    "https://onbluebird.com",
    "/media/listings/listing/0",
    "Sterling silver ring",
  );
  assert.equal(
    meta.find((x) => x.property === "og:image").content,
    "https://onbluebird.com/media/listings/listing/0",
  );
  assert.equal(
    meta.find((x) => x.name === "twitter:image").content,
    "https://onbluebird.com/media/listings/listing/0",
  );
  assert.equal(meta.find((x) => x.property === "og:image:alt").content, "Sterling silver ring");
  assert.match(socialImageMeta("https://onbluebird.com")[0].content, /marketplace-share\.jpg$/);
});

const event = (name, visit, extra = {}, user_id = null) => ({
  name,
  user_id,
  props: {
    site_host: "onbluebird.com",
    traffic_visit: visit,
    traffic_source: "google",
    traffic_channel: "search",
    ...extra,
  },
});
const options = { staffIds: new Set(["admin"]), domain: "onbluebird.com", windowDays: 30 };

test("a completed inquiry counts once and contact clicks remain separate", () => {
  const events = [
    event("visit_started", "buyer"),
    event("seller_contacted", "buyer", { method: "call" }),
    event("inquiry_completed", "buyer", { event_id: "message:conversation" }, "ordinary"),
    event("inquiry_completed", "buyer", { event_id: "message:conversation" }, "ordinary"),
    event("inquiry_completed", "buyer", { event_id: "apply:application" }, "ordinary"),
  ];
  const result = summarizeTraffic(events, options);
  assert.equal(result.totals.visits, 1);
  assert.equal(result.totals.contacts, 1);
  assert.equal(result.conversions.inquiriesSent, 2);
});

test("staff, QA and bots exclude their whole visit, including anonymous entry", () => {
  const events = [
    event("visit_started", "staff"),
    event("listing_viewed", "staff", {}, "admin"),
    event("visit_started", "qa"),
    event("inquiry_completed", "qa", { is_internal: true }),
    event("visit_started", "bot", { is_bot: true }),
    event("visit_started", "preview", { site_host: "preview.lovable.app" }),
    event("visit_started", "ordinary", {}, "ordinary"),
  ];
  assert.deepEqual(
    eligibleTrafficEvents(events, options).map((e) => e.props.traffic_visit),
    ["ordinary"],
  );
  assert.equal(summarizeTraffic(events, options).totals.visits, 1);
  assert.equal(isInternalAnalyticsQuery("?_verify=release"), true);
  assert.equal(isInternalAnalyticsQuery("?_qa=1"), true);
  assert.equal(isInternalAnalyticsQuery("?page=2"), false);
  assert.equal(isKnownAutomatedAgent("Mozilla Lighthouse Chrome"), true);
  assert.equal(isKnownAutomatedAgent("Mozilla Chrome Safari"), false);
});

test("real user vitals count documents rather than observer updates and group screen/template", () => {
  const vital = (id, value, metric = "LCP", template = "home", device = "mobile") => ({
    name: "web_vital",
    props: { metric_id: id, value, metric, template, device },
  });
  const groups = summarizeVitals([
    vital("1", 1000),
    vital("1", 5000),
    vital("2", 2000),
    vital("3", 2500),
    vital("4", 3000),
    vital("5", 0.1, "CLS"),
    vital("6", 201, "INP", "browse", "desktop"),
    vital("bad", null),
    vital("bad2", -1),
    vital("bad3", Infinity),
    vital("bad4", 1000, "LCP", "home", "unknown"),
  ]);
  assert.deepEqual(groups[0], {
    metric: "LCP",
    template: "home",
    device: "mobile",
    samples: 4,
    p75: 3000,
    unit: "ms",
    rating: "needs-improvement",
  });
  assert.equal(groups[1].rating, "good");
  assert.equal(groups[2].rating, "needs-improvement");
  for (const path of ["/account", "/admin/traffic", "/claim-seller", "/auth"])
    assert.equal(performancePageTemplate(path), null);
});

test("auth return is not organic acquisition; personal campaign values are not recorded", () => {
  for (const referrer of [
    "https://accounts.google.com/",
    "https://udxxfuticbxwiehoepeg.supabase.co/auth/v1/callback",
    "https://checkout.stripe.com/",
  ])
    assert.deepEqual(classifyTrafficSource(referrer, "", "onbluebird.com"), {
      source: "direct",
      channel: "direct",
    });
  assert.deepEqual(
    classifyTrafficSource("", "?utm_source=google&utm_medium=organic", "onbluebird.com"),
    { source: "google", channel: "search" },
  );
  assert.equal(
    classifyTrafficSource("", "?utm_source=person%40example.com", "onbluebird.com").source,
    "tagged-campaign",
  );
  assert.doesNotThrow(() =>
    classifyTrafficSource("", "?ref=share", "onbluebird.com", "/sellers/%xx"),
  );
});
