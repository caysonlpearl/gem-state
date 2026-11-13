import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { deletionDatabase } from "./helpers/account-deletion-database.mjs";
async function fixture() {
  const db = await deletionDatabase();
  await db.exec(`alter table auth.users add column deleted_at timestamptz,add column banned_until timestamptz;
 create table auth.sessions(id uuid primary key,user_id uuid references auth.users(id) on delete cascade,not_after timestamptz);
 create function auth.jwt() returns jsonb language sql stable as $$select coalesce(nullif(current_setting('request.jwt.claims',true),''),'{}')::jsonb$$;
 grant usage on schema auth to anon,authenticated;
 create function auth.uid() returns uuid language sql stable as $$select nullif(auth.jwt()->>'sub','')::uuid$$;
 create table private_fixture(owner uuid,value text);
 alter table private_fixture enable row level security;
 grant select,insert,update,delete on private_fixture to authenticated;
 create policy member_fixture on private_fixture for all to authenticated using(owner=auth.uid()) with check(owner=auth.uid());
 create schema storage;create table storage.objects(owner uuid,name text);
 alter table storage.objects enable row level security;
 grant usage on schema storage to authenticated;grant select,insert,delete on storage.objects to authenticated;
 create policy member_object on storage.objects for all to authenticated using(owner=auth.uid()) with check(owner=auth.uid());
 create function private_sql(_prefix text default '') returns setof text language sql stable security definer set search_path=public as $$select _prefix||value from private_fixture where owner=auth.uid()$$;
 create function private_plpgsql(_prefix text default '') returns text language plpgsql stable security definer set search_path=public as $$declare found text; begin select value into found from private_fixture where owner=auth.uid();return _prefix||found;exception when others then return 'old handler must not catch the guard';end$$;
 create function private_literal_fixture(_prefix text default 'AS $function$') returns text language sql stable security definer as $outer$select _prefix||'$function$'$outer$;
 create function public_catalog_fixture() returns integer language sql stable security definer as $$select 42$$;`);
  const sql = readFileSync(
    new URL("../supabase/migrations/20261113120000_account_access_boundaries.sql", import.meta.url),
    "utf8",
  );
  await db.exec(sql);
  const a = randomUUID(),
    b = randomUUID(),
    sa = randomUUID(),
    sb = randomUUID();
  await db.query("insert into auth.users(id) values($1),($2)", [a, b]);
  await db.query("insert into auth.sessions(id,user_id) values($1,$2),($3,$4)", [sa, a, sb, b]);
  await db.query(
    "insert into private_fixture values($1,'first member private data'),($2,'second member private data')",
    [a, b],
  );
  await db.query(
    "insert into storage.objects values($1,'first-private.jpg'),($2,'second-private.jpg')",
    [a, b],
  );
  const as = async (user, session, role = "authenticated") => {
    await db.exec("reset role");
    await db.query("select set_config('request.jwt.claims',$1,false)", [
      JSON.stringify({ role, ...(user ? { sub: user, session_id: session } : {}) }),
    ]);
    if (role === "authenticated" || role === "anon") await db.exec("set role " + role);
  };
  const admin = async () => db.exec("reset role");
  return { db, a, b, sa, sb, as, admin };
}
test("direct RPCs and storage/row policies require a current member session while anonymous catalog access remains usable", async () => {
  const f = await fixture(),
    { db, a, b, sa, sb } = f;
  try {
    await f.as(null, null, "anon");
    assert.equal((await db.query("select public_catalog_fixture() n")).rows[0].n, 42);
    await db.query("select set_config('request.jwt.claims',$1,false)", [
      JSON.stringify({ role: "anon", sub: "opaque-public-key" }),
    ]);
    assert.equal((await db.query("select public_catalog_fixture() n")).rows[0].n, 42);
    await f.admin();
    await db.query("select set_config('request.jwt.claims',$1,false)", [
      JSON.stringify({ role: "service_role", sub: "opaque-server-key" }),
    ]);
    assert.equal((await db.query("select public_catalog_fixture() n")).rows[0].n, 42);
    await db.query("select set_config('request.jwt.claims','{}',false)");
    await db.exec("set role authenticated");
    await assert.rejects(
      () => db.query("select private_literal_fixture()"),
      /Account access is unavailable/,
    );
    await f.as(a, sa);
    assert.equal(
      (await db.query("select private_literal_fixture() value")).rows[0].value,
      "AS $function$$function$",
    );
    assert.deepEqual((await db.query("select * from private_fixture")).rows, [
      { owner: a, value: "first member private data" },
    ]);
    assert.equal(
      (await db.query("select private_plpgsql('Hello ') value")).rows[0].value,
      "Hello first member private data",
    );
    assert.equal(
      (await db.query("select private_sql() value")).rows[0].value,
      "first member private data",
    );
    assert.deepEqual((await db.query("select name from storage.objects")).rows, [
      { name: "first-private.jpg" },
    ]);
    await assert.rejects(
      () => db.query("select account_session_state($1,$2)", [b, sb]),
      /permission denied/,
    );
    await f.admin();
    await db.query("delete from auth.sessions where id=$1", [sa]);
    const retrySession = randomUUID();
    await db.query("insert into auth.sessions(id,user_id)values($1,$2)", [retrySession, a]);
    await db.query("select mobile_request_deletion($1)", [a]);
    assert.equal(
      (await db.query("select count(*)::int n from auth.sessions where user_id=$1", [a])).rows[0].n,
      0,
    );
    assert.equal(
      (
        await db.query(
          "select count(*)::int n from shopping_consents where user_id=$1 and source='account_deletion'",
          [a],
        )
      ).rows[0].n,
      3,
    );
    await f.as(a, sa);
    assert.equal((await db.query("select * from private_fixture")).rows.length, 0);
    assert.equal((await db.query("select * from storage.objects")).rows.length, 0);
    await assert.rejects(() => db.query("select private_sql()"), /Account access is unavailable/);
    await assert.rejects(
      () => db.query("select private_plpgsql()"),
      /Account access is unavailable/,
    );
    await assert.rejects(
      () => db.query("insert into private_fixture values($1,'new secret')", [a]),
      /row-level security/,
    );
    await f.as(b, sb);
    assert.equal(
      (await db.query("select private_sql() value")).rows[0].value,
      "second member private data",
    );
  } finally {
    await db.close();
  }
});
test("pending deletion and missing Auth identities defeat still-signed sessions without affecting another member", async () => {
  const f = await fixture(),
    { db, a, b, sa, sb } = f;
  try {
    await db.query("select mobile_request_deletion($1)", [a]);
    assert.equal(
      (await db.query("select count(*)::int n from auth.sessions where user_id=$1", [a])).rows[0].n,
      0,
    );
    assert.equal(
      (await db.query("select count(*)::int n from auth.sessions where user_id=$1", [b])).rows[0].n,
      1,
    );
    assert.equal(
      (await db.query("select account_session_state($1,$2) state", [a, sa])).rows[0].state,
      "deletion_pending",
    );
    await f.as(a, sa);
    assert.equal((await db.query("select * from private_fixture")).rows.length, 0);
    await assert.rejects(() => db.query("select private_sql()"), /Account access is unavailable/);
    await f.admin();
    await db.query("delete from auth.users where id=$1", [a]);
    assert.equal(
      (await db.query("select account_session_state($1,$2) state", [a, sa])).rows[0].state,
      "unavailable",
    );
    await f.as(a, sa);
    await assert.rejects(
      () => db.query("select private_plpgsql()"),
      /Account access is unavailable/,
    );
    await f.as(b, sb);
    assert.equal(
      (await db.query("select * from storage.objects")).rows[0].name,
      "second-private.jpg",
    );
  } finally {
    await db.close();
  }
});
test("coverage detects new functions, redefinitions and changed policies; protection preserves signatures/defaults and is idempotent", async () => {
  const f = await fixture(),
    { db } = f;
  try {
    let c = (await db.query("select account_access_coverage() c")).rows[0].c;
    assert.deepEqual(c, { unguarded_functions: 0, unguarded_tables: 0, helper_privilege_gaps: 0 });
    assert.deepEqual((await db.query("select protect_account_access_boundaries() c")).rows[0].c, {
      functions_added: 0,
      policies_added: 0,
    });
    await db.exec(
      "create function new_private_fixture() returns integer language sql security definer as $$select 9$$;",
    );
    c = (await db.query("select account_access_coverage() c")).rows[0].c;
    assert.equal(c.unguarded_functions, 1);
    await db.query("select protect_account_access_boundaries()");
    assert.equal(
      (await db.query("select account_access_coverage() c")).rows[0].c.unguarded_functions,
      0,
    );
    await db.exec(
      "create or replace function new_private_fixture() returns integer language sql security definer as $$select 10$$;",
    );
    assert.equal(
      (await db.query("select account_access_coverage() c")).rows[0].c.unguarded_functions,
      1,
    );
    await db.query("select protect_account_access_boundaries()");
    await db.exec("alter policy bluebird_account_session_boundary on private_fixture using(true)");
    assert.equal(
      (await db.query("select account_access_coverage() c")).rows[0].c.unguarded_tables,
      1,
    );
    await assert.rejects(
      () => db.query("select protect_account_access_boundaries()"),
      /policy requires review/,
    );
  } finally {
    await db.close();
  }
});

test("expired, malformed, cross-member and banned sessions fail closed even with a surviving identity", async () => {
  const f = await fixture(),
    { db, a, b, sa, sb } = f;
  try {
    assert.equal(
      (await db.query("select account_session_state($1,$2) s", [a, sb])).rows[0].s,
      "unavailable",
    );
    await db.query("update auth.sessions set not_after=now()-interval '1 second' where id=$1", [
      sa,
    ]);
    assert.equal(
      (await db.query("select account_session_state($1,$2) s", [a, sa])).rows[0].s,
      "unavailable",
    );
    await f.as(a, sa);
    await assert.rejects(() => db.query("select private_sql()"), /Account access is unavailable/);
    await f.admin();
    await db.query("update auth.sessions set not_after=null where id=$1", [sa]);
    await db.query("update auth.users set banned_until=now()+interval '1 hour' where id=$1", [a]);
    assert.equal(
      (await db.query("select account_session_state($1,$2) s", [a, sa])).rows[0].s,
      "unavailable",
    );
    await f.as(a, "not-a-session");
    assert.equal(
      (await db.query("select account_current_session_active() active")).rows[0].active,
      false,
    );
    await f.as(b, sb);
    assert.equal(
      (await db.query("select private_sql() value")).rows[0].value,
      "second member private data",
    );
  } finally {
    await db.close();
  }
});

test("boundary coverage catches disabled row security, helper permission drift and similarly named new RPCs", async () => {
  const f = await fixture(),
    { db } = f;
  try {
    await db.exec("alter table private_fixture disable row level security");
    assert.equal(
      (await db.query("select account_access_coverage() c")).rows[0].c.unguarded_tables,
      1,
    );
    await assert.rejects(
      () => db.query("select protect_account_access_boundaries()"),
      /requires row security/,
    );
    await db.exec("alter table private_fixture enable row level security");
    await db.exec("grant execute on function account_session_state(uuid,uuid) to authenticated");
    assert.equal(
      (await db.query("select account_access_coverage() c")).rows[0].c.helper_privilege_gaps,
      1,
    );
    await assert.rejects(
      () => db.query("select protect_account_access_boundaries()"),
      /helper permissions require review/,
    );
    await db.exec("revoke execute on function account_session_state(uuid,uuid) from authenticated");
    await db.exec(
      "create function account_current_session_active(_extra boolean) returns boolean language sql security definer as $$select true$$",
    );
    assert.equal(
      (await db.query("select account_access_coverage() c")).rows[0].c.unguarded_functions,
      1,
    );
    await db.query("select protect_account_access_boundaries()");
    assert.deepEqual((await db.query("select account_access_coverage() c")).rows[0].c, {
      unguarded_functions: 0,
      unguarded_tables: 0,
      helper_privilege_gaps: 0,
    });
    await db.query("delete from auth.sessions where id=$1", [f.sa]);
    await f.as(f.a, f.sa);
    await assert.rejects(
      () => db.query("select account_current_session_active(true)"),
      /Account access is unavailable/,
    );
  } finally {
    await db.close();
  }
});
