import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { shoppingPushStillEligible } from "../infra/mobile/push-worker.mjs";
import { cachedMobilePushListing } from "../src/lib/mobile-push-catalog.ts";
function fixture() {
  const user = randomUUID(),
    qid = randomUUID(),
    now = new Date().toISOString(),
    listing = "dealerfeed-car";
  const card = {
    id: listing,
    title: "Family car",
    categorySlug: "cars-trucks",
    priceCents: 1000000,
    createdAt: now,
  };
  const rows = {
    shopping_controls: [{ id: true, notifications: true }],
    shopping_accounts: [{ user_id: user, shopping_alerts: true, history_after: "1970-01-01" }],
    shopping_privacy: [{ subject: "u:" + user, personalization: true }],
    shopping_queue: [
      {
        id: qid,
        user_id: user,
        listing_id: listing,
        kind: "price_drop",
        requested: false,
        status: "sent",
        created_at: now,
        payload: { price_version: "two", previous_price_cents: 1100000 },
      },
    ],
    shopping_inventory: [
      {
        listing_id: listing,
        card,
        valid_until: new Date(Date.now() + 3600000).toISOString(),
        price_cents: 1000000,
        price_version: "two",
      },
    ],
    shopping_choices: [],
    partner_job_reports: [],
    partner_vehicle_reports: [],
    published_feed: [{ id: "car" }],
    shopping_events: [],
    shopping_favorites: [],
    saved_searches: [],
    account_notification_preferences: [],
    asks: [],
  };
  const db = {
    rpc: async (name) => {
      if (name === "read_published_dealer_inventory")
        return { data: { vehicles: rows.published_feed } };
      assert.equal(name, "shopping_saved_interests");
      return { data: [] };
    },
    from(table) {
      assert(table in rows, "Unexpected data/provider " + table);
      let selected = rows[table];
      const value = (r, k) => k.split(".").reduce((o, key) => o?.[key], r);
      const q = {
        select() {
          return q;
        },
        eq(k, v) {
          selected = selected.filter((r) => value(r, k) === v);
          return q;
        },
        gte(k, v) {
          selected = selected.filter((r) => value(r, k) >= v);
          return q;
        },
        gt(k, v) {
          selected = selected.filter((r) => value(r, k) > v);
          return q;
        },
        not(k, _, v) {
          selected = selected.filter((r) => value(r, k) !== v);
          return q;
        },
        in(k, v) {
          selected = selected.filter((r) => v.includes(value(r, k)));
          return q;
        },
        order() {
          return q;
        },
        limit() {
          return q;
        },
        single: async () => ({ data: selected[0] ?? null }),
        maybeSingle: async () => ({ data: selected[0] ?? null }),
        then(resolve) {
          return Promise.resolve({ data: selected, error: null }).then(resolve);
        },
      };
      return q;
    },
  };
  const activity = (kind) =>
    rows.shopping_events.push({
      id: randomUUID(),
      subject: "u:" + user,
      session_id: randomUUID(),
      kind,
      listing_id: listing,
      occurred_at: now,
    });
  return {
    db,
    rows,
    user,
    qid,
    listing,
    activity,
    allowed: () => shoppingPushStillEligible(db, user, qid, listing),
  };
}
test("phone shopping delivery remains independent from email-provider failures", async () => {
  const f = fixture();
  assert.equal(await f.allowed(), true);
  f.rows.shopping_queue[0].status = "failed";
  assert.equal(await f.allowed(), true);
  f.rows.shopping_queue[0].status = "suppressed";
  assert.equal(await f.allowed(), false);
});
for (const kind of ["dismiss", "purchase"])
  test("phone delivery rechecks current " + kind + " activity", async () => {
    const f = fixture();
    f.activity(kind);
    assert.equal(await f.allowed(), false);
  });
test("phone shopping delivery checks shared pause, privacy, price confirmation and account ownership", async () => {
  for (const mutate of [
    (f) => (f.rows.shopping_controls[0].notifications = false),
    (f) => (f.rows.shopping_privacy[0].personalization = false),
    (f) => (f.rows.shopping_accounts[0].shopping_alerts = false),
    (f) => (f.rows.shopping_inventory[0].price_version = "three"),
    (f) => (f.rows.shopping_queue[0].user_id = randomUUID()),
    (f) => (f.rows.shopping_inventory[0].valid_until = "2000-01-01"),
  ]) {
    const f = fixture();
    mutate(f);
    assert.equal(await f.allowed(), false);
  }
});
test("phone reminders stop during the seven-day exact-listing contact pause", async () => {
  const f = fixture(),
    at = new Date(Date.now() - 25 * 3600000).toISOString();
  f.rows.shopping_queue[0].kind = "reminder";
  f.rows.shopping_queue[0].payload = { interest_at: Date.parse(at), step: 1 };
  f.rows.shopping_events.push({
    id: randomUUID(),
    subject: "u:" + f.user,
    session_id: randomUUID(),
    kind: "save",
    listing_id: f.listing,
    occurred_at: at,
  });
  assert.equal(await f.allowed(), true);
  f.activity("contact");
  assert.equal(await f.allowed(), false);
});
test("push listing eligibility uses cached inventory and current native status only", async () => {
  const f = fixture();
  assert.equal((await cachedMobilePushListing(f.db, f.listing)).id, f.listing);
  f.rows.shopping_inventory[0].card.categorySlug = "firearms";
  assert.equal(await cachedMobilePushListing(f.db, f.listing), null);
  const id = randomUUID();
  f.rows.shopping_inventory[0].listing_id = id;
  f.rows.shopping_inventory[0].card = { id, title: "Desk", categorySlug: "general" };
  f.rows.asks = [
    {
      id,
      status: "active",
      is_demo: false,
      approved_at: new Date().toISOString(),
      expires_at: new Date(Date.now() + 3600000).toISOString(),
      products: { status: "published" },
    },
  ];
  assert.equal((await cachedMobilePushListing(f.db, id)).available, true);
  f.rows.asks[0].status = "sold";
  assert.equal(await cachedMobilePushListing(f.db, id), null);
});

test("phone delivery suppresses unpublished or moderated external listings", async () => {
  const f = fixture();
  f.rows.published_feed = [];
  assert.equal(await f.allowed(), false);
  assert.equal(await cachedMobilePushListing(f.db, f.listing), null);
  const g = fixture();
  g.rows.partner_vehicle_reports.push({ listing_id: g.listing, status: "reviewed" });
  assert.equal(await g.allowed(), false);
});
test("phone reminders share durable stop rules without suppressing their own email receipt", async () => {
  const f = fixture(),
    anchor = Date.now() - 25 * 3600000;
  const item = f.rows.shopping_queue[0];
  item.kind = "reminder";
  item.payload = { interest_at: anchor, step: 1 };
  f.rows.shopping_events.push({
    id: randomUUID(),
    subject: "u:" + f.user,
    session_id: randomUUID(),
    kind: "save",
    listing_id: f.listing,
    occurred_at: new Date(anchor).toISOString(),
  });
  f.rows.shopping_choices.push({
    subject: "u:" + f.user,
    listing_id: f.listing,
    reminder_anchor: anchor,
    reminder_step: 1,
  });
  assert.equal(await f.allowed(), true);
  item.status = "pending";
  assert.equal(await f.allowed(), false);
  item.status = "sent";
  f.rows.shopping_choices[0].reminder_step = 3;
  assert.equal(await f.allowed(), false);
});
