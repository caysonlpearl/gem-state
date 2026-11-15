import test from "node:test";
import assert from "node:assert/strict";
import { setTimeout as pause } from "node:timers/promises";
import { withListingTestPostgres } from "./helpers/postgres-test-cluster.mjs";
import { installDeletionPhotoWriterSchema } from "./helpers/account-deletion-photo-database.mjs";
import { installPrivateRecordSources } from "./helpers/account-deletion-private-database.mjs";
import { submissionRecordsDatabase } from "./helpers/account-deletion-submission-records-database.mjs";
import { seedCatalog } from "./helpers/account-deletion-catalog-database.mjs";
test(
  "real PostgreSQL orders submission writes, retention references and expiring cleanup leases",
  {
    skip: process.env.BLUEBIRD_DELETION_PG !== "1" ? "Run with BLUEBIRD_DELETION_PG=1" : false,
    timeout: 60000,
  },
  async () =>
    withListingTestPostgres(async (connect) => {
      const a = await connect(),
        b = await connect();
      const db = { exec: (s) => a.query(s), query: (s, args) => a.query(s, args) };
      await installDeletionPhotoWriterSchema(db);
      await installPrivateRecordSources(db);
      await submissionRecordsDatabase({ provided: db });
      const prepare = async () => {
        const f = await seedCatalog(db);
        f.proposal = (
          await a.query(
            "insert into product_suggestions(submitted_by,name,category_id)values($1,'Synthetic race submission',$2)returning id",
            [f.seller, f.category],
          )
        ).rows[0].id;
        return f;
      };
      const photo = (c, f) =>
        c.query(
          "insert into product_suggestion_media(suggestion_id,storage_path)values($1,$2)returning id",
          [
            f.proposal,
            `https://udxxfuticbxwiehoepeg.supabase.co/storage/v1/object/public/catalog-media/${f.seller}/synthetic.jpg`,
          ],
        );
      const waitLock = async (c, pid) => {
        for (let i = 0; i < 70; i++) {
          if (
            (await c.query("select wait_event_type from pg_stat_activity where pid=$1", [pid]))
              .rows[0]?.wait_event_type === "Lock"
          )
            return;
          await pause(10);
        }
        throw Error("Expected live submission lock was not observed");
      };
      const start = async (f) => {
        await a.query("select mobile_request_deletion($1)", [f.seller]);
        await a.query("update account_deletion_controls set worker_enabled=true");
        const job = (
          await a.query(
            "update account_deletion_jobs set phase='inventory',status='processing',lease_token=gen_random_uuid(),lease_until=clock_timestamp()+interval '5 minutes'where user_id=$1 returning *",
            [f.seller],
          )
        ).rows[0];
        for (let i = 0; i < 100; i++) {
          const r = (
            await a.query("select scan_account_deletion_media_inventory($1,$2,$3,50)result", [
              job.id,
              f.seller,
              job.lease_token,
            ])
          ).rows[0].result;
          if (r.pass_done) break;
          if (i === 99) throw Error("Synthetic inventory did not complete");
        }
        await a.query("update account_deletion_jobs set phase='records'where id=$1", [job.id]);
        return job;
      };
      const purge = (f, job) =>
        a.query("select purge_account_deletion_submissions($1,$2,$3,100)result", [
          job.id,
          f.seller,
          job.lease_token,
        ]);
      const first = await prepare();
      await a.query("begin");
      await photo(a, first);
      const earlierWrite = b.query("select mobile_request_deletion($1)", [first.seller]);
      await waitLock(a, b.processID);
      await a.query("commit");
      await earlierWrite;
      await assert.rejects(photo(a, first), /Private account records unavailable/);
      const second = await prepare();
      await b.query("begin");
      await b.query("select mobile_request_deletion($1)", [second.seller]);
      const laterWrite = assert.rejects(photo(a, second), /Private account records unavailable/);
      await waitLock(b, a.processID);
      await b.query("commit");
      await laterWrite;
      assert.equal(
        (
          await a.query(
            "select count(*)::int n from product_suggestion_media where suggestion_id=$1",
            [second.proposal],
          )
        ).rows[0].n,
        0,
      );

      const expiring = await prepare();
      const media = (await photo(a, expiring)).rows[0].id,
        expiringJob = await start(expiring);
      await b.query("begin");
      await b.query("select id from product_suggestion_media where id=$1 for update", [media]);
      await a.query(
        "update account_deletion_jobs set lease_until=clock_timestamp()+interval '200 milliseconds'where id=$1",
        [expiringJob.id],
      );
      const expired = assert.rejects(
        purge(expiring, expiringJob),
        /Submission erasure unavailable|Private account records unavailable/,
      );
      await waitLock(b, a.processID);
      await pause(250);
      await b.query("commit");
      await expired;
      assert.equal(
        (await a.query("select count(*)::int n from product_suggestion_media where id=$1", [media]))
          .rows[0].n,
        1,
      );
      assert.equal(
        (
          await a.query(
            "select nullif(current_setting('bluebird.submission_cleanup',true),'')context",
          )
        ).rows[0].context,
        null,
      );

      // A new financial relation to an active staff-owned variant must be visible
      // after the cleaner waits on its FK lock. It must not erase the source form.
      const staff = await seedCatalog(db),
        retained = await prepare();
      await a.query("update product_suggestions set created_product_id=$1 where id=$2", [
        staff.product,
        retained.proposal,
      ]);
      const retainedJob = await start(retained);
      await b.query("begin");
      await b.query("insert into orders(id,buyer_id,variant_id)values(gen_random_uuid(),$1,$2)", [
        staff.buyer,
        staff.variant,
      ]);
      const retain = assert.rejects(
        purge(retained, retainedJob),
        /financial retention requires explicit handling/,
      );
      await waitLock(b, a.processID);
      await b.query("commit");
      await retain;
      assert.equal(
        (
          await a.query("select count(*)::int n from product_suggestions where id=$1", [
            retained.proposal,
          ])
        ).rows[0].n,
        1,
      );

      // The reverse order commits cleanup first, then allows a new independent
      // transaction against the still-existing staff catalog page.
      const newStaff = await seedCatalog(db),
        earlier = await prepare();
      await a.query("update product_suggestions set merged_product_id=$1 where id=$2", [
        newStaff.product,
        earlier.proposal,
      ]);
      const earlierJob = await start(earlier);
      await a.query("begin");
      assert.equal((await purge(earlier, earlierJob)).rows[0].result.source, "suggestions");
      const order = b.query(
        "insert into orders(id,buyer_id,variant_id)values(gen_random_uuid(),$1,$2)returning id",
        [newStaff.buyer, newStaff.variant],
      );
      await waitLock(a, b.processID);
      await a.query("commit");
      assert.equal((await order).rowCount, 1);
      assert.equal(
        (
          await a.query("select count(*)::int n from product_suggestions where id=$1", [
            earlier.proposal,
          ])
        ).rows[0].n,
        0,
      );
      assert.equal(
        (await a.query("select count(*)::int n from products where id=$1", [newStaff.product]))
          .rows[0].n,
        1,
      );
    }),
);
