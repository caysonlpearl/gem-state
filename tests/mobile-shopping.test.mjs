import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import ts from "typescript";
import { mobileShoppingEvent, mobileGuestSubject } from "../src/lib/mobile-shopping.ts";
import { shoppingDatabaseFixture } from "./helpers/shopping-database.mjs";

test("native activity drops fingerprinting, hardware, private data and forged outcomes", () => {
  const base = {
    id: randomUUID(),
    session: randomUUID(),
    kind: "view",
    listingId: "dealerfeed-car",
  };
  const event = mobileShoppingEvent({
    ...base,
    context: {
      fingerprint: "abc",
      memory: 64,
      cores: 8,
      timezone: "America/Boise",
      viewport: "390x844",
      message: "secret",
      position: 3,
      model: "rules-v1",
      seconds: 5,
    },
  });
  assert.deepEqual(event.context, {
    position: 3,
    model: "rules-v1",
    seconds: 5,
    platform: "native",
  });
  for (const kind of ["purchase", "inquiry", "offer"])
    assert.equal(mobileShoppingEvent({ ...base, kind }), null);
  assert.equal(
    mobileShoppingEvent({ ...base, kind: "search", search: { category: "firearms" } }),
    null,
  );
  assert.deepEqual(
    mobileShoppingEvent({
      ...base,
      kind: "search",
      search: { q: "person@example.com", priceMax: 150 },
    }).search,
    { priceMax: 150 },
  );
  assert.equal(mobileGuestSubject("victim"), null);
  const id = randomUUID();
  assert.equal(mobileGuestSubject(id), "g:" + id);
});

test("native personalization shares first-party history, preserves website ad consent, and suppresses pending pushes", async () => {
  const { db, user, subject } = await shoppingDatabaseFixture();
  try {
    await db.exec("alter table notifications add primary key(id)");
    for (const migration of [
      "20261113030000_mobile_foundation.sql",
      "20261113040000_mobile_shopper_controls.sql",
    ])
      await db.exec(
        readFileSync(new URL("../supabase/migrations/" + migration, import.meta.url), "utf8"),
      );
    await db.query("select set_shopping_privacy($1,$2,true,true,'2026-11-12')", [subject, user]);
    const auditBefore = (
      await db.query("select count(*)::int n from shopping_consents where purpose='advertising'")
    ).rows[0].n;
    await db.exec("update shopping_controls set notifications=true");
    await db.query("select mobile_register_device($1,'valid-device-for-learning-test','ios')", [
      user,
    ]);
    await db.query("select mobile_accept_terms($1,'2026-11-12',true)", [user]);
    const queued = randomUUID();
    await db.query(
      "insert into shopping_queue(id,user_id,listing_id,kind,event_key) values($1,$2,'dealerfeed-car','reminder','one')",
      [queued, user],
    );
    await db.query("insert into notifications values($1,$2,'shopping_alert',$3)", [
      randomUUID(),
      user,
      queued,
    ]);
    await db.query(
      "insert into shopping_events(id,subject,user_id,session_id,kind,listing_id,occurred_at) values($1,$2,$3,$1,'view','dealerfeed-car',now()-interval '1 minute')",
      [randomUUID(), subject, user],
    );
    await db.query("select mobile_set_personalization($1,$2,false)", [subject, user]);
    const privacy = (await db.query("select * from shopping_privacy where subject=$1", [subject]))
      .rows[0];
    assert.equal(privacy.personalization, false);
    assert.equal(privacy.advertising, true);
    assert.equal(
      (await db.query("select count(*)::int n from shopping_consents where purpose='advertising'"))
        .rows[0].n,
      auditBefore,
    );
    assert.equal((await db.query("select count(*)::int n from shopping_events")).rows[0].n, 0);
    assert.equal(
      (await db.query("select status from mobile_push_outbox")).rows[0].status,
      "suppressed",
    );
    await db.query("select mobile_set_personalization($1,$2,true)", [subject, user]);
    await db.query(
      "insert into shopping_events(id,subject,user_id,session_id,kind,listing_id,occurred_at) values($1,$2,$3,$1,'view','dealerfeed-car',now()-interval '1 minute')",
      [randomUUID(), subject, user],
    );
    assert.equal(
      (await db.query("select count(*)::int n from shopping_events")).rows[0].n,
      0,
      "old in-flight events cannot restore cleared history",
    );
    await assert.rejects(
      () => db.query("select mobile_set_personalization($1,$2,true)", ["u:" + randomUUID(), user]),
      /Invalid actor/,
    );
    await db.exec("set role authenticated");
    await assert.rejects(
      () => db.query("select mobile_clear_shopping_history($1,$2)", [subject, user]),
      /permission denied/,
    );
  } finally {
    await db.close();
  }
});

const compiled = ts.transpileModule(
  readFileSync(new URL("../apps/mobile/src/shopping.ts", import.meta.url), "utf8"),
  { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } },
).outputText;
function collector() {
  let install = randomUUID();
  const calls = [];
  const modules = {
    "./client": {
      api: async (...args) => {
        calls.push(args);
        return {};
      },
    },
    "./identity": {
      installIdentifier: () => install,
      resetInstallIdentifier: () => (install = randomUUID()),
    },
    "../../../src/lib/mobile-shopping": { mobileShoppingEvent },
  };
  const exports = {};
  new Function("require", "exports", compiled)((name) => modules[name], exports);
  return { client: exports, calls, install: () => install };
}
test("native learning never replays pre-permission, withdrawn or previous-account activity", async () => {
  const h = collector();
  h.client.setShopperIdentity(null);
  h.client.trackShopping("view", "dealerfeed-car");
  h.client.applyShopperStatus({ personalization: true, trackingAvailable: true });
  await h.client.flushShopping();
  assert.equal(h.calls.length, 0);
  const old = h.install();
  h.client.trackShopping("view", "dealerfeed-car");
  h.client.setShopperIdentity(randomUUID());
  assert.notEqual(h.install(), old);
  await h.client.flushShopping();
  assert.equal(h.calls.length, 0);
  h.client.applyShopperStatus({ personalization: true, trackingAvailable: true });
  h.client.trackShopping("view", "dealerfeed-car");
  h.client.applyShopperStatus(null);
  await h.client.flushShopping();
  assert.equal(h.calls.length, 0);
});
test("native impressions deduplicate and carry only the current actor and resettable session", async () => {
  const h = collector(),
    user = randomUUID();
  h.client.setShopperIdentity(user);
  h.client.applyShopperStatus({ personalization: true, trackingAvailable: true });
  h.client.trackShopping("impression", "dealerfeed-car", {
    position: 2,
    placement: "recommended",
    fingerprint: "private",
  });
  h.client.trackShopping("impression", "dealerfeed-car", { position: 2, placement: "recommended" });
  await h.client.flushShopping();
  assert.equal(h.calls.length, 1);
  const [path, , body, , actor] = h.calls[0];
  assert.equal(path, "activity");
  assert.equal(body.events.length, 1);
  assert.equal(actor.userId, user);
  assert.equal(body.events[0].context.fingerprint, undefined);
  const before = body.events[0].session;
  h.client.resetShoppingSession();
  h.client.trackShopping("view", "dealerfeed-car");
  await h.client.flushShopping();
  assert.notEqual(h.calls[1][2].events[0].session, before);
  h.client.applyShopperStatus(null);
});
