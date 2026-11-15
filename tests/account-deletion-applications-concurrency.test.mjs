import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { setTimeout as pause } from "node:timers/promises";
import { withListingTestPostgres } from "./helpers/postgres-test-cluster.mjs";
import { installDeletionPhotoWriterSchema } from "./helpers/account-deletion-photo-database.mjs";
import { installPrivateRecordSources } from "./helpers/account-deletion-private-database.mjs";
import {
  applicationDatabase,
  seedListing,
} from "./helpers/account-deletion-owned-listings-database.mjs";
test(
  "application writes serialize with employer/applicant requests and expiring row waits roll back cleanup",
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
      await applicationDatabase({ provided: db });
      const prepare = () => seedListing(db);
      const insert = (c, f) =>
        c.query(
          "insert into job_applications(listing_id,applicant_id,resume_path)values($1,$2,$3)",
          [f.listing, f.buyer, `${f.buyer}/synthetic.pdf`],
        );
      const waitLock = async (c, pid) => {
        for (let i = 0; i < 50; i++) {
          if (
            (await c.query("select wait_event_type from pg_stat_activity where pid=$1", [pid]))
              .rows[0]?.wait_event_type === "Lock"
          )
            return;
          await pause(10);
        }
        throw Error("Expected live application lock was not observed");
      };
      const earlier = await prepare();
      await a.query("begin");
      await insert(a, earlier);
      const request = b.query("select mobile_request_deletion($1)", [earlier.seller]);
      await waitLock(a, b.processID);
      await a.query("commit");
      await request;
      await assert.rejects(
        a.query("update job_applications set cover_letter='late'where listing_id=$1", [
          earlier.listing,
        ]),
        /unavailable/,
      );
      const later = await prepare();
      await a.query("begin");
      await a.query("select mobile_request_deletion($1)", [later.buyer]);
      const rejected = assert.rejects(insert(b, later), /unavailable/);
      await waitLock(a, b.processID);
      await a.query("commit");
      await rejected;
      assert.equal(
        (
          await a.query("select count(*)::int n from job_applications where listing_id=$1", [
            later.listing,
          ])
        ).rows[0].n,
        0,
      );
      const stale = await prepare();
      await insert(a, stale);
      await a.query("select mobile_request_deletion($1)", [stale.buyer]);
      await a.query("update account_deletion_controls set worker_enabled=true");
      const job = (
        await a.query(
          "update account_deletion_jobs set phase='inventory',status='processing',lease_token=gen_random_uuid(),lease_until=clock_timestamp()+interval '5 minutes'where user_id=$1 returning *",
          [stale.buyer],
        )
      ).rows[0];
      for (let i = 0; i < 100; i++) {
        const r = (
          await a.query("select scan_account_deletion_media_inventory($1,$2,$3,50)result", [
            job.id,
            stale.buyer,
            job.lease_token,
          ])
        ).rows[0].result;
        if (r.pass_done) break;
        if (i === 99) throw Error("Synthetic inventory did not finish");
      }
      await a.query("update account_deletion_jobs set phase='records'where id=$1", [job.id]);
      await b.query("begin");
      await b.query("select id from job_applications where applicant_id=$1 for update", [
        stale.buyer,
      ]);
      await a.query(
        "update account_deletion_jobs set lease_until=clock_timestamp()+interval '200 milliseconds'where id=$1",
        [job.id],
      );
      const expired = assert.rejects(
        a.query("select purge_account_deletion_applications($1,$2,$3,100)", [
          job.id,
          stale.buyer,
          job.lease_token,
        ]),
        /(Application erasure|Private account records) unavailable/,
      );
      await waitLock(b, a.processID);
      await pause(250);
      await b.query("commit");
      await expired;
      assert.equal(
        (
          await a.query("select count(*)::int n from job_applications where applicant_id=$1", [
            stale.buyer,
          ])
        ).rows[0].n,
        1,
        "Expired cleanup cannot commit provisional erasure",
      );
    }),
);
