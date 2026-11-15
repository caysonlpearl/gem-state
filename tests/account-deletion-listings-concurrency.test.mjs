import test from "node:test";
import assert from "node:assert/strict";
import { setTimeout as pause } from "node:timers/promises";
import { withListingTestPostgres } from "./helpers/postgres-test-cluster.mjs";
import { installDeletionPhotoWriterSchema } from "./helpers/account-deletion-photo-database.mjs";
import { installPrivateRecordSources } from "./helpers/account-deletion-private-database.mjs";
import { listingRecordsDatabase } from "./helpers/account-deletion-listing-records-database.mjs";
import { seedListing } from "./helpers/account-deletion-owned-listings-database.mjs";
test(
  "native cache writes serialize with deletion and an expired cache lock wait rolls back vector erasure",
  {
    skip: process.env.BLUEBIRD_DELETION_PG !== "1" ? "Run with BLUEBIRD_DELETION_PG=1" : false,
    timeout: 60000,
  },
  async () =>
    withListingTestPostgres(async (connect) => {
      const a = await connect(),
        b = await connect(),
        db = { exec: (sql) => a.query(sql), query: (sql, args) => a.query(sql, args) };
      await installDeletionPhotoWriterSchema(db);
      await installPrivateRecordSources(db);
      await listingRecordsDatabase({ provided: db });
      const prepare = () => seedListing(db);
      const cache = (c, f) =>
        c.query(
          "insert into shopping_inventory(listing_id,card,category,price_cents,content_hash,valid_until)values($1,$2::jsonb,'jobs',100,'synthetic-v1',now()+interval '1 day')on conflict(listing_id)do update set card=excluded.card returning listing_id",
          [f.listing, JSON.stringify({ id: f.listing, title: "Synthetic cached listing" })],
        );
      const waitLock = async (c, pid) => {
        for (let i = 0; i < 60; i++) {
          if (
            (await c.query("select wait_event_type from pg_stat_activity where pid=$1", [pid]))
              .rows[0]?.wait_event_type === "Lock"
          )
            return;
          await pause(10);
        }
        throw Error("Expected live listing/cache lock was not observed");
      };
      const earlier = await prepare();
      await a.query("begin");
      assert.equal((await cache(a, earlier)).rowCount, 1);
      const request = b.query("select mobile_request_deletion($1)", [earlier.seller]);
      await waitLock(a, b.processID);
      await a.query("commit");
      await request;
      assert.equal(
        (await cache(a, earlier)).rowCount,
        0,
        "A queued deletion suppresses a stale refresh",
      );
      const later = await prepare();
      await b.query("begin");
      await b.query("select mobile_request_deletion($1)", [later.seller]);
      const staleRefresh = cache(a, later);
      await waitLock(b, a.processID);
      await b.query("commit");
      assert.equal((await staleRefresh).rowCount, 0);
      const expiring = await prepare();
      await cache(a, expiring);
      await a.query(
        "insert into shopping_embeddings(listing_id,content_hash,model_version,embedding)values($1,'synthetic-v1','synthetic-model',array[0.1,0.2]::double precision[])",
        [expiring.listing],
      );
      await a.query("select mobile_request_deletion($1)", [expiring.seller]);
      await a.query("update account_deletion_controls set worker_enabled=true");
      const job = (
        await a.query(
          "update account_deletion_jobs set phase='records',status='processing',lease_token=gen_random_uuid(),lease_until=clock_timestamp()+interval '5 minutes'where user_id=$1 returning *",
          [expiring.seller],
        )
      ).rows[0];
      const purge = () =>
        a.query("select purge_account_deletion_listings($1,$2,$3,100)result", [
          job.id,
          expiring.seller,
          job.lease_token,
        ]);

      await b.query("begin");
      await b.query("select listing_id from shopping_inventory where listing_id=$1 for update", [
        expiring.listing,
      ]);
      await a.query(
        "update account_deletion_jobs set lease_until=clock_timestamp()+interval '200 milliseconds'where id=$1",
        [job.id],
      );
      const expired = assert.rejects(purge(), /Listing erasure unavailable/);
      await waitLock(b, a.processID);
      await pause(250);
      await b.query("commit");
      await expired;
      assert.equal(
        (
          await a.query("select count(*)::int n from shopping_embeddings where listing_id=$1", [
            expiring.listing,
          ])
        ).rows[0].n,
        1,
        "Expired work cannot commit a provisional vector delete",
      );
    }),
);
