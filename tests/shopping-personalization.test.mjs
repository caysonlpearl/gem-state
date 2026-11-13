import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import {
  shoppingEvent,
  shoppingFields,
  interests,
  reminderStep,
  rankShopping,
  matchesShoppingSearch,
} from "../src/lib/shopping-contract.ts";
import { evaluateShoppingRanking } from "../src/lib/shopping-learning.ts";
const day = 86400000,
  now = Date.parse("2026-11-12T12:00:00Z");
const event = (kind, at, session = "one", listingId = "dealerfeed-a") => ({
  id: randomUUID(),
  kind,
  at: new Date(at).toISOString(),
  session,
  listingId,
});
const card = (id, overrides = {}) => ({
  id,
  title: "2024 Ford F-150",
  categorySlug: "cars-trucks",
  priceCents: 2500000,
  city: "Boise",
  state: "ID",
  createdAt: new Date(now - day).toISOString(),
  vehicle: { make: "Ford", model: "F-150", year: 2024, mileage: 10000 },
  ...overrides,
});
test("browser events cannot forge verified outcomes or carry private message/payment/location fields", () => {
  for (const kind of ["purchase", "inquiry", "offer"])
    assert.equal(
      shoppingEvent({ id: randomUUID(), session: randomUUID(), kind, listingId: "a" }),
      null,
    );
  assert.deepEqual(
    shoppingFields(
      { message: "private", cardNumber: "1234", latitude: 1, longitude: 2, position: 2 },
      true,
    ),
    { position: 2 },
  );
  assert.deepEqual(
    shoppingFields({ q: "email me at person@example.com", priceMax: 25000, tax_id: "private" }),
    { priceMax: 25000 },
  );
  assert.equal(
    shoppingEvent({ id: "bad", session: randomUUID(), kind: "view", listingId: "a" }),
    null,
  );
});
test("signal weights decay over 14 days; favorites persist; duplicate events do not count twice", () => {
  const a = event("inquiry", now - 14 * day);
  assert.equal(interests([a, a], now).get(a.listingId).score, 6);
  assert.equal(interests([event("purchase", now)], now).get("dealerfeed-a").score, 20);
  assert.equal(interests([event("save", now - 120 * day)], now).get("dealerfeed-a").score, 10);
  const first = event("view", now - day, "a"),
    second = event("view", now - day, "b");
  assert.equal(interests([first, second], now).get(first.listingId).score, 4 * 2 ** (-1 / 14));
});
test("reminders require a favorite or two sessions within seven days, pause after contact and stop on purchase/dismissal", () => {
  const get = (events) => interests(events, now).get("dealerfeed-a");
  assert.equal(reminderStep(get([event("view", now - 2 * day)]), now), null);
  assert.equal(
    reminderStep(get([event("view", now - 20 * day, "a"), event("view", now - 2 * day, "b")]), now),
    null,
  );
  const views = [event("view", now - 4 * day, "a"), event("view", now - 2 * day, "b")];
  assert.equal(reminderStep(get(views), now), 1);
  assert.equal(reminderStep(get([event("save", now - 3 * day)]), now), 3);
  assert.equal(reminderStep(get([event("save", now - 7 * day)]), now), 7);
  for (const kind of ["contact", "purchase", "dismiss"])
    assert.equal(reminderStep(get([...views, event(kind, now - day)]), now), null);
  assert.equal(
    reminderStep(get([event("save", now - 9 * day), event("contact", now - 8 * day)]), now),
    7,
  );
});
test("shared filters respect vehicle, price, location, rental mode and item-detail restrictions", () => {
  const c = card("a");
  assert.equal(matchesShoppingSearch(c, { make: "Toyota" }), false);
  assert.equal(matchesShoppingSearch(c, { priceMax: 10000 }), false);
  assert.equal(matchesShoppingSearch(c, { make: "Ford", yearMin: 2020, state: "ID" }), true);
  assert.equal(matchesShoppingSearch(c, { categorySlug: "jobs" }), false);
  const home = card("h", {
    categorySlug: "other-real-estate",
    home: { mode: "rent", bedrooms: 2, bathrooms: 1 },
  });
  assert.equal(matchesShoppingSearch(home, { homeTab: "sale" }), false);
});
test("visual similarity affects rank; purchased and dismissed listings never return as candidates", () => {
  const cards = [card("a"), card("b"), card("c")],
    events = [event("save", now, "one", "a")];
  const vectors = new Map([
    ["a", [1, 0]],
    ["b", [1, 0]],
    ["c", [0, 1]],
  ]);
  assert.ok(
    rankShopping(cards, events, vectors, now).find((x) => x.card.id === "b").score >
      rankShopping(cards, events, vectors, now).find((x) => x.card.id === "c").score,
  );
  const ranked = rankShopping(
    cards,
    [...events, event("purchase", now, "one", "b"), event("dismiss", now, "one", "c")],
    vectors,
    now,
  );
  assert.deepEqual(
    ranked.map((x) => x.card.id),
    ["a"],
  );
});
test("learning retains baseline when verified outcome evidence is insufficient", () => {
  assert.equal(evaluateShoppingRanking([]).promoted, false);
});

async function fixture() {
  const db = new PGlite();
  await db.exec(`create role anon;create role authenticated;create role service_role;create schema auth;create schema extensions;
 create table auth.users(id uuid primary key,raw_user_meta_data jsonb default '{}');
 create table products(id uuid primary key,status text);
 create table analytics_events(id uuid,name text,user_id uuid,session_id text,props jsonb,created_at timestamptz);
 create table notifications(id uuid,user_id uuid,kind text,entity_id uuid);
 create table saved_searches(id uuid,user_id uuid,paused boolean,created_at timestamptz);
 create table asks(id uuid primary key,variant_id uuid,product_id uuid,status text,is_demo boolean,approved_at timestamptz,expires_at timestamptz);
 create table listing_inquiries(id uuid,buyer_id uuid,listing_id uuid);
 create table conversations(id uuid,buyer_id uuid,listing_id uuid,dealer_inventory_record_id uuid);
 create table orders(id uuid,buyer_id uuid,ask_id uuid,is_demo boolean,stripe_payment_status text,stripe_captured_at timestamptz,merchandise_cents bigint default 100,currency text default 'USD');
 create table verified_sales(id uuid,is_live boolean,order_id uuid,sold_at timestamptz);
 create table watchlist(user_id uuid,variant_id uuid,created_at timestamptz);
 create table saved_partner_vehicles(user_id uuid,listing_id text,created_at timestamptz);
 create table saved_partner_homes(user_id uuid,listing_id text,created_at timestamptz);
 create table saved_partner_jobs(user_id uuid,listing_id text,created_at timestamptz);`);
  let sql = readFileSync(
    new URL("../supabase/migrations/20261113010000_shopper_personalization.sql", import.meta.url),
    "utf8",
  );
  // PGlite does not ship pgvector/HNSW. Exercise all transactional SQL against
  // Postgres with an array distance stub; production verifies real vector DDL.
  sql = sql
    .replace("create extension if not exists vector with schema extensions;", "")
    .replace("extensions.vector(768)", "double precision[]")
    .replace(/create index shopping_vectors_cosine[^;]+;/, "");
  await db.exec(`create function extensions.test_distance(double precision[],double precision[]) returns double precision language sql immutable as $$select 0.0::double precision$$;
 create operator extensions.<=> (leftarg=double precision[],rightarg=double precision[],function=extensions.test_distance);`);
  await db.exec(sql);
  await db.exec(
    readFileSync(
      new URL(
        "../supabase/migrations/20261113023000_shopping_durable_choices.sql",
        import.meta.url,
      ),
      "utf8",
    ),
  );
  const user = randomUUID();
  await db.query("insert into auth.users(id) values($1)", [user]);
  return { db, user, subject: "u:" + user };
}
test("consent is audited and server history isolation, withdrawal, and retention are enforced", async () => {
  const { db, user, subject } = await fixture();
  try {
    await db.query("select set_shopping_privacy($1,$2,true,false,'v1')", [subject, user]);
    const id = randomUUID();
    await db.query(
      "insert into shopping_events(id,subject,user_id,session_id,kind,listing_id) values($1,$2,$3,$1,'view','dealerfeed-a')",
      [id, subject, user],
    );
    assert.equal((await db.query("select count(*)::int n from shopping_events")).rows[0].n, 1);
    await db.query("select set_shopping_privacy($1,$2,false,false,'v1')", [subject, user]);
    await db.query(
      "insert into shopping_events(id,subject,user_id,session_id,kind,listing_id) values($1,$2,$3,$1,'view','dealerfeed-a')",
      [randomUUID(), subject, user],
    );
    assert.equal((await db.query("select count(*)::int n from shopping_events")).rows[0].n, 0);
    assert.equal((await db.query("select count(*)::int n from shopping_consents")).rows[0].n, 4);
    const role = await db.query(
      "select has_table_privilege('authenticated','shopping_events','select') as allowed",
    );
    assert.equal(role.rows[0].allowed, false);
  } finally {
    await db.close();
  }
});
test("queue groups related events, deduplicates retries, permits multiple deliveries per day and suppresses queued mail on unsubscribe", async () => {
  const { db, user } = await fixture();
  try {
    await db.query("select set_shopping_account($1,true,true,'v1')", [user]);
    for (const listing of ["a", "b"])
      await db.query(
        "insert into shopping_queue(user_id,listing_id,kind,event_key) values($1,$2,'price_drop','price:v1') on conflict(user_id,listing_id,event_key) do nothing",
        [user, listing],
      );
    await db.query(
      "insert into shopping_queue(user_id,listing_id,kind,event_key) values($1,'a','price_drop','price:v1') on conflict(user_id,listing_id,event_key) do nothing",
      [user],
    );
    let d = (await db.query("select * from claim_shopping_delivery()")).rows[0];
    assert.equal(d.queue_ids.length, 2);
    assert.equal((await db.query("select * from claim_shopping_delivery()")).rows.length, 0);
    await db.query("update shopping_deliveries set status='sent' where id=$1", [d.id]);
    await db.exec("update shopping_queue set status='sent'");
    await db.query(
      "insert into shopping_queue(user_id,listing_id,kind,event_key) values($1,'c','price_drop','price:v2')",
      [user],
    );
    assert.equal((await db.query("select * from claim_shopping_delivery()")).rows.length, 0);
    await db.exec("update shopping_deliveries set created_at=now()-interval '16 minutes'");
    d = (await db.query("select * from claim_shopping_delivery()")).rows[0];
    assert.equal(d.queue_ids.length, 1);
    await db.query("select set_shopping_account($1,false,false,'v1')", [user]);
    assert.equal(
      (await db.query("select count(*)::int n from shopping_queue where status='processing'"))
        .rows[0].n,
      0,
    );
  } finally {
    await db.close();
  }
});
test("signup audit handles absent/invalid optional metadata; verified outcomes exclude authorization-only payments", async () => {
  const { db, user, subject } = await fixture();
  try {
    await db.query("insert into auth.users(id,raw_user_meta_data) values($1,$2)", [
      randomUUID(),
      { shopping_terms_version: "2026-11-12", shopping_alerts: "invalid" },
    ]);
    await db.query("select set_shopping_privacy($1,$2,true,false,'v1')", [subject, user]);
    const order = randomUUID(),
      listing = randomUUID();
    await db.query(
      "insert into orders(id,buyer_id,ask_id,is_demo,stripe_payment_status,stripe_captured_at) values($1,$2,$3,false,'requires_capture',null)",
      [order, user, listing],
    );
    assert.equal((await db.query("select count(*)::int n from shopping_events")).rows[0].n, 0);
    await db.query(
      "update orders set stripe_payment_status='succeeded',stripe_captured_at=now() where id=$1",
      [order],
    );
    assert.equal(
      (await db.query("select count(*)::int n from shopping_events where kind='purchase'")).rows[0]
        .n,
      1,
    );
    await db.query("update orders set stripe_payment_status='succeeded' where id=$1", [order]);
    assert.equal(
      (await db.query("select count(*)::int n from shopping_events where kind='purchase'")).rows[0]
        .n,
      1,
    );
  } finally {
    await db.close();
  }
});

test("declining broader email during onboarding preserves requested alerts; later unsubscribe suppresses them", async () => {
  const { db, user, subject } = await fixture();
  try {
    await db.query("select set_shopping_account($1,true,false,'v1')", [user]);
    const search = randomUUID(),
      queue = randomUUID();
    await db.query("insert into saved_searches values($1,$2,false,now())", [search, user]);
    await db.exec("update shopping_controls set notifications=true");
    await db.query(
      "insert into shopping_queue(id,user_id,listing_id,kind,event_key,requested,payload) values($1,$2,'a','match','match',true,$3)",
      [queue, user, { search_ids: [search] }],
    );
    await db.query("insert into notifications values($1,$2,'shopping_alert',$3)", [
      randomUUID(),
      user,
      queue,
    ]);
    assert.equal((await db.query("select count(*)::int n from notifications")).rows[0].n, 1);
    await db.query("select set_shopping_account($1,false,false,'v1')", [user]);
    await db.query("insert into notifications values($1,$2,'shopping_alert',$3)", [
      randomUUID(),
      user,
      queue,
    ]);
    assert.equal((await db.query("select count(*)::int n from notifications")).rows[0].n, 1);
  } finally {
    await db.close();
  }
});

test("late favorite and advertising writes cannot recreate optional tracking after withdrawal", async () => {
  const { db, user, subject } = await fixture();
  try {
    await db.query("select set_shopping_privacy($1,$2,false,false,'v1')", [subject, user]);
    await db.query("insert into shopping_favorites(subject,listing_id) values($1,'a')", [subject]);
    await db.query(
      "insert into shopping_ad_outbox(id,subject,provider,name,payload) values($1,$2,'meta','ViewContent','{}')",
      [randomUUID(), subject],
    );
    assert.equal((await db.query("select count(*)::int n from shopping_favorites")).rows[0].n, 0);
    assert.equal((await db.query("select count(*)::int n from shopping_ad_outbox")).rows[0].n, 0);
  } finally {
    await db.close();
  }
});

test("durable choices and reminder completion survive disposable history cleanup, then clear with withdrawal", async () => {
  const { db, user, subject } = await fixture();
  try {
    await db.query("select set_shopping_privacy($1,$2,true,false,'v1')", [subject, user]);
    await db.query("select set_shopping_account($1,true,true,'v1')", [user]);
    const event = async (kind, at) =>
      db.query(
        "insert into shopping_events(id,subject,user_id,session_id,kind,listing_id,occurred_at) values($1,$2,$3,$1,$4,'dealerfeed-a',$5)",
        [randomUUID(), subject, user, kind, at],
      );
    const now = Date.now();
    await event("dismiss", new Date(now).toISOString());
    await event("save", new Date(now - 1000).toISOString());
    assert.equal(
      (await db.query("select dismissed from shopping_choices")).rows[0].dismissed,
      true,
      "an older arriving save cannot undo dismissal",
    );
    await event("purchase", new Date(now).toISOString());
    const payload = JSON.stringify({ interest_at: now - 7 * 86400000, step: 7 });
    await db.query(
      "insert into shopping_queue(user_id,listing_id,kind,event_key,payload) values($1,'dealerfeed-a','reminder','sequence',$2)",
      [user, payload],
    );
    await db.exec("update shopping_queue set status='sent'");
    await db.exec("delete from shopping_queue; delete from shopping_events;");
    let state = (await db.query("select * from shopping_choices")).rows[0];
    assert.equal(state.reminder_step, 7);
    assert.equal(Number(state.reminder_anchor), now - 7 * 86400000);
    assert.equal(state.dismissed, true);
    assert.ok(state.purchased_at);
    assert.equal(
      (
        await db.query(
          "select has_table_privilege('authenticated','shopping_choices','select') allowed",
        )
      ).rows[0].allowed,
      false,
    );
    await db.query("select set_shopping_privacy($1,$2,false,false,'v1')", [subject, user]);
    assert.equal((await db.query("select count(*)::int n from shopping_choices")).rows[0].n, 0);
    await event("dismiss", new Date(now).toISOString());
    assert.equal(
      (await db.query("select count(*)::int n from shopping_choices")).rows[0].n,
      0,
      "withdrawn tracking cannot recreate choices",
    );
  } finally {
    await db.close();
  }
});
