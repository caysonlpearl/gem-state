import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { setTimeout as pause } from "node:timers/promises";
import { withListingTestPostgres } from "./helpers/postgres-test-cluster.mjs";
import { authorizationFixture } from "./helpers/account-deletion-authorization-database.mjs";

test(
  "real PostgreSQL authorizations survive a lease takeover and serialize Auth identity writes with withdrawal",
  {
    skip: process.env.BLUEBIRD_DELETION_PG !== "1" ? "Run with BLUEBIRD_DELETION_PG=1" : false,
    timeout: 60000,
  },
  async (t) =>
    withListingTestPostgres(async (connect) => {
      const a = await connect(),
        b = await connect(),
        db = { exec: (s) => a.query(s), query: (s, args) => a.query(s, args) };
      const f = await authorizationFixture(t, { provided: db });
      let replacement;
      f.provider(async () => {
        await b.query(
          "update account_deletion_jobs set lease_until=clock_timestamp()-interval '1 second'where id=$1",
          [f.initial.id],
        );
        const next = (await b.query("select * from claim_account_deletion()")).rows[0];
        replacement = { ...next, lease_until: next.lease_until.toISOString() };
        return new Response(null, { status: 200 });
      });
      assert.equal((await f.run()).status, "lease_lost");
      assert(replacement);
      assert.equal(
        (
          await a.query("select count(*)::int n from apple_authorization_vault where user_id=$1", [
            f.owner.userId,
          ])
        ).rows[0].n,
        1,
      );
      f.provider(undefined);
      assert.deepEqual(await f.work.step(replacement, AbortSignal.timeout(40000)), { done: false });
      assert.equal(await f.queue.advance(replacement, false), true);
      assert.equal((await f.run()).status, "advanced");
      assert.equal(f.providerCalls.length, 2);
      async function waiting(observer, pid) {
        for (let n = 0; n < 80; n++) {
          if (
            (
              await observer.query("select wait_event_type from pg_stat_activity where pid=$1", [
                pid,
              ])
            ).rows[0]?.wait_event_type === "Lock"
          )
            return;
          await pause(10);
        }
        throw Error("Expected identity account lock was not observed");
      }
      await a.query("begin");
      await a.query(
        "insert into auth.identities(id,user_id,provider,provider_id)values($1,$2,'email','synthetic-native-email')",
        [randomUUID(), f.other.userId],
      );
      const request = b.query("select mobile_request_deletion($1)", [f.other.userId]);
      await waiting(a, b.processID);
      await a.query("commit");
      await request;
      const otherJob = (
        await a.query(
          "update account_deletion_jobs set phase='authorization',status='processing',lease_token=gen_random_uuid(),lease_until=clock_timestamp()+interval '5 minutes'where user_id=$1 returning *",
          [f.other.userId],
        )
      ).rows[0];
      await a.query("begin");
      await a.query("select prepare_account_deletion_authorization($1,$2,$3)", [
        otherJob.id,
        f.other.userId,
        otherJob.lease_token,
      ]);
      const writer = b
        .query("update auth.identities set identity_data='{}'where id=$1", [f.other.identityId])
        .then(
          () => ({ ok: true }),
          (error) => ({ error }),
        );
      await waiting(a, b.processID);
      await a.query("commit");
      assert.match((await writer).error?.message ?? "", /Private account records unavailable/);
      assert.deepEqual(
        (
          await a.query(
            "select account_deletion_authorization_current()a,apple_authorization_vault_current()v,account_deletion_private_barrier_current()p",
          )
        ).rows[0],
        { a: true, v: true, p: true },
      );
    }),
);
