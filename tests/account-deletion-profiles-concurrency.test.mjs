import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { setTimeout as pause } from "node:timers/promises";
import { withListingTestPostgres } from "./helpers/postgres-test-cluster.mjs";
import { installDeletionPhotoWriterSchema } from "./helpers/account-deletion-photo-database.mjs";
import { installPrivateRecordSources } from "./helpers/account-deletion-private-database.mjs";
import { profileDatabase } from "./helpers/account-deletion-profiles-database.mjs";

test(
  "upgrade receipt creation serializes with deletion requests and profile cleanup in both orders",
  {
    skip: process.env.BLUEBIRD_DELETION_PG !== "1" ? "Run with BLUEBIRD_DELETION_PG=1" : false,
    timeout: 60000,
  },
  async () =>
    withListingTestPostgres(async (connect) => {
      const a = await connect(),
        b = await connect();
      const db = { exec: (sql) => a.query(sql), query: (sql, args) => a.query(sql, args) };
      await installDeletionPhotoWriterSchema(db);
      await installPrivateRecordSources(db);
      await profileDatabase({ provided: db });
      const early = randomUUID(),
        late = randomUUID(),
        upgrade = randomUUID();
      const earlyListing = randomUUID(),
        lateListing = randomUUID();
      await a.query("insert into auth.users(id)values($1),($2)", [early, late]);
      await a.query(
        "insert into profiles(id,display_name)values($1,'Early receipt'),($2,'Late receipt')",
        [early, late],
      );
      await a.query("insert into asks(id,seller_id)values($1,$2),($3,$4)", [
        earlyListing,
        early,
        lateListing,
        late,
      ]);
      await a.query("insert into listing_upgrade_catalog(id)values($1)", [upgrade]);
      const start = async (user) => {
        await a.query("select public.mobile_request_deletion($1)", [user]);
        await a.query("update account_deletion_controls set worker_enabled=true");
        return (
          await a.query(
            "update account_deletion_jobs set phase='records',status='processing',lease_token=gen_random_uuid(),lease_until=clock_timestamp()+interval '5 minutes' where user_id=$1 returning *",
            [user],
          )
        ).rows[0];
      };
      const purge = (job) =>
        a.query("select public.purge_account_deletion_profiles($1,$2,$3,'records',100) result", [
          job.id,
          job.user_id,
          job.lease_token,
        ]);
      const insert = (user, listing) =>
        b.query(
          "insert into listing_upgrade_purchases(user_id,listing_id,upgrade_id,amount_cents,status)values($1,$2,$3,1000,'pending')",
          [user, listing, upgrade],
        );
      await b.query("set role service_role");

      await b.query("begin");
      await insert(early, earlyListing);
      let requestDone = false;
      const request = a.query("select public.mobile_request_deletion($1)", [early]);
      request
        .finally(() => {
          requestDone = true;
        })
        .catch(() => {});
      await pause(40);
      assert.equal(requestDone, false, "Deletion waits for the earlier receipt writer");
      await b.query("commit");
      await request;
      const held = await start(early);
      await assert.rejects(purge(held), /financial records/);
      assert.equal(
        (await a.query("select count(*)::int n from profiles where id=$1", [early])).rows[0].n,
        1,
      );
      assert.equal(
        (
          await a.query("select count(*)::int n from listing_upgrade_purchases where user_id=$1", [
            early,
          ])
        ).rows[0].n,
        1,
      );

      const job = await start(late);
      await a.query("begin");
      assert.equal((await purge(job)).rows[0].result.deleted, 1);
      const rejected = assert.rejects(
        insert(late, lateListing),
        /Private account records unavailable/,
      );
      let waited = false;
      for (let i = 0; i < 30; i++) {
        if (
          (
            await a.query("select wait_event_type from pg_stat_activity where pid=$1", [
              b.processID,
            ])
          ).rows[0]?.wait_event_type === "Lock"
        ) {
          waited = true;
          break;
        }
        await pause(10);
      }
      assert(waited, "The later receipt writer waits for cleanup's account lock");
      await a.query("commit");
      await rejected;
      assert.equal(
        (
          await a.query("select count(*)::int n from listing_upgrade_purchases where user_id=$1", [
            late,
          ])
        ).rows[0].n,
        0,
      );
      assert.equal(
        (await a.query("select count(*)::int n from profiles where id=$1", [late])).rows[0].n,
        0,
      );
      assert.equal(
        (
          await a.query("select count(*)::int n from listing_upgrade_purchases where user_id=$1", [
            early,
          ])
        ).rows[0].n,
        1,
        "The earlier member's receipt stays intact",
      );
    }),
);

test(
  "profile cleanup serializes with new financial dependencies, retries and expired leases on real PostgreSQL",
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
      await profileDatabase({ provided: db });
      await a.query("grant all on orders to service_role");
      const [owner, other, last] = [randomUUID(), randomUUID(), randomUUID()];
      await a.query("insert into auth.users(id)values($1),($2),($3)", [owner, other, last]);
      await a.query(
        "insert into profiles(id,display_name)values($1,'Target'),($2,'Other'),($3,'Expiry')",
        [owner, other, last],
      );
      await a.query("insert into seller_profiles(user_id,slug)values($1,'synthetic-seller')", [
        owner,
      ]);
      await a.query("select set_config('parkvault.trusted_operation','on',false)");
      await a.query("insert into shopper_service_profiles(shopper_id)values($1)", [owner]);
      await a.query("select set_config('parkvault.trusted_operation','off',false)");
      const start = async (user) => {
        await a.query("select public.mobile_request_deletion($1)", [user]);
        await a.query("update account_deletion_controls set worker_enabled=true");
        return (
          await a.query(
            "update account_deletion_jobs set phase='records',status='processing',lease_token=gen_random_uuid(),lease_until=clock_timestamp()+interval '5 minutes' where user_id=$1 returning *",
            [user],
          )
        ).rows[0];
      };
      const purge = (c, job) =>
        c.query("select public.purge_account_deletion_profiles($1,$2,$3,'records',100) result", [
          job.id,
          job.user_id,
          job.lease_token,
        ]);
      const waiting = async (pid) => {
        for (let i = 0; i < 30; i++) {
          if (
            (await a.query("select wait_event_type from pg_stat_activity where pid=$1", [pid]))
              .rows[0]?.wait_event_type === "Lock"
          )
            return;
          await pause(10);
        }
        throw Error("The second fixture connection did not wait on the expected lock");
      };
      const job = await start(owner);
      await a.query("begin");
      assert.equal((await purge(a, job)).rows[0].result.deleted, 1);
      await b.query("set role service_role");
      const pendingOrder = b.query("insert into orders(id,buyer_id,seller_id)values($1,$2,$3)", [
        randomUUID(),
        owner,
        other,
      ]);
      const rejectedOrder = assert.rejects(pendingOrder, /Private account records unavailable/);
      await waiting(b.processID);
      await a.query("commit");
      await rejectedOrder;
      assert.equal((await a.query("select count(*)::int n from orders")).rows[0].n, 0);
      assert.equal(
        (await a.query("select count(*)::int n from profiles where id=$1", [other])).rows[0].n,
        1,
      );

      await a.query("begin");
      const original = (await purge(a, job)).rows[0].result;
      const pendingRetry = purge(b, job);
      await waiting(b.processID);
      await a.query("commit");
      assert.equal(original.deleted, 1);
      assert.deepEqual((await pendingRetry).rows[0].result, {
        source: "shopper_service_profiles",
        deleted: 1,
        pass_done: true,
      });
      assert.deepEqual((await purge(b, job)).rows[0].result, {
        source: null,
        deleted: 0,
        pass_done: true,
      });
      assert.notEqual(
        (await b.query("select current_setting('parkvault.trusted_operation',true) flag")).rows[0]
          .flag,
        "on",
        "The cleanup restores the prior trust marker",
      );
      await assert.rejects(
        b.query("insert into profiles(id,display_name)values($1,'Restored')", [owner]),
        /Private account records unavailable/,
      );

      // An order that committed before deletion remains a financial hold. The
      // request waits for the existing writer's member lock, then cannot erase it.
      await b.query("begin");
      await b.query("insert into orders(id,buyer_id,seller_id)values($1,$2,$3)", [
        randomUUID(),
        other,
        last,
      ]);
      const request = a.query("select public.mobile_request_deletion($1)", [other]);
      let done = false;
      request
        .finally(() => {
          done = true;
        })
        .catch(() => {});
      await pause(40);
      assert.equal(done, false);
      await b.query("commit");
      await request;
      const held = (
        await a.query(
          "update account_deletion_jobs set phase='records',status='processing',lease_token=gen_random_uuid(),lease_until=clock_timestamp()+interval '5 minutes' where user_id=$1 returning *",
          [other],
        )
      ).rows[0];
      await assert.rejects(purge(a, held), /financial records/);
      assert.equal((await a.query("select count(*)::int n from orders")).rows[0].n, 1);
      assert.equal(
        (await a.query("select count(*)::int n from profiles where id=$1", [other])).rows[0].n,
        1,
      );

      // Use a fresh nonfinancial member for expiry while the Auth key is locked.
      const fresh = randomUUID();
      await a.query("insert into auth.users(id)values($1)", [fresh]);
      await a.query("insert into profiles(id,display_name)values($1,'Expiry target')", [fresh]);
      const expiring = await start(fresh);
      await b.query("reset role");
      await b.query("begin");
      await b.query("select id from auth.users where id=$1 for key share", [fresh]);
      await a.query(
        "update account_deletion_jobs set lease_until=clock_timestamp()+interval '200 milliseconds'where id=$1",
        [expiring.id],
      );
      const expires = assert.rejects(purge(a, expiring), /Profile erasure unavailable/);
      await pause(250);
      await b.query("commit");
      await expires;
      assert.equal(
        (await a.query("select count(*)::int n from profiles where id=$1", [fresh])).rows[0].n,
        1,
        "Expired work rolls its deletes back",
      );
    }),
);
