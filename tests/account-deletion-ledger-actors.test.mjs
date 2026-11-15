import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import {
  ledgerActorDatabase,
  ledgerActorMigration,
  seedLedgerActors,
  installLedgerSettlementFinalizer,
} from "./helpers/account-deletion-ledger-actors-database.mjs";
import { fixtureMemberSession } from "./helpers/account-deletion-owned-listings-database.mjs";
import { createAccountDeletionLedgerActorErasure } from "../src/lib/account-deletion-ledger-actors.server.ts";
async function fixture(t, { many = 1, install = true } = {}) {
  const db = await ledgerActorDatabase({ install });
  t.after(() => db.close());
  return seedLedgerActors(db, { many });
}

test("bounded authorship retirement preserves every financial field and other authors, and verifies independently after Auth removal", async (t) => {
  const x = await fixture(t, { many: 203 }),
    { db, user } = x;
  const before = {};
  for (const name of ["order_payments", "order_payouts"])
    before[name] = (await db.query(`select * from ${name} order by id`)).rows;
  assert.equal(
    (await db.query("select account_deletion_profile_financial_remaining($1)r", [user])).rows[0].r,
    true,
    "Non-FK authorship blocks premature profile erasure",
  );
  const job = await x.start();
  let total = 0;
  for (const expected of [100, 100, 3, 2]) {
    const value = await x.step(job);
    assert.equal(value.changed, expected);
    total += value.changed;
  }
  assert.equal(total, 205);
  assert.deepEqual(await x.step(job), { source: null, changed: 0, pass_done: true });
  for (const name of Object.keys(before)) {
    const after = (await db.query(`select * from ${name} order by id`)).rows;
    assert.deepEqual(
      after,
      before[name].map((row) => ({
        ...row,
        recorded_by: row.recorded_by === user ? null : row.recorded_by,
      })),
    );
  }
  assert.equal(
    (await db.query("select current_setting('parkvault.trusted_operation',true)t")).rows[0].t,
    "off",
  );
  await db.query("update account_deletion_jobs set phase='verification'where id=$1", [job.id]);
  await assert.rejects(
    db.query("select verify_account_deletion_ledger_actors($1,$2,$3)", [
      job.id,
      user,
      job.lease_token,
    ]),
  );
  await db.query("update account_deletion_jobs set phase='records'where id=$1", [job.id]);
  for (let n = 0; n < 10; n++) {
    const row = (
      await db.query("select purge_account_deletion_consents($1,$2,$3,'records',100)r", [
        job.id,
        user,
        job.lease_token,
      ])
    ).rows[0].r;
    if (row.pass_done) break;
  }
  await db.query("delete from auth.users where id=$1", [user]);
  await db.query("update account_deletion_jobs set phase='verification'where id=$1", [job.id]);
  assert.equal(
    (
      await db.query("select verify_account_deletion_ledger_actors($1,$2,$3)r", [
        job.id,
        user,
        job.lease_token,
      ])
    ).rows[0].r,
    true,
  );
});
test("late settlement writes clear pending/missing authors while preserving amounts, payee and operation guards", async (t) => {
  const x = await fixture(t),
    { db, user, f, orders } = x;
  await x.start();
  const insert = (actor) =>
    db.query(
      "insert into order_payments(order_id,kind,provider,external_reference,amount_cents,provider_status,recorded_by)values($1,'capture','stripe',$2,123,'succeeded',$3)returning recorded_by,amount_cents",
      [orders[0], "ch_synthetic_" + randomUUID().slice(0, 8), actor],
    );
  await fixtureMemberSession(db, f.buyer);
  await db.exec("set role authenticated");
  try {
    await assert.rejects(insert(user), /permission denied|row-level security/i);
  } finally {
    await db.exec("reset role");
    await db.exec("select set_config('request.jwt.claims','{}',false)");
  }
  await db.exec("select set_config('parkvault.trusted_operation','on',false)");
  assert.deepEqual((await insert(user)).rows[0], { recorded_by: null, amount_cents: 123 });
  assert.equal((await insert(randomUUID())).rows[0].recorded_by, null);
  assert.equal((await insert(f.buyer)).rows[0].recorded_by, f.buyer);
  await db.query("update order_payouts set status='completed',recorded_by=$1 where order_id=$2", [
    user,
    orders[0],
  ]);
  const payout = (
    await db.query(
      "select payee_id,status,amount_cents,recorded_by from order_payouts where order_id=$1",
      [orders[0]],
    )
  ).rows[0];
  assert.deepEqual(payout, {
    payee_id: f.seller,
    status: "completed",
    amount_cents: 9500,
    recorded_by: null,
  });
  await db.exec("select set_config('parkvault.trusted_operation','off',false)");
  await fixtureMemberSession(db, f.buyer);
  await db.exec("set role authenticated");
  try {
    await assert.rejects(
      db.query("delete from order_payments"),
      /permission denied|row-level security/i,
    );
  } finally {
    await db.exec("reset role");
    await db.exec("select set_config('request.jwt.claims','{}',false)");
  }
});
for (const deletedRole of ["buyer", "seller"])
  test(`captured payment finalizer settles and replays after ${deletedRole} withdrawal without recreating ledger authorship`, async (t) => {
    const { db, f, order } = await fixture(t);
    await installLedgerSettlementFinalizer(db);
    const id = await order();
    await db.exec("select set_config('parkvault.trusted_operation','on',false)");
    await db.query("update asks set status='matched',matched_order_id=$1 where id=$2", [
      id,
      f.listing,
    ]);
    await db.exec("select set_config('parkvault.trusted_operation','off',false)");
    await db.query("select mobile_request_deletion($1)", [f[deletedRole]]);
    const finalize = (amount = 11000) =>
      db.query(
        "select finalize_stripe_order_payment($1,'cs_synthetic_ledger','pi_synthetic_ledger','ch_synthetic_ledger',$2,0,'succeeded',null)",
        [id, amount],
      );
    await assert.rejects(finalize(10999), /Stripe total does not match/);
    assert.equal(
      (await db.query("select status from orders where id=$1", [id])).rows[0].status,
      "awaiting_payment",
    );
    await finalize();
    await finalize();
    assert.deepEqual(
      (
        await db.query(
          "select status,payment_authorized,total_cents,stripe_payment_intent_id from orders where id=$1",
          [id],
        )
      ).rows[0],
      {
        status: "payment_captured",
        payment_authorized: true,
        total_cents: 11000,
        stripe_payment_intent_id: "pi_synthetic_ledger",
      },
    );
    const actor = deletedRole === "buyer" ? null : f.buyer;
    assert.deepEqual(
      (
        await db.query(
          "select recorded_by,amount_cents,external_reference from order_payments where order_id=$1",
          [id],
        )
      ).rows,
      [{ recorded_by: actor, amount_cents: 11000, external_reference: "pi_synthetic_ledger" }],
    );
    assert.deepEqual(
      (
        await db.query(
          "select recorded_by,payee_id,amount_cents,status from order_payouts where order_id=$1",
          [id],
        )
      ).rows,
      [{ recorded_by: actor, payee_id: f.seller, amount_cents: 9500, status: "pending" }],
    );
    assert.equal(
      (await db.query("select count(*)::int n from order_events where order_id=$1", [id])).rows[0]
        .n,
      1,
    );
    assert.equal(
      (
        await db.query("select count(*)::int n from notifications where user_id=$1", [
          f[deletedRole],
        ])
      ).rows[0].n,
      0,
    );
    assert.equal(
      (await db.query("select worker_enabled from account_deletion_controls")).rows[0]
        .worker_enabled,
      false,
    );
    assert.equal(
      (await db.query("select account_deletion_ledger_actor_barrier_current() ready")).rows[0]
        .ready,
      true,
    );
    assert.equal(
      (await db.query("select current_setting('parkvault.trusted_operation',true)t")).rows[0].t,
      "off",
    );
  });

test("payee references outside Auth foreign keys remain a separate financial barrier and cannot be reported as completed", async (t) => {
  const x = await fixture(t),
    { db, user, orders } = x;
  await db.exec("select set_config('parkvault.trusted_operation','on',false)");
  await db.query("update order_payouts set payee_id=$1 where order_id=$2", [user, orders[0]]);
  await db.exec("select set_config('parkvault.trusted_operation','off',false)");
  const job = await x.start();
  while (!(await x.step(job)).pass_done) {}
  assert.equal(
    (await db.query("select account_deletion_profile_financial_remaining($1)r", [user])).rows[0].r,
    true,
  );
  await db.exec(
    "create table ledger_completion_fixture(user_id uuid,status text);create trigger completion after update on ledger_completion_fixture for each row execute function guard_account_deletion_ledger_actor_completion()",
  );
  await db.query("insert into ledger_completion_fixture values($1,'processing')", [user]);
  await assert.rejects(
    db.query("update ledger_completion_fixture set status='completed'"),
    /Ledger identity handling is incomplete/,
  );
});
test("leases, roles, schema drift and private contract changes fail without partial retirement", async (t) => {
  const x = await fixture(t),
    { db, user } = x;
  const job = await x.start();
  for (const limit of [null, 0, 101]) await assert.rejects(x.step(job, limit), /unavailable/);
  await assert.rejects(x.step({ ...job, lease_token: randomUUID() }), /unavailable/);
  await db.exec("set role service_role");
  await assert.rejects(
    db.exec("update account_deletion_ledger_actor_contract set functions='{}'"),
    /permission denied/,
  );
  await db.exec("reset role");
  for (const role of ["anon", "authenticated"]) {
    await db.exec("set role " + role);
    await assert.rejects(x.step(job), /permission denied/);
    await db.exec("reset role");
  }
  await db.exec("alter table order_payments add column unreviewed text");
  await assert.rejects(x.step(job), /schema review/);
  assert.equal(
    (await db.query("select count(*)::int n from order_payments where recorded_by=$1", [user]))
      .rows[0].n,
    1,
  );
});
test("real Supabase adapter freezes scope and a lost response retries only remaining rows without leaking payment data", async (t) => {
  const x = await fixture(t, { many: 103 }),
    job = await x.start();
  let lose = true;
  const writes = [];
  const client = createClient("https://disposable.invalid", "fixture-service-key", {
    auth: { persistSession: false, autoRefreshToken: false },
    global: {
      fetch: async (input, init) => {
        const body = JSON.parse(init.body);
        writes.push(body);
        const value = (
          await x.db.query("select retire_account_deletion_ledger_actors($1,$2,$3,$4)r", [
            body._id,
            body._user,
            body._lease,
            body._limit,
          ])
        ).rows[0].r;
        if (lose) {
          lose = false;
          return new Response(JSON.stringify({ message: "Private provider/payment data" }), {
            status: 503,
          });
        }
        return new Response(JSON.stringify(value), {
          headers: { "content-type": "application/json" },
        });
      },
    },
  });
  const adapter = createAccountDeletionLedgerActorErasure(client);
  await assert.rejects(
    adapter.step(job, new AbortController().signal),
    (e) => e.message === "records_unavailable" && !e.cause,
  );
  assert.equal(writes.length, 1, "SDK retries are disabled");
  assert.equal((await adapter.step(job, new AbortController().signal)).changed, 3);
  assert.equal(writes[0]._user, x.user);
  assert.equal((await adapter.step(job, new AbortController().signal)).changed, 2);
  assert.equal((await adapter.step(job, new AbortController().signal)).passDone, true);
});
test("installation refuses a changed captured financial schema rather than weakening existing checks", async (t) => {
  const x = await fixture(t, { install: false });
  await x.db.exec("alter table order_payments add column changed_source text");
  await assert.rejects(x.db.exec(ledgerActorMigration()), /Review ledger columns/);
  await x.db.exec("rollback");
  assert.equal(
    (
      await x.db.query(
        "select to_regprocedure('public.retire_account_deletion_ledger_actors(uuid,uuid,uuid,integer)')f",
      )
    ).rows[0].f,
    null,
  );
});
