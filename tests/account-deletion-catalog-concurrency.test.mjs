import test from "node:test";
import assert from "node:assert/strict";
import { setTimeout as pause } from "node:timers/promises";
import { withListingTestPostgres } from "./helpers/postgres-test-cluster.mjs";
import { installDeletionPhotoWriterSchema } from "./helpers/account-deletion-photo-database.mjs";
import { installPrivateRecordSources } from "./helpers/account-deletion-private-database.mjs";
import { catalogDatabase, seedCatalog } from "./helpers/account-deletion-catalog-database.mjs";
test(
  "catalog writes, parent-author changes and leased variant erasure serialize on real PostgreSQL",
  {
    skip: process.env.BLUEBIRD_DELETION_PG !== "1" ? "Run with BLUEBIRD_DELETION_PG=1" : false,
    timeout: 60000,
  },
  async () =>
    withListingTestPostgres(async (connect) => {
      const a = await connect(),
        b = await connect(),
        provided = { exec: (s) => a.query(s), query: (s, args) => a.query(s, args) };
      await installDeletionPhotoWriterSchema(provided);
      await installPrivateRecordSources(provided);
      await catalogDatabase({ provided });
      const image = (c, f) =>
        c.query("insert into product_images(product_id,storage_path)values($1,$2)returning id", [
          f.product,
          `${f.product}/synthetic-${Math.random()}.jpg`,
        ]);
      const waitLock = async (c, pid) => {
        for (let i = 0; i < 70; i++) {
          if (
            (await c.query("select wait_event_type from pg_stat_activity where pid=$1", [pid]))
              .rows[0]?.wait_event_type === "Lock"
          )
            return;
          await pause(10);
        }
        throw Error("Expected catalog lock was not observed");
      };
      const first = await seedCatalog(provided);
      await a.query("begin");
      await image(a, first);
      const request = b.query("select mobile_request_deletion($1)", [first.seller]);
      await waitLock(a, b.processID);
      await a.query("commit");
      await request;
      await assert.rejects(image(a, first), /Private account records unavailable/);
      const second = await seedCatalog(provided);
      await b.query("begin");
      await b.query("select mobile_request_deletion($1)", [second.seller]);
      const late = assert.rejects(image(a, second), /Private account records unavailable/);
      await waitLock(b, a.processID);
      await b.query("commit");
      await late;
      // A child must lock the actual parent author, not read the old author while
      // a non-key author UPDATE commits a different, deletion-pending account.
      const transfer = await seedCatalog(provided),
        recipient = await seedCatalog(provided);
      await b.query("begin");
      await b.query("update products set created_by=$1 where id=$2", [
        recipient.seller,
        transfer.product,
      ]);
      await b.query("select mobile_request_deletion($1)", [recipient.seller]);
      const reassigned = assert.rejects(image(a, transfer), /Private account records unavailable/);
      await waitLock(b, a.processID);
      await b.query("commit");
      await reassigned;
      assert.equal(
        (
          await a.query("select count(*)::int n from product_images where product_id=$1", [
            transfer.product,
          ])
        ).rows[0].n,
        0,
      );
      const expiring = await seedCatalog(provided);
      await a.query("select mobile_request_deletion($1)", [expiring.seller]);
      await a.query("update account_deletion_controls set worker_enabled=true");
      const job = (
        await a.query(
          "update account_deletion_jobs set phase='records',status='processing',lease_token=gen_random_uuid(),lease_until=clock_timestamp()+interval '5 minutes'where user_id=$1 returning *",
          [expiring.seller],
        )
      ).rows[0];
      const purge = () =>
        a.query("select purge_account_deletion_catalog($1,$2,$3,100)result", [
          job.id,
          expiring.seller,
          job.lease_token,
        ]);
      assert.equal((await purge()).rows[0].result.source, "unpublished");
      await b.query("begin");
      await b.query("select id from product_variants where id=$1 for update", [expiring.variant]);
      await a.query(
        "update account_deletion_jobs set lease_until=clock_timestamp()+interval '200 milliseconds'where id=$1",
        [job.id],
      );
      const expired = assert.rejects(
        purge(),
        /Catalog erasure unavailable|Private account records unavailable/,
      );
      await waitLock(b, a.processID);
      await pause(250);
      await b.query("commit");
      await expired;
      assert.equal(
        (
          await a.query("select count(*)::int n from product_variants where id=$1", [
            expiring.variant,
          ])
        ).rows[0].n,
        1,
        "A lease that expires during a parent/variant wait cannot commit deletion",
      );
    }),
);
