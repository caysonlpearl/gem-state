import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { setTimeout as pause } from "node:timers/promises";
import { withListingTestPostgres } from "./helpers/postgres-test-cluster.mjs";
import { installDeletionPhotoWriterSchema } from "./helpers/account-deletion-photo-database.mjs";
import { installPrivateRecordSources } from "./helpers/account-deletion-private-database.mjs";
import { inquiryDatabase } from "./helpers/account-deletion-inquiries-database.mjs";
test(
  "inquiries serialize on both sides of a deletion request and roll back changes after lease expiry",
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
      await inquiryDatabase({ provided: db });
      const prepare = async () => {
        const buyer = randomUUID(),
          seller = randomUUID(),
          listing = randomUUID();
        await a.query("insert into auth.users(id)values($1),($2)", [buyer, seller]);
        await a.query(
          "insert into profiles(id,display_name)values($1,'Synthetic buyer'),($2,'Synthetic seller')",
          [buyer, seller],
        );
        await a.query("insert into asks(id,seller_id)values($1,$2)", [listing, seller]);
        return { buyer, seller, listing };
      };
      const insert = (c, f) =>
        c.query(
          "insert into listing_inquiries(listing_id,buyer_id,seller_id,buyer_name,buyer_email,message)values($1,$2,$3,'Synthetic','synthetic@example.invalid','Synthetic inquiry')",
          [f.listing, f.buyer, f.seller],
        );
      const waitLock = async (c, pid) => {
        for (let n = 0; n < 50; n++) {
          if (
            (await c.query("select wait_event_type from pg_stat_activity where pid=$1", [pid]))
              .rows[0]?.wait_event_type === "Lock"
          )
            return;
          await pause(10);
        }
        throw Error("Expected live inquiry lock was not observed");
      };
      const earlier = await prepare();
      await a.query("begin");
      await insert(a, earlier);
      const request = b.query("select mobile_request_deletion($1)", [earlier.seller]);
      await waitLock(a, b.processID);
      await a.query("commit");
      await request;
      await assert.rejects(insert(a, earlier), /unavailable/);
      assert.equal(
        (
          await a.query("select count(*)::int n from listing_inquiries where listing_id=$1", [
            earlier.listing,
          ])
        ).rows[0].n,
        1,
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
          await a.query("select count(*)::int n from listing_inquiries where listing_id=$1", [
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
          "update account_deletion_jobs set phase='records',status='processing',lease_token=gen_random_uuid(),lease_until=clock_timestamp()+interval '5 minutes'where user_id=$1 returning *",
          [stale.buyer],
        )
      ).rows[0];
      await b.query("begin");
      await b.query("select id from listing_inquiries where buyer_id=$1 for update", [stale.buyer]);
      await a.query(
        "update account_deletion_jobs set lease_until=clock_timestamp()+interval '200 milliseconds'where id=$1",
        [job.id],
      );
      const expired = assert.rejects(
        a.query("select purge_account_deletion_inquiries($1,$2,$3,100)", [
          job.id,
          stale.buyer,
          job.lease_token,
        ]),
        /(Inquiry erasure|Private account records) unavailable/,
      );
      await waitLock(b, a.processID);
      await pause(250);
      await b.query("commit");
      await expired;
      assert.equal(
        (
          await a.query("select count(*)::int n from listing_inquiries where buyer_id=$1", [
            stale.buyer,
          ])
        ).rows[0].n,
        1,
        "Provisional erasure rolls back after a lease expires during a row wait",
      );
    }),
);
