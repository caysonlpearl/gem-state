import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { setTimeout as pause } from "node:timers/promises";
import { withListingTestPostgres } from "./helpers/postgres-test-cluster.mjs";
import {
  productionListingDatabase,
  validProductionEdit,
} from "./helpers/mobile-listing-production-database.mjs";

test(
  "captured production domain serializes simultaneous retries without repeating actual events or import edits",
  {
    skip:
      process.env.BLUEBIRD_DELETION_PG !== "1"
        ? "Run the dedicated PostgreSQL gate with BLUEBIRD_DELETION_PG=1"
        : false,
    timeout: 60000,
  },
  async () =>
    withListingTestPostgres(async (connect) => {
      const first = await connect(),
        second = await connect();
      const f = await productionListingDatabase({
        exec: (sql) => first.query(sql),
        query: (sql, params) => first.query(sql, params),
      });
      const id = await f.seed({ imported: true }),
        before = await f.snapshot(id),
        request = randomUUID(),
        input = validProductionEdit();
      await second.query("select set_config('request.jwt.claims',$1,false)", [
        JSON.stringify({ sub: f.a, session_id: f.sessionA, role: "authenticated" }),
      ]);
      await second.query("set role authenticated");
      await first.query("begin");
      const original = await f.manage(id, "edit", before.version, input, request);
      const retry = second.query("select public.mobile_manage_listing($1,$2,'edit',$3,$4) result", [
        request,
        id,
        before.version,
        input,
      ]);
      let ended = false;
      retry.then(
        () => {
          ended = true;
        },
        () => {
          ended = true;
        },
      );
      await pause(40);
      assert.equal(ended, false, "Retry waits for original transaction");
      await first.query("commit");
      assert.deepEqual((await retry).rows[0].result, { ...original, replayed: true });
      await f.owner();
      assert.equal(
        (await first.query("select count(*)::int n from ask_events where ask_id=$1", [id])).rows[0]
          .n,
        1,
      );
      assert.equal(
        (
          await first.query(
            "select seller_edited from fb_marketplace_import_items where listing_id=$1",
            [id],
          )
        ).rows[0].seller_edited,
        true,
      );
      assert.equal(
        (
          await first.query(
            "select count(*)::int n from mobile_message_receipts where request_id=$1",
            [request],
          )
        ).rows[0].n,
        1,
      );
      assert.deepEqual(
        (await first.query("select public.account_access_coverage() result")).rows[0].result,
        { unguarded_functions: 0, unguarded_tables: 0, helper_privilege_gaps: 0 },
      );
    }),
);
