import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import {
  loadMobileNotifications,
  markMobileNotificationsRead,
} from "../src/lib/mobile-notifications.server.ts";
import { mobileLinkTarget } from "../src/lib/mobile-contract.ts";
import { notificationFixture, notificationActors } from "./support/mobile-notification-fixture.mjs";
const { a, b } = notificationActors;
const request = (ids) =>
  new Request("https://onbluebird.com/api/mobile/v1/notifications/read", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ids }),
  });
test("native inbox proves owner, catalog, blocked participants and safe destinations before publishing text or counts", async () => {
  const f = notificationFixture(),
    inbox = await loadMobileNotifications(f.client(a), f.db, a);
  assert.equal(inbox.ownerId, a);
  assert.equal(inbox.unread, 5);
  assert.equal(inbox.unreadMessages, 1);
  assert.deepEqual(
    new Set(inbox.items.map((n) => n.id)),
    new Set(
      ["visibleMessage", "visibleShopping", "visibleReview", "visibleAccount", "visibleJob"].map(
        (k) => f.rows[k].id,
      ),
    ),
  );
  assert.equal(
    inbox.items.find((n) => n.id === f.rows.visibleMessage.id).destinationUrl,
    `/messages/${f.ids.conversation}`,
  );
  assert.equal(inbox.items.find((n) => n.id === f.rows.visibleReview.id).destinationUrl, null);
  assert.equal(inbox.items.find((n) => n.id === f.rows.visibleJob.id).destinationUrl, null);
  assert(f.calls.some((c) => c.table === "notifications" && c.key === "user_id" && c.value === a));
  assert(!JSON.stringify(inbox).includes("Second account"));
  assert(!JSON.stringify(inbox).includes("Restricted fixture"));
  assert(!JSON.stringify(inbox).includes("Blocked fixture"));
});
test("external notification context reuses one publication read even before a new vehicle reaches the shopper cache", async () => {
  const f = notificationFixture(),
    id = `dealerfeed-${f.ids.dealer}`;
  for (let i = 0; i < 10; i++)
    f.add(
      a,
      "shopping_alert",
      `Dealer fixture ${i}`,
      "shopping_alert",
      randomUUID(),
      `/listings/${id}`,
    );
  const inbox = await loadMobileNotifications(f.client(a), f.db, a);
  assert.equal(inbox.items.filter((n) => n.destinationUrl === `/listings/${id}`).length, 10);
  assert.equal(f.calls.filter((c) => c.rpc === "read_published_dealer_inventory").length, 1);
  f.feed.vehicles = [];
  const withdrawn = await loadMobileNotifications(f.client(a), f.db, a);
  assert.equal(
    withdrawn.items.some((n) => n.destinationUrl === `/listings/${id}`),
    false,
  );
});
test("mark-all and retries never touch another member, blocked/restricted rows, or paid website activity", async () => {
  const f = notificationFixture();
  const result = await markMobileNotificationsRead(request(null), f.client(a), f.db, a);
  assert.equal(result.updated, 5);
  assert.equal(f.writes.length, 1);
  assert(Array.isArray(f.writes[0].args._ids));
  for (const key of ["foreign", "restrictedNotice", "blockedNotice", "paid"])
    assert.equal(f.tables.notifications.find((n) => n.id === f.rows[key].id).read_at, null);
  const original = f.rows.visibleMessage.id,
    readAt = f.tables.notifications.find((n) => n.id === original).read_at;
  await markMobileNotificationsRead(request([original]), f.client(a), f.db, a);
  assert.equal(f.writes.length, 1);
  assert.equal(f.tables.notifications.find((n) => n.id === original).read_at, readAt);
  await assert.rejects(
    markMobileNotificationsRead(
      new Request("https://onbluebird.com/api/mobile/v1/notifications/read", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids: null, userId: b }),
      }),
      f.client(a),
      f.db,
      a,
    ),
  );
  assert.equal(f.writes.length, 1);
});
test("a lost read response can be retried without a second write or consuming newly arrived activity", async () => {
  const f = notificationFixture();
  const id = f.rows.visibleShopping.id;
  f.loseNextRead();
  await assert.rejects(
    markMobileNotificationsRead(request([id]), f.client(a), f.db, a),
    /lost after commit/,
  );
  const fresh = f.add(a, "security", "A genuinely new security notice");
  const repeat = await markMobileNotificationsRead(request([id]), f.client(a), f.db, a);
  assert.equal(repeat.updated, 0);
  assert.equal(f.writes.length, 1);
  assert.equal(f.tables.notifications.find((n) => n.id === fresh.id).read_at, null);
});
test("malformed and foreign destinations cannot bypass verified contexts, and data failures never become empty success", async () => {
  const f = notificationFixture();
  for (const destination of [
    "https://evil.example/listings/" + f.ids.ask,
    "javascript:alert(1)",
    "//evil.example/listings/" + f.ids.ask,
    "/listings/" + f.ids.restricted,
    "/listings/" + f.ids.ask + "?upgrade=true",
    "/account?section=billing",
  ])
    f.add(a, "listing_reviewed", "Unsafe fixture", "listing", f.ids.ask, destination);
  const inbox = await loadMobileNotifications(f.client(a), f.db, a);
  assert.equal(
    inbox.items.some((n) => n.title === "Unsafe fixture"),
    false,
  );
  f.fail("asks");
  await assert.rejects(loadMobileNotifications(f.client(a), f.db, a), (e) => e.status === 503);
});
test("account notification deep links remain on the approved first-party app destination", () => {
  assert.equal(mobileLinkTarget("https://onbluebird.com/notifications"), "/account/notifications");
  assert.equal(
    mobileLinkTarget("https://onbluebird.com/account?section=notifications"),
    "/account/notifications",
  );
  assert.equal(mobileLinkTarget("https://evil.example/notifications"), null);
  assert.equal(
    mobileLinkTarget("com.onbluebird.marketplace://user:password@auth/callback?code=bad"),
    null,
  );
  assert.equal(mobileLinkTarget("https://onbluebird.com/account?section=billing"), null);
});

test("login callbacks restore only a recent supported app destination and consume it once", async () => {
  const { rememberNativeAuthDestination, consumeNativeAuthDestination } =
    await import("../apps/mobile/src/auth-destination.ts");
  const previous = globalThis.localStorage;
  const entries = new Map();
  globalThis.localStorage = {
    getItem: (key) => entries.get(key) ?? null,
    setItem: (key, value) => entries.set(key, value),
    removeItem: (key) => entries.delete(key),
  };
  try {
    for (const path of ["/account/notifications", `/messages/${randomUUID()}`, "/post"]) {
      rememberNativeAuthDestination(path);
      assert.equal(consumeNativeAuthDestination(), path);
      assert.equal(consumeNativeAuthDestination(), "/account/profile");
    }
    for (const path of [
      "https://evil.example/notifications",
      "//evil.example",
      "/account/billing",
      "/account/notifications?token=private",
      "/messages/../billing",
    ]) {
      rememberNativeAuthDestination(path);
      assert.equal(consumeNativeAuthDestination(), "/account/profile");
    }
    rememberNativeAuthDestination("/account/notifications");
    const [key, value] = [...entries][0];
    entries.set(key, JSON.stringify({ ...JSON.parse(value), expiresAt: Date.now() - 1 }));
    assert.equal(consumeNativeAuthDestination(), "/account/profile");
  } finally {
    globalThis.localStorage = previous;
  }
});

test("finishing sign-in replaces the callback entry and preserves the app's own history boundary", async () => {
  const { rememberNativeAuthDestination, completeNativeAuthNavigation } =
    await import("../apps/mobile/src/auth-destination.ts");
  const prior = {
    localStorage: globalThis.localStorage,
    history: globalThis.history,
    window: globalThis.window,
    location: globalThis.location,
  };
  const store = new Map();
  let replacement, event;
  globalThis.localStorage = {
    setItem: (k, v) => store.set(k, v),
    getItem: (k) => store.get(k) ?? null,
    removeItem: (k) => store.delete(k),
  };
  globalThis.location = { pathname: "/" };
  const state = { bluebirdNavigationIndex: 2 };
  globalThis.history = {
    state,
    replaceState: (value, _title, path) => (replacement = { value, path }),
  };
  globalThis.window = { dispatchEvent: (e) => (event = e) };
  try {
    rememberNativeAuthDestination("/account/notifications");
    assert.equal(completeNativeAuthNavigation(), "/account/notifications");
    assert.deepEqual(replacement, { value: state, path: "/#/account/notifications" });
    assert.equal(event.type, "hashchange");
    assert.equal(store.size, 0);
  } finally {
    Object.assign(globalThis, prior);
  }
});

test("a listing review requires its seller, and cached references cannot borrow another listing's catalog identity", async () => {
  const f = notificationFixture();
  f.tables.asks.find((n) => n.id === f.ids.ask).seller_id = b;
  f.add(a, "listing_reviewed", "Not your review", "listing", f.ids.ask, `/listings/${f.ids.ask}`);
  const external = "adzuna-42";
  f.tables.shopping_inventory.push({
    listing_id: external,
    card: { id: "other-listing", title: "A job", categorySlug: "jobs" },
    valid_until: new Date(Date.now() + 86400000).toISOString(),
  });
  f.add(
    a,
    "shopping_alert",
    "Wrong reference",
    "shopping_alert",
    randomUUID(),
    `/listings/${external}`,
  );
  const inbox = await loadMobileNotifications(f.client(a), f.db, a);
  assert.equal(
    inbox.items.some((n) => ["Not your review", "Wrong reference"].includes(n.title)),
    false,
  );
});

test("expired eligible listings retain authorized message context while shopping reminders remain suppressed", async () => {
  const { mobileNativeConversationListings } =
    await import("../src/lib/mobile-message-context.server.ts");
  const f = notificationFixture();
  f.tables.asks.find((n) => n.id === f.ids.ask).expires_at = new Date(
    Date.now() - 60000,
  ).toISOString();
  const inbox = await loadMobileNotifications(f.client(a), f.db, a);
  assert.equal(
    inbox.items.some((n) => n.id === f.rows.visibleMessage.id),
    true,
  );
  assert.equal(
    inbox.items.some((n) => n.id === f.rows.visibleShopping.id),
    false,
  );
  assert.equal(inbox.unreadMessages, 1);
  const eligible = await mobileNativeConversationListings(f.db, [
    f.ids.ask,
    f.ids.restricted,
    f.ids.ask,
  ]);
  assert(eligible.has(f.ids.ask));
  assert.equal(eligible.has(f.ids.restricted), false);
  assert.equal(eligible.size, 1);
  f.tables.asks.find((n) => n.id === f.ids.ask).is_demo = true;
  assert.equal((await mobileNativeConversationListings(f.db, [f.ids.ask])).size, 0);
});
