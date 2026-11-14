import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
import { deletionWorkerDatabase } from "./helpers/account-deletion-database.mjs";
import { createAccountDeletionAuthDependencyInspection } from "../src/lib/account-deletion-auth-dependencies.server.ts";

const migration = readFileSync(
  new URL(
    "../supabase/migrations/20261114160000_account_deletion_auth_dependencies.sql",
    import.meta.url,
  ),
  "utf8",
);
const signal = () => AbortSignal.timeout(10000);
const unavailable = (e) =>
  e.code === "records_unavailable" && e.message === "records_unavailable" && !e.cause;
const call = (db, job, limit = 100) =>
  db
    .query("select public.inspect_account_deletion_auth_dependencies($1,$2,$3,$4) value", [
      job.id,
      job.user_id,
      job.lease_token,
      limit,
    ])
    .then((r) => r.rows[0].value);

async function fixture() {
  const db = await deletionWorkerDatabase();
  const user = randomUUID(),
    other = randomUUID(),
    lease = randomUUID();
  await db.exec(`
    create table public.fixture_orders(id uuid primary key,buyer_id uuid references auth.users(id) on delete cascade,
      seller_id uuid references auth.users(id) on delete set null,private_payload text);
    create table public.fixture_retained(id uuid primary key,actor uuid references auth.users(id) on delete restrict);
    create table auth.fixture_identities(id uuid primary key,user_id uuid references auth.users(id) on delete cascade);
    create schema "Quoted schema";
    create table "Quoted schema"."Quoted table"(id uuid primary key,"user column" uuid,
      constraint "quoted foreign key" foreign key("user column") references auth.users(id) deferrable initially deferred);
    select public.protect_account_access_boundaries();
  `);
  await db.query("insert into auth.users(id) values($1),($2)", [user, other]);
  for (let n = 0; n < 4; n++)
    await db.query("insert into public.fixture_orders values($1,$2,$3,'SECRET private order')", [
      randomUUID(),
      user,
      other,
    ]);
  await db.query("insert into public.fixture_orders values($1,$2,$3,'OTHER private order')", [
    randomUUID(),
    other,
    other,
  ]);
  await db.query("insert into public.fixture_retained values($1,$2)", [randomUUID(), user]);
  await db.query("insert into auth.fixture_identities values($1,$2)", [randomUUID(), user]);
  await db.query('insert into "Quoted schema"."Quoted table" values($1,$2)', [randomUUID(), user]);
  await db.query("select public.mobile_request_deletion($1)", [user]);
  await db.exec("update public.account_deletion_controls set worker_enabled=true");
  const job = (
    await db.query(
      "update public.account_deletion_jobs set phase='records',status='processing',lease_token=$1,lease_until=now()+interval '5 minutes' where user_id=$2 returning *",
      [lease, user],
    )
  ).rows[0];
  await db.exec(migration);
  return { db, job, other };
}

test("actual SQL finds financial cascades, restrictive and Auth-schema references, bounds counts and never reads payloads or erases rows", async () => {
  const { db, job } = await fixture();
  try {
    const before = await db.query("select * from public.fixture_orders order by id");
    await db.exec("set role service_role");
    const report = await call(db, job, 2);
    const parsed = await createAccountDeletionAuthDependencyInspection(
      transport(() => ({ data: report, error: null })),
    ).inspect(job, signal(), 2);
    assert.equal(parsed.scope, "direct_auth_foreign_keys");
    assert.equal(parsed.relationships.find((r) => r.column === "buyer_id").rowsAtLeast, 3);
    assert.equal(report.scope, "direct_auth_foreign_keys");
    assert.match(report.schema_fingerprint, /^[a-f0-9]{32}$/);
    const relationship = (table, column) =>
      report.relationships.find((r) => r.table === table && r.column === column);
    assert.deepEqual(relationship("fixture_orders", "buyer_id"), {
      schema: "public",
      table: "fixture_orders",
      constraint: "fixture_orders_buyer_id_fkey",
      column: "buyer_id",
      on_delete: "cascade",
      validated: true,
      deferrable: false,
      initially_deferred: false,
      rows_at_least: 3,
      capped: true,
    });
    assert.equal(
      relationship("fixture_orders", "seller_id").rows_at_least,
      0,
      "other members are not counted",
    );
    assert.equal(relationship("fixture_orders", "seller_id").on_delete, "set_null");
    assert.equal(relationship("fixture_retained", "actor").on_delete, "restrict");
    assert.equal(relationship("fixture_identities", "user_id").schema, "auth");
    const quoted = relationship("Quoted table", "user column");
    assert.equal(quoted.constraint, "quoted foreign key");
    assert.equal(quoted.rows_at_least, 1);
    assert.equal(quoted.deferrable, true);
    assert.equal(quoted.initially_deferred, true);
    assert.equal(quoted.on_delete, "no_action");
    assert(!JSON.stringify(report).includes("SECRET"));
    assert(!JSON.stringify(report).includes(job.user_id));
    assert(!("done" in report));
    assert(!("safe_to_delete" in report));
    await db.exec("reset role");
    assert.deepEqual(
      (await db.query("select * from public.fixture_orders order by id")).rows,
      before.rows,
    );
    assert.equal(
      (await db.query("select phase from public.account_deletion_jobs")).rows[0].phase,
      "records",
    );
  } finally {
    await db.close();
  }
});

test("new future references, action changes and unvalidated constraints change the catalog rather than being skipped", async () => {
  const { db, job } = await fixture();
  try {
    const first = await call(db, job);
    await db.exec(
      "create table public.future_dependency(id uuid primary key,user_id uuid);alter table public.future_dependency add constraint future_fk foreign key(user_id) references auth.users(id) on delete set default not valid;select public.protect_account_access_boundaries()",
    );
    const next = await call(db, job);
    assert.notEqual(next.schema_fingerprint, first.schema_fingerprint);
    assert.deepEqual(
      next.relationships.find((r) => r.constraint === "future_fk"),
      {
        schema: "public",
        table: "future_dependency",
        constraint: "future_fk",
        column: "user_id",
        on_delete: "set_default",
        validated: false,
        deferrable: false,
        initially_deferred: false,
        rows_at_least: 0,
        capped: false,
      },
    );
    await db.exec("alter table public.future_dependency validate constraint future_fk");
    const validated = await call(db, job);
    assert.notEqual(validated.schema_fingerprint, next.schema_fingerprint);
    assert.equal(validated.relationships.find((r) => r.constraint === "future_fk").validated, true);
    await db.exec(
      "alter table public.future_dependency drop constraint future_fk;alter table public.future_dependency add constraint future_fk foreign key(user_id) references auth.users(id) on delete cascade",
    );
    const changed = await call(db, job);
    assert.notEqual(changed.schema_fingerprint, validated.schema_fingerprint);
    assert.equal(
      changed.relationships.find((r) => r.constraint === "future_fk").on_delete,
      "cascade",
    );
  } finally {
    await db.close();
  }
});

test("missing identity, worker pause, expired/wrong leases, incorrect target/phase and member access cannot produce an inspection", async () => {
  const { db, job, other } = await fixture();
  try {
    for (const role of ["anon", "authenticated"]) {
      await db.exec(`set role ${role}`);
      await assert.rejects(call(db, job));
      await db.exec("reset role");
    }
    await db.exec("set role service_role");
    await assert.rejects(db.query("select public.account_deletion_auth_dependency_catalog()"));
    await db.exec("reset role");
    for (const patch of [{ id: randomUUID() }, { user_id: other }, { lease_token: randomUUID() }])
      await assert.rejects(call(db, { ...job, ...patch }));
    for (const n of [0, 101, null]) await assert.rejects(call(db, job, n));
    await db.exec("update account_deletion_controls set worker_enabled=false");
    await assert.rejects(call(db, job));
    await db.exec(
      "update account_deletion_controls set worker_enabled=true;update account_deletion_jobs set phase='verification'",
    );
    await assert.rejects(call(db, job));
    await db.exec("update account_deletion_jobs set phase='identity'");
    assert.equal((await call(db, job)).scope, "direct_auth_foreign_keys");
    await db.exec("update account_deletion_jobs set lease_until=now()-interval '1 second'");
    await assert.rejects(call(db, job));
    await db.exec(
      "update account_deletion_jobs set lease_until=now()+interval '5 minutes';create function public.new_unguarded_member_rpc() returns integer language sql security definer as $$select 1$$",
    );
    await assert.rejects(call(db, job));
    await db.exec(
      'drop function public.new_unguarded_member_rpc();delete from public.fixture_retained;delete from public."fixture_orders";delete from "Quoted schema"."Quoted table"',
    );
    await db.query("delete from auth.users where id=$1", [job.user_id]);
    await assert.rejects(call(db, job), "post-cascade emptiness is not a pre-identity inspection");
  } finally {
    await db.close();
  }
});

test("partitioned references include physical partitions once, while ordinary inheritance does not invent cascading child references", async () => {
  const { db, job } = await fixture();
  try {
    await db.exec(`
      create table public.partition_dependency(id integer,user_id uuid references auth.users(id) on delete cascade) partition by range(id);
      create table public.partition_dependency_one partition of public.partition_dependency for values from (0) to (10);
      create table public.partition_dependency_two partition of public.partition_dependency for values from (10) to (20);
      create table public.inherited_parent(id integer,user_id uuid references auth.users(id) on delete cascade);
      create table public.inherited_child() inherits(public.inherited_parent);
      select public.protect_account_access_boundaries();
    `);
    await db.query("insert into public.partition_dependency values(1,$1),(11,$1)", [job.user_id]);
    await db.query("insert into public.inherited_child values(1,$1)", [job.user_id]);
    const result = await call(db, job);
    const partitioned = result.relationships.filter((r) =>
      r.table.startsWith("partition_dependency"),
    );
    assert.equal(partitioned.length, 1);
    assert.equal(partitioned[0].rows_at_least, 2);
    assert.equal(result.relationships.find((r) => r.table === "inherited_parent").rows_at_least, 0);
    assert(!result.relationships.some((r) => r.table === "inherited_child"));
  } finally {
    await db.close();
  }
});

test("composite identity relationships require explicit schema review instead of silently counting only one column", async () => {
  const { db, job } = await fixture();
  try {
    await db.exec(
      "alter table auth.users add column realm text not null default 'fixture';alter table auth.users add constraint fixture_identity_pair unique(id,realm);create table public.composite_dependency(user_id uuid,realm text,foreign key(user_id,realm) references auth.users(id,realm));select public.protect_account_access_boundaries()",
    );
    await assert.rejects(call(db, job));
  } finally {
    await db.close();
  }
});

const row = () => ({
  schema: "public",
  table: "orders",
  constraint: "orders_buyer_id_fkey",
  column: "buyer_id",
  on_delete: "cascade",
  validated: true,
  deferrable: false,
  initially_deferred: false,
  rows_at_least: 0,
  capped: false,
});
const report = () => ({
  scope: "direct_auth_foreign_keys",
  schema_fingerprint: "a".repeat(32),
  relationships: [row()],
});
const job = () => ({
  id: randomUUID(),
  user_id: randomUUID(),
  lease_token: randomUUID(),
  phase: "identity",
  lease_until: new Date(Date.now() + 300000).toISOString(),
});
function transport(reply) {
  const calls = [];
  return {
    calls,
    rpc(name, args) {
      return {
        abortSignal(s) {
          return {
            async retry(enabled) {
              assert.equal(enabled, false);
              s.throwIfAborted();
              calls.push({ name, args, signal: s });
              return reply(name, args, s);
            },
          };
        },
      };
    },
  };
}

test("server adapter freezes scope, returns immutable closed metadata and never turns a zero count into deletion permission", async () => {
  const supplied = job();
  const first = { ...supplied };
  let resolve;
  const bridge = transport(() => new Promise((r) => (resolve = r)));
  const pending = createAccountDeletionAuthDependencyInspection(bridge).inspect(supplied, signal());
  supplied.user_id = randomUUID();
  supplied.phase = "verification";
  resolve({ data: report(), error: null });
  const result = await pending;
  assert.deepEqual(bridge.calls[0].args, {
    _id: first.id,
    _user: first.user_id,
    _lease: first.lease_token,
    _limit: 100,
  });
  assert.equal(result.relationships[0].rowsAtLeast, 0);
  assert(Object.isFrozen(result));
  assert(Object.isFrozen(result.relationships));
  assert(Object.isFrozen(result.relationships[0]));
  assert.deepEqual(Object.keys(result).sort(), ["relationships", "schemaFingerprint", "scope"]);
});

test("malformed/extra/private response fields, duplicates, unsafe counts and provider failures expose only a coded error", async () => {
  const badRows = [
    { ...row(), private_payload: "SECRET" },
    { ...row(), rows_at_least: -1 },
    { ...row(), rows_at_least: 102, capped: true },
    { ...row(), rows_at_least: 101, capped: false },
    { ...row(), rows_at_least: 0, capped: true },
    { ...row(), on_delete: "ignore" },
    { ...row(), validated: "true" },
    { ...row(), initially_deferred: true },
    { ...row(), schema: "a".repeat(64) },
    { ...row(), column: "bad\0column" },
  ];
  for (const data of [
    null,
    {},
    { ...report(), extra: "SECRET" },
    { ...report(), scope: "all_account_data" },
    { ...report(), schema_fingerprint: "not-a-hash" },
    { ...report(), relationships: [row(), row()] },
    { ...report(), relationships: Array(257).fill(row()) },
    ...badRows.map((r) => ({ ...report(), relationships: [r] })),
  ]) {
    await assert.rejects(
      createAccountDeletionAuthDependencyInspection(
        transport(() => ({ data, error: null })),
      ).inspect(job(), signal()),
      unavailable,
    );
  }
  for (const reply of [
    () => {
      throw Error("PRIVATE provider detail");
    },
    () => ({ data: report(), error: { message: "PRIVATE" } }),
  ])
    await assert.rejects(
      createAccountDeletionAuthDependencyInspection(transport(reply)).inspect(job(), signal()),
      unavailable,
    );
  const bridge = transport(() => ({ data: report(), error: null }));
  const api = createAccountDeletionAuthDependencyInspection(bridge);
  for (const patch of [
    { id: "invalid" },
    { user_id: null },
    { lease_token: "invalid" },
    { phase: "verification" },
    { phase: "media" },
  ])
    await assert.rejects(api.inspect({ ...job(), ...patch }, signal()), unavailable);
  for (const limit of [0, 101, 1.5])
    await assert.rejects(api.inspect(job(), signal(), limit), unavailable);
  await assert.rejects(api.inspect(job(), AbortSignal.abort()), unavailable);
  assert.equal(bridge.calls.length, 0);
});

test("actual installed Supabase client sends one bounded scoped RPC and never retries a failed transport or HTTP response", async () => {
  for (const failure of ["http", "network", "body_abort"]) {
    let count = 0;
    const controller = new AbortController();
    const target = job();
    const db = createClient("https://fixture.invalid", "fixture-service-key", {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
      global: {
        fetch: async (url, options) => {
          count++;
          assert.equal(
            new URL(url).pathname,
            "/rest/v1/rpc/inspect_account_deletion_auth_dependencies",
          );
          assert.equal(options.method, "POST");
          assert.deepEqual(JSON.parse(options.body), {
            _id: target.id,
            _user: target.user_id,
            _lease: target.lease_token,
            _limit: 100,
          });
          assert(options.signal instanceof AbortSignal);
          if (failure === "network") throw TypeError("PRIVATE transport diagnostic");
          if (failure === "body_abort") {
            controller.abort();
            return new Response(JSON.stringify(report()), {
              status: 200,
              headers: { "content-type": "application/json" },
            });
          }
          return new Response(JSON.stringify({ message: "PRIVATE SQL diagnostic" }), {
            status: 503,
            headers: { "content-type": "application/json", "retry-after": "0" },
          });
        },
      },
    });
    await assert.rejects(
      createAccountDeletionAuthDependencyInspection(db).inspect(target, controller.signal),
      unavailable,
    );
    assert.equal(count, 1);
  }
});
