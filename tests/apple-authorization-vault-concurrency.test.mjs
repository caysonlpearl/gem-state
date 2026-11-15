import test from "node:test";
import assert from "node:assert/strict";
import { setTimeout as pause } from "node:timers/promises";
import { withListingTestPostgres } from "./helpers/postgres-test-cluster.mjs";
import {
  appleVaultDatabase,
  appleCaptureFixture,
} from "./helpers/apple-authorization-vault-database.mjs";

test(
  "real PostgreSQL serializes verified Apple credential storage with deletion in both lock orders",
  {
    skip: process.env.BLUEBIRD_DELETION_PG !== "1" ? "Run with BLUEBIRD_DELETION_PG=1" : false,
    timeout: 60000,
  },
  async () =>
    withListingTestPostgres(async (connect) => {
      const a = await connect(),
        b = await connect(),
        db = { exec: (s) => a.query(s), query: (s, args) => a.query(s, args) };
      await appleVaultDatabase({ provided: db });
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
        throw Error("Expected Apple account lock was not observed");
      }
      const first = await appleCaptureFixture(db);
      await first.capture();
      const args = first.requests.find((r) => r.name === "store_verified_apple_authorization").args;
      const store = (connection, values) =>
        connection.query(
          `select store_verified_apple_authorization(${Object.keys(values)
            .map((k, i) => '"' + k + '"=>$' + (i + 1))
            .join(",")})`,
          Object.values(values),
        );
      await a.query("begin");
      await store(a, args);
      const request = b.query("select mobile_request_deletion($1)", [first.userId]);
      await waiting(a, b.processID);
      await a.query("commit");
      await request;
      assert.equal(
        (
          await a.query("select count(*)::int n from apple_authorization_vault where user_id=$1", [
            first.userId,
          ])
        ).rows[0].n,
        1,
      );
      await assert.rejects(store(a, args), /Private account records unavailable/);
      await assert.rejects(
        a.query("delete from auth.users where id=$1", [first.userId]),
        /Apple authorizations require revocation/,
      );

      const second = await appleCaptureFixture(db);
      await second.capture();
      const reverseArgs = second.requests.find(
        (r) => r.name === "store_verified_apple_authorization",
      ).args;
      await b.query("begin");
      await b.query("select mobile_request_deletion($1)", [second.userId]);
      const pending = store(a, reverseArgs).then(
        () => ({ ok: true }),
        (error) => ({ error }),
      );
      await waiting(b, a.processID);
      await b.query("commit");
      const result = await pending;
      assert.match(result.error?.message ?? "", /Private account records unavailable/);
      assert.deepEqual(
        (
          await a.query(
            "select apple_authorization_vault_current()v,account_deletion_private_barrier_current()p,account_deletion_ledger_actor_barrier_current()l",
          )
        ).rows[0],
        { v: true, p: true, l: true },
      );
    }),
);
