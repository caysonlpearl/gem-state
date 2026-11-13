import test from "node:test";
import assert from "node:assert/strict";
import { createMobileHandler, MobileApiError, mobileJson } from "../src/lib/mobile-api.ts";
import {
  mobileCategories,
  mobileListingAllowed,
  mobileOriginAllowed,
  mobileLinkTarget,
  mobilePublishableKey,
  mobileMediaUrl,
} from "../src/lib/mobile-contract.ts";
import { prepareMobilePush, pushRetryDelay } from "../src/lib/mobile-push.ts";
import { mobileCachedBrowse } from "../src/lib/mobile-catalog.ts";
import { mobileAdvertisingAllowed, mobileAdEvent } from "../src/lib/mobile-advertising.ts";

test("store boundary excludes restricted/unknown inventory and miscategorized weapons", () => {
  assert(!mobileCategories.some((c) => c.slug === "firearms"));
  for (const card of [
    { categorySlug: "firearms", title: "Collectible" },
    { categorySlug: null, title: "Truck" },
    { categorySlug: "general", title: "Glock pistol" },
    { categorySlug: "tools-equipment", title: "Rifle ammunition" },
    { categorySlug: "general", externalMerchandise: { source: "Guns.com" } },
    { categorySlug: "general", isMock: true },
  ])
    assert.equal(mobileListingAllowed(card), false);
  assert(mobileListingAllowed({ categorySlug: "cars-trucks", title: "Ford F-150" }));
  assert(mobileListingAllowed({ categorySlug: "other-real-estate", title: "Two-bedroom home" }));
});
test("deep links accept only known destinations and preserve conversation identity", () => {
  assert.equal(
    mobileLinkTarget("https://onbluebird.com/listings/dealerfeed-abc"),
    "/listings/dealerfeed-abc",
  );
  assert.equal(
    mobileLinkTarget(
      "https://onbluebird.com/account?section=messages&conversation=11111111-1111-4111-8111-111111111111",
    ),
    "/messages/11111111-1111-4111-8111-111111111111",
  );
  for (const url of [
    "javascript:alert(1)",
    "https://onbluebird.com.evil.com/listings/abc",
    "https://evil.com/listings/abc",
    "https://onbluebird.com/create-listing",
    "https://onbluebird.com/checkout",
    "https://onbluebird.com/listings/a/../../checkout",
    "com.onbluebird.marketplace://evil/callback",
  ])
    assert.equal(mobileLinkTarget(url), null);
});
test("production origins are explicit, and local development is opt-in", () => {
  assert(mobileOriginAllowed("capacitor://localhost"));
  assert(mobileOriginAllowed(null));
  assert(!mobileOriginAllowed("http://localhost:5174"));
  assert(mobileOriginAllowed("http://localhost:5174", true));
  assert(!mobileOriginAllowed("https://onbluebird.com.evil.com"));
});
test("bootstrap cannot expose a misconfigured service-role key", () => {
  const jwt = (role) =>
    `header.${Buffer.from(JSON.stringify({ role })).toString("base64url")}.signature`;
  assert(mobilePublishableKey(jwt("anon")));
  assert(mobilePublishableKey("sb_publishable_example"));
  assert(!mobilePublishableKey(jwt("service_role")));
  assert(!mobilePublishableKey("sb_secret_example"));
  assert(!mobilePublishableKey("invalid"));
});
test("relative media targets the real site instead of the packaged app origin", () => {
  assert.equal(mobileMediaUrl("/images/listing.jpg"), "https://onbluebird.com/images/listing.jpg");
  assert.equal(mobileMediaUrl("http://insecure.example/image.jpg"), null);
  assert.equal(mobileMediaUrl("javascript:alert(1)"), null);
  assert.equal(mobileMediaUrl("https://user:password@evil.example/image.jpg"), null);
});
test("CORS rejects unsupported origins before dispatch and does not use cookie credentials", async () => {
  let calls = 0;
  const handler = createMobileHandler(async () => {
    calls++;
    return { ok: true };
  });
  const denied = await handler(
    new Request("https://onbluebird.com/api/mobile/v1/account", {
      headers: { Origin: "https://evil.com" },
    }),
  );
  assert.equal(denied.status, 403);
  assert.equal(calls, 0);
  assert.equal(denied.headers.get("access-control-allow-origin"), null);
  const preflight = await handler(
    new Request("https://onbluebird.com/api/mobile/v1/account", {
      method: "OPTIONS",
      headers: { Origin: "capacitor://localhost" },
    }),
  );
  assert.equal(preflight.status, 204);
  assert.equal(calls, 0);
  assert.equal(preflight.headers.get("access-control-allow-origin"), "capacitor://localhost");
  assert.equal(preflight.headers.get("access-control-allow-credentials"), null);
});
test("versioned envelopes preserve domain auth status and suppress private diagnostics", async () => {
  const denied = createMobileHandler(async () => {
    throw new MobileApiError(401, "sign_in_required", "Please sign in.");
  });
  const response = await denied(new Request("https://onbluebird.com/api/mobile/v1/account"));
  assert.equal(response.status, 401);
  assert.equal((await response.json()).error.code, "sign_in_required");
  const previous = console.error;
  console.error = () => {};
  try {
    const failing = createMobileHandler(async () => {
      throw Error("provider-token-private user@example.com");
    });
    const r = await failing(new Request("https://onbluebird.com/api/mobile/v1/account"));
    assert.equal(r.status, 503);
    assert(!JSON.stringify(await r.json()).includes("provider-token-private"));
    assert.equal(r.headers.get("cache-control"), "no-store");
  } finally {
    console.error = previous;
  }
});
test("JSON parsing bounds streamed bodies, rejects arrays and requires content type", async () => {
  const req = (body) =>
    new Request("https://onbluebird.com/api/mobile/v1/consent", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body,
    });
  assert.deepEqual(await mobileJson(req('{"shoppingAlerts":false}')), { shoppingAlerts: false });
  for (const body of ["null", "[]", "not json"])
    await assert.rejects(
      () => mobileJson(req(body)),
      (e) => e.status === 400,
    );
  await assert.rejects(
    () => mobileJson(req(JSON.stringify({ message: "a".repeat(70000) }))),
    (e) => e.status === 413,
  );
  await assert.rejects(
    () => mobileJson(new Request("https://example.com", { method: "POST", body: "{}" })),
    (e) => e.status === 415,
  );
});
const now = Date.parse("2026-11-13T00:00:00Z");
const candidate = {
  kind: "message",
  readAt: null,
  createdAt: new Date(now - 1000).toISOString(),
  userId: "a",
  deviceUserId: "a",
  destination: "https://onbluebird.com/account?section=messages",
  listing: { categorySlug: "cars-trucks", title: "Truck" },
  shoppingAlerts: false,
  messageAlerts: true,
  blocked: false,
  deletionRequested: false,
};
test("push checks account ownership, blocks, availability, consent and age at send time", () => {
  assert(prepareMobilePush(candidate, now));
  for (const override of [
    { deviceUserId: "b" },
    { readAt: "now" },
    { blocked: true },
    { deletionRequested: true },
    { listing: null },
    { messageAlerts: false },
    { createdAt: new Date(now - 8 * 86400000).toISOString() },
    { listing: { categorySlug: "firearms" } },
    { destination: "https://evil.com" },
    { kind: "shopping_alert" },
  ])
    assert.equal(prepareMobilePush({ ...candidate, ...override }, now), null);
  assert(
    prepareMobilePush(
      {
        ...candidate,
        kind: "shopping_alert",
        shoppingAlerts: true,
        destination: "https://onbluebird.com/listings/abc",
      },
      now,
    ),
  );
  assert(!prepareMobilePush({ ...candidate, createdAt: "invalid" }, now));
});
test("push content never includes conversation text or personal listing data", () => {
  const push = prepareMobilePush(candidate, now);
  assert.equal(push.body, "You have a new marketplace message.");
  assert(!JSON.stringify(push).includes("Truck"));
  assert.equal(pushRetryDelay(1), 15);
  assert.equal(pushRetryDelay(99), 3600);
});
test("cache fallback retains filters and sorts, excludes stale sources, and declares partial coverage", () => {
  const card = (id, price, title = "Truck") => ({
    id,
    title,
    categorySlug: "cars-trucks",
    priceCents: price,
    city: "Boise",
    state: "ID",
    createdAt: new Date(now).toISOString(),
  });
  const snapshot = {
    sections: {
      fresh: {
        updatedAt: now,
        cards: [
          card("a", 10000),
          card("b", 20000),
          { ...card("weapon", 10000), categorySlug: "firearms" },
          card("a", 10000),
        ],
      },
      stale: { updatedAt: now - 7 * 3600000, cards: [card("stale", 30000)] },
    },
  };
  const result = mobileCachedBrowse(
    snapshot,
    { priceMin: 100, priceMax: 200, city: "Boise", sort: "price_high" },
    now,
  );
  assert.deepEqual(
    result.listings.map((c) => c.id),
    ["b", "a"],
  );
  assert.equal(result.incomplete, true);
  assert.equal(
    mobileCachedBrowse(snapshot, { category: "other-real-estate" }, now).listings.length,
    0,
  );
});
test("advertising requires affirmative consent and iOS tracking permission", () => {
  assert(!mobileAdvertisingAllowed(null));
  for (const att of ["denied", "restricted", "not_determined", "not_applicable"])
    assert(!mobileAdvertisingAllowed({ advertising: true, platform: "ios", att }));
  assert(mobileAdvertisingAllowed({ advertising: true, platform: "ios", att: "authorized" }));
  assert(
    mobileAdvertisingAllowed({ advertising: true, platform: "android", att: "not_applicable" }),
  );
  assert(
    !mobileAdvertisingAllowed({ advertising: false, platform: "android", att: "not_applicable" }),
  );
  const event = mobileAdEvent(
    "listing_viewed",
    "11111111-1111-4111-8111-111111111111",
    "cars-trucks",
  );
  assert.deepEqual(Object.keys(event.parameters), ["event_id", "item_category"]);
  assert.equal(
    mobileAdEvent("search", "11111111-1111-4111-8111-111111111111", "cars-trucks"),
    null,
  );
  assert.equal(
    mobileAdEvent("listing_viewed", "11111111-1111-4111-8111-111111111111", "firearms"),
    null,
  );
});

test("ad event allowlist rejects inherited object names", () => {
  for (const kind of ["constructor", "toString", "__proto__"])
    assert.equal(mobileAdEvent(kind, "11111111-1111-4111-8111-111111111111", "general"), null);
});
