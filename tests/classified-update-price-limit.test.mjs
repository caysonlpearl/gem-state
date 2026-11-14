import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { PGlite } from "@electric-sql/pglite";
import { installDeletionWorkerSchema } from "./helpers/account-deletion-database.mjs";
const baseline = JSON.parse(
  readFileSync(new URL("./fixtures/classified-update-ask-20261114.json", import.meta.url), "utf8"),
);
const migration = readFileSync(
  new URL(
    "../supabase/migrations/20261114170000_classified_update_price_limit.sql",
    import.meta.url,
  ),
  "utf8",
);
const signature =
  "public.update_ask(uuid,integer,public.item_condition,text,numeric,numeric,numeric,numeric)";
const coverage = { unguarded_functions: 0, unguarded_tables: 0, helper_privilege_gaps: 0 };
async function fixture() {
  const db = await installDeletionWorkerSchema(new PGlite());
  await db.exec(`
    create type public.item_condition as enum('new_with_tags','new_without_tags','used_excellent','used_good','not_applicable');
    create table asks(id uuid primary key,seller_id uuid,price_cents integer check(price_cents between 0 and 1000000000),item_condition item_condition,seller_note text,parcel_length_in numeric,parcel_width_in numeric,parcel_height_in numeric,parcel_weight_lb numeric,approved_at timestamptz,approved_by uuid,review_note text,updated_at timestamptz,status text);
    create table ask_events(id uuid primary key default gen_random_uuid(),ask_id uuid,actor_id uuid,event_type text,price_cents integer,note text);
    ${baseline.definition}
  `);
  await db.query(
    `insert into account_access_protected_functions(function_oid,signature,original_definition,protected_body_md5)
    select p.oid,p.oid::regprocedure::text,$1,md5(p.prosrc) from pg_proc p where p.oid=to_regprocedure($2)`,
    [baseline.original_definition, signature],
  );
  const user = randomUUID(),
    other = randomUUID(),
    session = randomUUID(),
    listing = randomUUID();
  await db.query("insert into auth.users(id) values($1),($2)", [user, other]);
  await db.query(
    "insert into auth.sessions(id,user_id,not_after) values($1,$2,now()+interval '1 day')",
    [session, user],
  );
  await db.query("insert into shopping_accounts(user_id,terms_version) values($1,'2026-11-12')", [
    user,
  ]);
  await db.query(
    "insert into asks(id,seller_id,price_cents,item_condition,approved_at,status) values($1,$2,2500,'used_good',now(),'active')",
    [listing, user],
  );
  const owner = () => db.exec("reset role");
  const actor = async () => {
    await owner();
    await db.query("select set_config('request.jwt.claims',$1,false)", [
      JSON.stringify({ sub: user, session_id: session, role: "authenticated" }),
    ]);
    await db.exec("set role authenticated");
  };
  const apply = async () => {
    await owner();
    try {
      await db.exec(migration);
    } catch (error) {
      await db.exec("rollback");
      throw error;
    }
  };
  const update = async (price, id = listing) => {
    await actor();
    return db.query("select update_ask($1,$2,'used_good','Updated note',null,null,null,null)", [
      id,
      price,
    ]);
  };
  const state = async () => {
    await owner();
    return (
      await db.query(
        `select p.prosrc, to_jsonb(p)-'prosrc' as attributes, g.original_definition,g.protected_body_md5, public.account_access_coverage() as coverage from pg_proc p join account_access_protected_functions g on g.function_oid=p.oid where p.oid=to_regprocedure($1)`,
        [signature],
      )
    ).rows[0];
  };
  return { db, user, other, session, listing, owner, actor, apply, update, state };
}
test("real production helper rejects a valid expensive listing before the correction, then accepts the existing classified limits", async () => {
  const f = await fixture();
  try {
    await assert.rejects(f.update(5_000_001), /Ask price out of range/);
    const before = await f.state();
    assert.equal(before.prosrc, baseline.source);
    assert.equal(before.protected_body_md5, baseline.body_md5);
    await f.apply();
    const after = await f.state();
    assert.deepEqual(
      after.attributes,
      before.attributes,
      "Signature, owner, grants and all function attributes stay intact",
    );
    assert.deepEqual(after.coverage, coverage);
    assert.equal(
      after.prosrc,
      before.prosrc.replace("_price_cents > 5000000", "_price_cents > 1000000000"),
    );
    assert.equal(
      after.original_definition,
      before.original_definition.replace("_price_cents > 5000000", "_price_cents > 1000000000"),
    );
    for (const price of [100, 5_000_001, 9_000_000, 123_456_789, 1_000_000_000]) {
      await f.update(price);
      await f.owner();
      const row = (
        await f.db.query("select price_cents,approved_at,seller_note from asks where id=$1", [
          f.listing,
        ])
      ).rows[0];
      assert.equal(row.price_cents, price);
      assert.equal(row.approved_at, null);
      assert.equal(row.seller_note, "Updated note");
    }
    for (const price of [0, 99, 1_000_000_001])
      await assert.rejects(f.update(price), /Ask price out of range/);
    await f.owner();
    const events = (await f.db.query("select actor_id,event_type from ask_events")).rows;
    assert.equal(events.length, 5);
    assert(events.every((row) => row.actor_id === f.user && row.event_type === "price_changed"));
    await f.apply();
    assert.deepEqual(
      await f.state(),
      after,
      "A lost acknowledgement can be rechecked/reapplied safely",
    );
  } finally {
    await f.db.close();
  }
});
test("the correction performs no listing write and preserves ownership, inactive status and expired-session rejection", async () => {
  const f = await fixture();
  try {
    const before = (await f.db.query("select to_jsonb(a) value from asks a")).rows;
    await f.apply();
    assert.deepEqual((await f.db.query("select to_jsonb(a) value from asks a")).rows, before);
    await f.db.query("update asks set seller_id=$1 where id=$2", [f.other, f.listing]);
    await assert.rejects(f.update(9_000_000), /Only an open Ask/);
    await f.owner();
    await f.db.query("update asks set seller_id=$1,status='cancelled' where id=$2", [
      f.user,
      f.listing,
    ]);
    await assert.rejects(f.update(9_000_000), /Only an open Ask/);
    await f.owner();
    await f.db.query("update asks set status='active' where id=$1", [f.listing]);
    await f.db.query("update auth.sessions set not_after=now()-interval '1 day' where id=$1", [
      f.session,
    ]);
    await assert.rejects(f.update(9_000_000), /Account access is unavailable/);
  } finally {
    await f.db.close();
  }
});
test("unexpected source or guard drift stops the migration without overwriting the live function", async () => {
  for (const change of ["source", "registry", "original"]) {
    const f = await fixture();
    try {
      if (change === "source") {
        await f.db.exec(
          baseline.definition.replace("Ask price out of range", "Reviewed different rule"),
        );
        await f.db.exec(
          `update account_access_protected_functions set protected_body_md5=(select md5(prosrc) from pg_proc where oid=function_oid)`,
        );
      } else if (change === "registry")
        await f.db.exec(
          "update account_access_protected_functions set protected_body_md5='unreviewed' where signature like 'update_ask(%'",
        );
      else
        await f.db.exec(
          "update account_access_protected_functions set original_definition=original_definition || '_price_cents > 5000000' where signature like 'update_ask(%'",
        );
      const before = await f.state();
      await assert.rejects(f.apply(), /Review/);
      assert.deepEqual(await f.state(), before);
    } finally {
      await f.db.close();
    }
  }
});
test("failed guard bookkeeping rolls back the function replacement in the same transaction", async () => {
  const f = await fixture();
  try {
    await f.db.exec(
      "create function refuse_guard_update() returns trigger language plpgsql as $$begin return null;end$$;create trigger fixture_refuse_guard before update on account_access_protected_functions for each row execute function refuse_guard_update();",
    );
    const before = await f.state();
    await assert.rejects(f.apply(), /access boundary requires review/);
    assert.deepEqual(await f.state(), before);
  } finally {
    await f.db.close();
  }
});
