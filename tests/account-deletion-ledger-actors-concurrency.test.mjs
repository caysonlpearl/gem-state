import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { setTimeout as pause } from "node:timers/promises";
import { withListingTestPostgres } from "./helpers/postgres-test-cluster.mjs";
import {
  ledgerActorDatabase,
  seedLedgerActors,
  installLedgerSettlementFinalizer,
} from "./helpers/account-deletion-ledger-actors-database.mjs";

test(
  "real PostgreSQL serializes ledger writers, deletion and concurrent cleanup without blocking a late settlement",
  {
    skip: process.env.BLUEBIRD_DELETION_PG !== "1" ? "Run with BLUEBIRD_DELETION_PG=1" : false,
    timeout: 60000,
  },
  async () =>
    withListingTestPostgres(async (connect) => {
      const a = await connect(),
        b = await connect();
      const db = { exec: (s) => a.query(s), query: (s, args) => a.query(s, args) };
      await ledgerActorDatabase({ provided: db });
      const { user, f, orders, order } = await seedLedgerActors(db, { many: 203 });
      await installLedgerSettlementFinalizer(db);
      async function waitLock(connection, pid) {
        for (let n = 0; n < 80; n++) {
          if (
            (
              await connection.query("select wait_event_type from pg_stat_activity where pid=$1", [
                pid,
              ])
            ).rows[0]?.wait_event_type === "Lock"
          )
            return;
          await pause(10);
        }
        throw Error("Expected ledger account lock was not observed");
      }
      const insert = () =>
        a.query(
          "insert into order_payments(order_id,kind,provider,external_reference,amount_cents,provider_status,recorded_by)values($1,'capture','stripe',$2,123,'succeeded',$3)returning recorded_by",
          [orders[0], "ch_synthetic_" + randomUUID().slice(0, 8), user],
        );
      // A writer that already owns the shared account lock commits before request.
      await a.query("select set_config('parkvault.trusted_operation','on',false)");
      await a.query("begin");
      assert.equal((await insert()).rows[0].recorded_by, user);
      const request = b.query("select mobile_request_deletion($1)", [user]);
      await waitLock(a, b.processID);
      await a.query("commit");
      await request;
      assert.equal((await insert()).rows[0].recorded_by, null);
      await a.query("select set_config('parkvault.trusted_operation','off',false)");

      // Reverse the lock order with the captured callback. It waits for withdrawal
      // then settles with no buyer authorship, without duplicating payment evidence.
      const id = await order();
      await a.query("select set_config('parkvault.trusted_operation','on',false)");
      await a.query("update asks set status='matched',matched_order_id=$1 where id=$2", [
        id,
        f.listing,
      ]);
      await a.query("select set_config('parkvault.trusted_operation','off',false)");
      await b.query("begin");
      await b.query("select mobile_request_deletion($1)", [f.buyer]);
      const finalize = () =>
        a.query(
          "select finalize_stripe_order_payment($1,'cs_synthetic_race','pi_synthetic_race','ch_synthetic_race',11000,0,'succeeded',null)",
          [id],
        );
      const lateSettlement = finalize();
      await waitLock(b, a.processID);
      await b.query("commit");
      await lateSettlement;
      await finalize();
      assert.deepEqual(
        (
          await a.query("select recorded_by,amount_cents from order_payments where order_id=$1", [
            id,
          ])
        ).rows,
        [{ recorded_by: null, amount_cents: 11000 }],
      );
      assert.deepEqual(
        (
          await a.query(
            "select recorded_by,payee_id,amount_cents from order_payouts where order_id=$1",
            [id],
          )
        ).rows,
        [{ recorded_by: null, payee_id: f.seller, amount_cents: 9500 }],
      );

      await a.query("update account_deletion_controls set worker_enabled=true");
      const job = (
        await a.query(
          "update account_deletion_jobs set status='processing',phase='records',lease_token=gen_random_uuid(),lease_until=clock_timestamp()+interval '5 minutes'where user_id=$1 returning *",
          [user],
        )
      ).rows[0];
      const step = (c) =>
        c.query("select retire_account_deletion_ledger_actors($1,$2,$3,100)r", [
          job.id,
          user,
          job.lease_token,
        ]);
      await a.query("begin");
      const first = (await step(a)).rows[0].r;
      const competing = step(b);
      await waitLock(a, b.processID);
      await a.query("commit");
      const second = (await competing).rows[0].r;
      assert.equal(first.changed, 100);
      assert.equal(second.changed, 100);
      assert.equal((await step(a)).rows[0].r.changed, 4);
      assert.equal((await step(a)).rows[0].r.changed, 2);
      assert.deepEqual((await step(a)).rows[0].r, { source: null, changed: 0, pass_done: true });
      assert.equal(
        (await a.query("select account_deletion_ledger_actor_remaining($1)r", [user])).rows[0].r,
        false,
      );
      assert.equal(
        (
          await a.query("select count(*)::int n from order_payments where recorded_by=$1", [
            f.buyer,
          ])
        ).rows[0].n,
        1,
        "Other accounting authors remain for their own cleanup",
      );
      await a.query("begin isolation level repeatable read");
      await assert.rejects(insert(), /Ledger authorship unavailable/);
      await a.query("rollback");
    }),
);
