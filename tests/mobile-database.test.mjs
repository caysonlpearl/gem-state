import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
test("mobile migration shares consent, suppresses queued alerts and isolates device transfers", async () => {
  const db = new PGlite();
  try {
    await db.exec(`create role anon; create role authenticated; create role service_role; create schema auth; create table auth.users(id uuid primary key);
 create table public.notifications(id uuid primary key,user_id uuid,kind text);
 create table public.shopping_accounts(user_id uuid primary key,terms_version text,terms_accepted_at timestamptz,shopping_alerts boolean,suppressed_at timestamptz,alerts_version text,alerts_updated_at timestamptz,updated_at timestamptz);
 create table public.shopping_consents(id uuid default gen_random_uuid(),user_id uuid,subject text,purpose text,allowed boolean,version text);
 create table public.shopping_queue(user_id uuid,status text,lease_until timestamptz,requested boolean default false);`);
    await db.exec(
      await readFile(
        new URL("../supabase/migrations/20261113030000_mobile_foundation.sql", import.meta.url),
        "utf8",
      ),
    );
    const a = "11111111-1111-4111-8111-111111111111",
      b = "22222222-2222-4222-8222-222222222222",
      n = "33333333-3333-4333-8333-333333333333";
    await db.query("insert into auth.users values($1),($2)", [a, b]);
    await db.query("select mobile_accept_terms($1,'2026-11-12',true)", [a]);
    assert.equal(
      (await db.query("select shopping_alerts from shopping_accounts where user_id=$1", [a]))
        .rows[0].shopping_alerts,
      true,
    );
    await db.query("select mobile_register_device($1,'a-valid-device-token-for-tests','ios')", [a]);
    await db.query("insert into notifications values($1,$2,'shopping_alert')", [n, a]);
    assert.equal(
      (await db.query("select count(*)::int as n from mobile_push_outbox")).rows[0].n,
      1,
    );
    await db.query("select mobile_accept_terms($1,'2026-11-12',false)", [a]);
    assert.equal(
      (await db.query("select status from mobile_push_outbox")).rows[0].status,
      "suppressed",
    );
    assert.equal((await db.query("select * from claim_mobile_push_delivery()")).rows.length, 0);
    await db.query("select mobile_register_device($1,'a-valid-device-token-for-tests','ios')", [b]);
    assert.equal(
      (await db.query("select count(*)::int as n from mobile_push_outbox")).rows[0].n,
      0,
    );
    assert.equal((await db.query("select user_id from mobile_push_devices")).rows[0].user_id, b);
    await db.query("insert into notifications values(gen_random_uuid(),$1,'message')", [b]);
    await db.exec("update mobile_controls set push_enabled=true;");
    const claimed = await db.query("select * from claim_mobile_push_delivery()");
    assert.equal(claimed.rows.length, 1);
    assert.equal(claimed.rows[0].attempts, 1);
    assert(claimed.rows[0].lease_id);
    assert.equal((await db.query("select * from claim_mobile_push_delivery()")).rows.length, 0);
    await db.query("select mobile_request_deletion($1)", [b]);
    assert.equal((await db.query("select count(*)::int n from mobile_push_devices")).rows[0].n, 0);
    assert.equal(
      (await db.query("select status from mobile_account_deletions where user_id=$1", [b])).rows[0]
        .status,
      "requested",
    );
    await db.query("select mobile_request_deletion($1)", [b]);
    assert.equal(
      (await db.query("select count(*)::int n from mobile_account_deletions")).rows[0].n,
      1,
    );
    await db.exec("set role anon;");
    await assert.rejects(
      () => db.query("select token from public.mobile_push_devices"),
      /permission denied/,
    );
    await assert.rejects(
      () =>
        db.query(
          "select public.mobile_register_device($1,'other-valid-token-for-tests','android')",
          [a],
        ),
      /permission denied/,
    );
  } finally {
    await db.close();
  }
});
