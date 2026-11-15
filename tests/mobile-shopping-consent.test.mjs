import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import { installDeletionWorkerSchema } from "./helpers/account-deletion-database.mjs";
import { mobileShoppingConsent } from "../src/lib/mobile-shopping-consent.ts";
import { mobileConsentInstallation } from "../scripts/mobile-consent-installation.mjs";
const capture = JSON.parse(
  readFileSync(new URL("./fixtures/mobile-consent-production-20261114.json", import.meta.url)),
);
const migration = readFileSync(
  new URL("../supabase/migrations/20261114190000_mobile_shopping_consent.sql", import.meta.url),
  "utf8",
);
const version = "2026-11-12";
async function fixture(t, { install = true } = {}) {
  const db = new PGlite();
  t.after(() => db.close());
  await installDeletionWorkerSchema(db);
  await db.exec(
    "alter table auth.users add column raw_user_meta_data jsonb not null default '{}';alter table shopping_consents add column recorded_at timestamptz not null default now()",
  );
  for (const name of ["mobile_accept_terms", "register_shopping_signup"]) {
    const f = capture[name];
    await db.exec(f.definition);
    const signature =
      name === "mobile_accept_terms"
        ? "mobile_accept_terms(uuid,text,boolean)"
        : "register_shopping_signup()";
    await db.exec(
      `revoke all on function public.${signature} from public,anon,authenticated,service_role;grant execute on function public.${signature} to service_role`,
    );
  }
  await db.exec(
    "create trigger register_shopping_signup after insert on auth.users for each row execute function public.register_shopping_signup()",
  );
  if (install) await db.exec(migration);
  const signup = async (meta = {}) => {
    const id = randomUUID();
    await db.query("insert into auth.users(id,raw_user_meta_data) values($1,$2)", [id, meta]);
    return id;
  };
  // Match the JSON timestamp representation returned by PostgREST to the app.
  const account = async (id) =>
    JSON.parse(
      JSON.stringify(
        (await db.query("select * from shopping_accounts where user_id=$1", [id])).rows[0] ?? null,
      ),
    );
  const accept = async (id, alerts, policy = version) =>
    db.query("select public.mobile_accept_terms($1,$2,$3)", [id, policy, alerts]);
  return { db, signup, account, accept };
}

test("web acceptance and historical alerts do not opt existing members into the app", async (t) => {
  const f = await fixture(t, { install: false });
  const id = await f.signup({ shopping_terms_version: version, shopping_alerts: true });
  await f.db.exec(migration);
  const a = await f.account(id);
  assert.equal(a.shopping_alerts, true);
  assert.equal(a.mobile_shopping_alerts, false);
  assert.equal(a.mobile_terms_version, null);
  assert.deepEqual(mobileShoppingConsent(a), { terms_version: null, shopping_alerts: false });
  assert.deepEqual(
    (await f.db.query("select source from shopping_consents where user_id=$1", [id])).rows.map(
      (r) => r.source,
    ),
    ["web", "web"],
  );
});

test("native email signup records exactly the two choices and source even before email confirmation", async (t) => {
  const f = await fixture(t);
  for (const alerts of [false, true]) {
    const id = await f.signup({
      shopping_terms_version: version,
      shopping_signup_source: "mobile",
      shopping_alerts: alerts,
    });
    const a = await f.account(id);
    assert.equal(a.mobile_terms_version, version);
    assert(a.mobile_terms_accepted_at);
    assert(a.mobile_alerts_updated_at);
    assert.equal(a.mobile_shopping_alerts, alerts);
    assert.deepEqual(mobileShoppingConsent(a), { terms_version: version, shopping_alerts: alerts });
    const ledger = (
      await f.db.query(
        "select purpose,allowed,version,source,recorded_at from shopping_consents where user_id=$1 order by purpose",
        [id],
      )
    ).rows;
    assert.equal(ledger.length, 2);
    assert(ledger.every((r) => r.version === version && r.source === "mobile" && r.recorded_at));
    assert.equal(ledger.find((r) => r.purpose === "terms").allowed, true);
    assert.equal(ledger.find((r) => r.purpose === "shopping_alerts").allowed, alerts);
  }
  const social = await f.signup({ display_name: "Synthetic OAuth member" });
  assert.equal(await f.account(social), null);
  assert.equal(mobileShoppingConsent(null).terms_version, null);
  await f.accept(social, false);
  assert.deepEqual(mobileShoppingConsent(await f.account(social)), {
    terms_version: version,
    shopping_alerts: false,
  });
});

test("first app choice preserves requested legacy alerts; withdrawal suppresses queued shopping but not messages", async (t) => {
  const f = await fixture(t),
    id = await f.signup({ shopping_terms_version: version, shopping_alerts: true }),
    other = await f.signup({ shopping_terms_version: version, shopping_alerts: true });
  await f.db.query(
    "insert into shopping_queue(user_id,status,requested) values($1,'pending',true),($1,'pending',false),($2,'pending',false)",
    [id, other],
  );
  const device = randomUUID(),
    message = randomUUID(),
    shopping = randomUUID();
  await f.db.query(
    "insert into mobile_push_devices(id,user_id,platform,token)values($1,$2,'ios',$3)",
    [device, id, "a".repeat(64)],
  );
  await f.db.query(
    "insert into notifications(id,user_id,kind)values($1,$3,'message'),($2,$3,'shopping')",
    [message, shopping, id],
  );
  // Message enqueue is automatic. Seed a historical shopping delivery so
  // withdrawal also exercises candidates queued by the shopping worker.
  await f.db.query(
    "insert into mobile_push_outbox(notification_id,device_id,user_id)values($1,$2,$3)",
    [shopping, device, id],
  );
  await f.accept(id, false);
  const q = (
    await f.db.query(
      "select requested,status from shopping_queue where user_id=$1 order by requested",
      [id],
    )
  ).rows;
  assert.deepEqual(q, [
    { requested: false, status: "suppressed" },
    { requested: true, status: "pending" },
  ]);
  assert.equal(
    (await f.db.query("select status from mobile_push_outbox where notification_id=$1", [message]))
      .rows[0].status,
    "pending",
  );
  assert.equal(
    (await f.db.query("select status from mobile_push_outbox where notification_id=$1", [shopping]))
      .rows[0].status,
    "suppressed",
  );
  await f.accept(id, true);
  assert.equal(mobileShoppingConsent(await f.account(id)).shopping_alerts, true);
  const acceptedAt = (await f.account(id)).mobile_terms_accepted_at;
  await f.accept(id, false);
  assert.equal(mobileShoppingConsent(await f.account(id)).shopping_alerts, false);
  assert.equal((await f.account(id)).mobile_terms_accepted_at, acceptedAt);
  assert.equal(
    (
      await f.db.query(
        "select count(*)::int n from shopping_queue where user_id=$1 and status='pending'",
        [id],
      )
    ).rows[0].n,
    0,
  );
  assert.equal((await f.account(other)).shopping_alerts, true);
  assert.equal((await f.account(other)).mobile_shopping_alerts, false);
});

test("app opt-out survives a later website email opt-in, and web withdrawal still stops app shopping", async (t) => {
  const f = await fixture(t),
    id = await f.signup({
      shopping_terms_version: version,
      shopping_signup_source: "mobile",
      shopping_alerts: true,
    });
  await f.accept(id, false);
  await f.db.query("update shopping_accounts set shopping_alerts=true where user_id=$1", [id]);
  assert.equal(mobileShoppingConsent(await f.account(id)).shopping_alerts, false);
  await f.accept(id, true);
  await f.db.query("update shopping_accounts set shopping_alerts=false where user_id=$1", [id]);
  assert.equal(mobileShoppingConsent(await f.account(id)).shopping_alerts, false);
});

test("consent installation is repeatable, preserves function privileges, and rejects unknown state atomically", async (t) => {
  const f = await fixture(t);
  const id = await f.signup({
    shopping_terms_version: version,
    shopping_signup_source: "mobile",
    shopping_alerts: false,
  });
  const before = await f.account(id);
  await f.db.exec(migration);
  assert.deepEqual(await f.account(id), before);
  for (const name of ["mobile_accept_terms(uuid,text,boolean)", "register_shopping_signup()"]) {
    assert.deepEqual(
      (
        await f.db.query(
          "select has_function_privilege('anon',$1,'EXECUTE') anon,has_function_privilege('authenticated',$1,'EXECUTE') member,has_function_privilege('service_role',$1,'EXECUTE') service",
          ["public." + name],
        )
      ).rows[0],
      { anon: false, member: false, service: true },
    );
  }
  for (const [policy, alerts] of [
    ["old-policy", false],
    [version, null],
  ])
    await assert.rejects(f.accept(id, alerts, policy), /Current terms/);
  assert.deepEqual(await f.account(id), before);
  await f.db.exec(
    "create or replace function public.mobile_accept_terms(_user uuid,_version text,_shopping_alerts boolean)returns void language plpgsql security definer set search_path=public,pg_temp as $$begin raise exception 'unreviewed';end$$",
  );
  await assert.rejects(f.db.exec(migration), /Review mobile consent function/);
  await f.db.exec("rollback");
  assert.deepEqual(await f.account(id), before);
});

test("mobile consent projection rejects incomplete, outdated or unchecked records", () => {
  const valid = {
    terms_version: version,
    mobile_terms_version: version,
    mobile_terms_accepted_at: "2026-11-14T00:00:00Z",
    shopping_alerts: true,
    mobile_shopping_alerts: true,
  };
  assert.equal(mobileShoppingConsent(valid).shopping_alerts, true);
  for (const patch of [
    { terms_version: "old" },
    { mobile_terms_version: "old" },
    { mobile_terms_accepted_at: null },
    { mobile_terms_accepted_at: "invalid" },
    { shopping_alerts: false },
    { mobile_shopping_alerts: false },
  ])
    assert.equal(mobileShoppingConsent({ ...valid, ...patch }).shopping_alerts, false);
});

test("exact consent installation records reviewed history and conflicting history rolls back all new columns", async (t) => {
  const history =
    "create schema supabase_migrations; create table supabase_migrations.schema_migrations(version text primary key,name text,statements text[])";
  const prepared = mobileConsentInstallation(migration);
  const f = await fixture(t, { install: false });
  const id = await f.signup({ shopping_terms_version: version, shopping_alerts: true });
  await f.db.exec(history);
  await f.db.exec(prepared.sql);
  await f.db.exec(prepared.sql);
  const recorded = (
    await f.db.query(
      "select statements,md5(statements[1]) hash from supabase_migrations.schema_migrations where version='20261114190000'",
    )
  ).rows[0];
  assert.deepEqual(recorded.statements, [migration]);
  assert.equal(recorded.hash, prepared.sourceMd5);
  assert.equal((await f.account(id)).shopping_alerts, true);
  assert.equal((await f.account(id)).mobile_shopping_alerts, false);
  const conflict = await fixture(t, { install: false });
  await conflict.db.exec(history);
  await conflict.db.exec(
    "insert into supabase_migrations.schema_migrations values('20261114190000','unreviewed',array['wrong source'])",
  );
  await assert.rejects(conflict.db.exec(prepared.sql), /migration history differs/);
  await conflict.db.exec("rollback");
  assert.equal(
    (
      await conflict.db.query(
        "select count(*)::int n from information_schema.columns where table_schema='public' and table_name='shopping_accounts' and column_name like 'mobile_%'",
      )
    ).rows[0].n,
    0,
  );
  assert.equal(
    (
      await conflict.db.query(
        "select md5(prosrc) hash from pg_proc where oid='public.mobile_accept_terms(uuid,text,boolean)'::regprocedure",
      )
    ).rows[0].hash,
    capture.mobile_accept_terms.body_md5,
  );
});
