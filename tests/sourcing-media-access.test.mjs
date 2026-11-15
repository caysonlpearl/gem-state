import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { deletionWorkerDatabase } from "./helpers/account-deletion-database.mjs";
const captured = JSON.parse(
  readFileSync(new URL("./fixtures/sourcing-media-access-20261115.json", import.meta.url), "utf8"),
).function;
const migration = () =>
  readFileSync(
    new URL(
      "../supabase/migrations/20261115095000_restrict_sourcing_media_rpc.sql",
      import.meta.url,
    ),
    "utf8",
  );
async function setup(t) {
  const db = await deletionWorkerDatabase();
  t.after(() => db.close());
  await db.exec(`
    grant usage on schema auth to service_role;
    create table sourcing_requests(id uuid primary key,buyer_id uuid,status text,expires_at timestamptz,accepted_quote_id uuid);
    create table shopper_quotes(id uuid primary key,shopper_id uuid,status text);
    create table request_media(id uuid primary key,request_id uuid,storage_path text,caption text,position integer,created_at timestamptz default now());
    create table media_fixture_roles(user_id uuid,role text);
    create table admin_audit_log(actor_id uuid,action text,entity text,entity_id uuid,note text);
    create function public.has_role(uuid,text)returns boolean language sql as $$select exists(select 1 from public.media_fixture_roles where user_id=$1 and role=$2)$$;
    create function public_catalog_fixture()returns integer language sql stable security definer as $$select 42$$;
  `);
  const prefix =
    "AS $function$BEGIN\n PERFORM public.assert_current_account_access(); -- bluebird-account-boundary-v1\n";
  await db.exec(
    captured.definition
      .replace(prefix, "AS $function$")
      .replace(/\nEND;\$function\$\n?$/, "\n$function$\n"),
  );
  await db.exec("select protect_account_access_boundaries()");
  assert.equal(
    (
      await db.query(
        "select md5(prosrc)hash from pg_proc where oid='sourcing_request_media(uuid,uuid)'::regprocedure",
      )
    ).rows[0].hash,
    captured.bodyMd5,
  );
  const buyer = randomUUID(),
    attacker = randomUUID(),
    shopper = randomUUID(),
    staff = randomUUID(),
    request = randomUUID(),
    session = randomUUID();
  await db.query("insert into auth.users(id)values($1),($2),($3),($4)", [
    buyer,
    attacker,
    shopper,
    staff,
  ]);
  await db.query("insert into auth.sessions(id,user_id)values($1,$2)", [session, attacker]);
  await db.query("insert into sourcing_requests values($1,$2,'open',now()+interval '1 day',null)", [
    request,
    buyer,
  ]);
  await db.query(
    "insert into request_media values(gen_random_uuid(),$1,'synthetic-buyer/private-reference.jpg','Synthetic private caption',0,now())",
    [request],
  );
  await db.query("insert into media_fixture_roles values($1,'shopper'),($2,'moderator')", [
    shopper,
    staff,
  ]);
  const as = async (role, user = null) => {
    await db.exec("reset role");
    await db.query("select set_config('request.jwt.claims',$1,false)", [
      JSON.stringify({ role, ...(user ? { sub: user, session_id: session } : {}) }),
    ]);
    await db.exec("set role " + role);
  };
  const read = (caller) =>
    db.query("select * from sourcing_request_media($1,$2)", [request, caller]);
  return { db, buyer, attacker, shopper, staff, request, as, read };
}
test("captured public lookup permits an anonymous chosen identity before the fix and rejects direct client calls afterward", async (t) => {
  const f = await setup(t);
  await f.as("anon");
  assert.equal((await f.read(f.buyer)).rows[0].caption, "Synthetic private caption");
  await f.as("authenticated", f.attacker);
  assert.equal((await f.read(f.buyer)).rows.length, 1);
  await f.db.exec("reset role");
  await f.db.exec(migration());
  for (const role of ["anon", "authenticated"]) {
    await f.as(role, role === "authenticated" ? f.attacker : null);
    await assert.rejects(f.read(f.buyer), /permission denied for function sourcing_request_media/);
    assert.equal((await f.db.query("select public_catalog_fixture()n")).rows[0].n, 42);
  }
});
test("trusted server preserves requester and approved-shopper authorization, closed-request restrictions and staff audit", async (t) => {
  const f = await setup(t);
  await f.db.exec(migration());
  await f.as("service_role");
  assert.equal((await f.read(f.buyer)).rows.length, 1);
  assert.equal((await f.read(f.shopper)).rows.length, 1);
  await assert.rejects(f.read(f.attacker), /not permitted/);
  await f.db.exec("reset role");
  const quote = randomUUID();
  await f.db.query("insert into shopper_quotes values($1,$2,'accepted')", [quote, f.shopper]);
  await f.db.query(
    "update sourcing_requests set status='quote_accepted',accepted_quote_id=$1 where id=$2",
    [quote, f.request],
  );
  await f.as("service_role");
  assert.equal((await f.read(f.shopper)).rows.length, 1);
  assert.equal((await f.read(f.staff)).rows.length, 1);
  await f.db.exec("reset role");
  assert.equal(
    (
      await f.db.query(
        "select count(*)::int n from admin_audit_log where actor_id=$1 and action='sourcing_request_media_accessed'",
        [f.staff],
      )
    ).rows[0].n,
    1,
  );
  await f.db.query("update shopper_quotes set status='declined'where id=$1", [quote]);
  await f.as("service_role");
  await assert.rejects(f.read(f.shopper), /not permitted/);
});
test("permission restriction preserves function code and source rows and refuses unexpected function code", async (t) => {
  const f = await setup(t);
  const before = (await f.db.query("select to_jsonb(m)r from request_media m")).rows;
  await f.db.exec(migration());
  assert.deepEqual((await f.db.query("select to_jsonb(m)r from request_media m")).rows, before);
  assert.equal(
    (
      await f.db.query(
        "select md5(prosrc)hash from pg_proc where oid='sourcing_request_media(uuid,uuid)'::regprocedure",
      )
    ).rows[0].hash,
    captured.bodyMd5,
  );
  assert.equal(
    (await f.db.query("select account_access_coverage()r")).rows[0].r.helper_privilege_gaps,
    0,
  );
  await f.db.exec(
    "create or replace function sourcing_request_media(_request_id uuid,_caller uuid)returns table(media_id uuid,storage_path text,caption text,sort_position integer)language plpgsql security definer set search_path=public,pg_temp as $$begin return;end$$",
  );
  await assert.rejects(f.db.exec(migration()), /Review sourcing media function/);
  await f.db.exec("rollback");
});
