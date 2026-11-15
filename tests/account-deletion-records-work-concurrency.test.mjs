import test from "node:test";
import assert from "node:assert/strict";
import { withListingTestPostgres } from "./helpers/postgres-test-cluster.mjs";
import { recordsWorkFixture } from "./helpers/account-deletion-records-work-database.mjs";

test(
  "real PostgreSQL records workflow drains with SDK calls and refuses advancement after another worker takes the expired lease",
  {
    skip: process.env.BLUEBIRD_DELETION_PG !== "1" ? "Run with BLUEBIRD_DELETION_PG=1" : false,
    timeout: 60000,
  },
  async (t) =>
    withListingTestPostgres(async (connect) => {
      const a = await connect(),
        b = await connect();
      const f = await recordsWorkFixture(t, {
        provided: { exec: (s) => a.query(s), query: (s, args) => a.query(s, args) },
      });
      let replacement;
      f.afterRpc(async (name, args) => {
        if (name !== "inspect_account_deletion_auth_dependencies" || replacement) return;
        await b.query(
          "update account_deletion_jobs set lease_until=clock_timestamp()-interval '1 second' where id=$1",
          [f.job.id],
        );
        const row = (await b.query("select * from claim_account_deletion()")).rows[0];
        assert.equal(row.id, f.job.id);
        assert.notEqual(row.lease_token, args._lease);
        replacement = { ...row, lease_until: row.lease_until.toISOString() };
      });
      for (let n = 0; n < 40; n++) {
        const result = await f.run();
        if (result.status === "lease_lost") break;
        assert.equal(result.status, "continued");
        if (n === 39) throw Error("Synthetic records workflow did not reach the lease takeover");
      }
      assert(replacement);
      assert.equal(
        (await a.query("select phase from account_deletion_jobs where id=$1", [f.job.id])).rows[0]
          .phase,
        "records",
      );
      f.afterRpc(undefined);
      assert.deepEqual(await f.records.step(replacement, AbortSignal.timeout(40000)), {
        done: true,
      });
      assert.equal(await f.queue.advance(replacement, true), true);
      assert.equal(
        (await a.query("select phase from account_deletion_jobs where id=$1", [f.job.id])).rows[0]
          .phase,
        "identity",
      );
      assert.equal(
        (await a.query("select count(*)::int n from auth.users where id=$1", [f.user])).rows[0].n,
        1,
      );
    }),
);
