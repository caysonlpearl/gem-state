import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { setTimeout as pause } from "node:timers/promises";
import { withListingTestPostgres } from "./helpers/postgres-test-cluster.mjs";
import { installDeletionPhotoWriterSchema } from "./helpers/account-deletion-photo-database.mjs";
import { installPrivateRecordSources } from "./helpers/account-deletion-private-database.mjs";
import { activityDatabase } from "./helpers/account-deletion-activity-database.mjs";

test(
  "real PostgreSQL orders collection, history maintenance and concurrent activity cleanup against deletion and lease expiry",
  {
    skip: process.env.BLUEBIRD_DELETION_PG !== "1" ? "Run with BLUEBIRD_DELETION_PG=1" : false,
    timeout: 60000,
  },
  async () =>
    withListingTestPostgres(async (connect) => {
      const a = await connect(),
        b = await connect(),
        db = { exec: (s) => a.query(s), query: (s, args) => a.query(s, args) };
      await installDeletionPhotoWriterSchema(db);
      await installPrivateRecordSources(db);
      await activityDatabase({ provided: db });
      const pidA = (await a.query("select pg_backend_pid()pid")).rows[0].pid,
        pidB = (await b.query("select pg_backend_pid()pid")).rows[0].pid;
      const member = async () => {
        const id = randomUUID();
        await a.query("insert into auth.users(id)values($1)", [id]);
        return id;
      };
      const insert = (c, user, n = 1) =>
        c.query(
          "insert into analytics_events(user_id,session_id,name,props,occurred_at)select $1,'synthetic-browser','listing_viewed','{\"traffic_visit\":\"synthetic-visit\"}'::jsonb,now()-interval '91 days'from generate_series(1,$2::int)",
          [user, n],
        );
      const waitLock = async (c, pid) => {
        for (let i = 0; i < 80; i++) {
          if (
            (await c.query("select wait_event_type from pg_stat_activity where pid=$1", [pid]))
              .rows[0]?.wait_event_type === "Lock"
          )
            return;
          await pause(10);
        }
        throw Error("Expected activity lock was not observed");
      };
      const job = async (user) => {
        await a.query("select mobile_request_deletion($1)", [user]);
        await a.query("update account_deletion_controls set worker_enabled=true");
        return (
          await a.query(
            "update account_deletion_jobs set phase='records',status='processing',lease_token=gen_random_uuid(),lease_until=clock_timestamp()+interval '5 minutes'where user_id=$1 returning *",
            [user],
          )
        ).rows[0];
      };
      const purge = (c, j) =>
        c.query("select purge_account_deletion_activity($1,$2,$3,100)r", [
          j.id,
          j.user_id,
          j.lease_token,
        ]);
      const count = async (user) =>
        (await a.query("select count(*)::int n from analytics_events where user_id=$1", [user]))
          .rows[0].n;

      const earlier = await member();
      await b.query("begin");
      await insert(b, earlier);
      const request = a.query("select mobile_request_deletion($1)", [earlier]);
      await waitLock(b, pidA);
      await b.query("commit");
      await request;
      await assert.rejects(insert(b, earlier), /Private account records unavailable/);
      assert.equal(await count(earlier), 1);

      const retiredFirst = await member();
      await insert(a, retiredFirst);
      await b.query("begin");
      await b.query("select retain_shopping_data()");
      const laterRequest = a.query("select mobile_request_deletion($1)", [retiredFirst]);
      await waitLock(b, pidA);
      await b.query("commit");
      await laterRequest;
      assert.equal(
        await count(retiredFirst),
        0,
        "an earlier active-member retirement commits before deletion is queued",
      );

      const requestedFirst = await member(),
        active = await member();
      await insert(a, requestedFirst);
      await insert(a, active);
      await a.query("begin");
      await a.query("select mobile_request_deletion($1)", [requestedFirst]);
      const maintenance = b.query("select retain_shopping_data()");
      const maintenanceRejected = assert.rejects(
        maintenance,
        /Private account records unavailable/,
      );
      await waitLock(a, pidB);
      await a.query("commit");
      await maintenanceRejected;
      assert.equal(await count(requestedFirst), 1);
      assert.equal(
        await count(active),
        1,
        "a failed maintenance call rolls back every tentative retirement",
      );
      await b.query("select retain_shopping_data()");
      assert.equal(await count(requestedFirst), 1);
      assert.equal(
        await count(active),
        0,
        "the next maintenance pass skips pending members and continues normal retention",
      );

      const concurrent = await member();
      await insert(a, concurrent, 150);
      const concurrentJob = await job(concurrent);
      await a.query("begin");
      const first = (await purge(a, concurrentJob)).rows[0].r;
      const second = purge(b, concurrentJob);
      await waitLock(a, pidB);
      await a.query("commit");
      const next = (await second).rows[0].r;
      assert.equal(first.deleted, 100);
      assert.equal(next.deleted, 50);
      assert.equal(next.pass_done, true);
      assert.equal(await count(concurrent), 0);

      const expiring = await member();
      await insert(a, expiring);
      const expiringJob = await job(expiring);
      await a.query(
        "update account_deletion_jobs set lease_until=clock_timestamp()+interval '600 milliseconds'where id=$1",
        [expiringJob.id],
      );
      await a.query("begin");
      await a.query("select id from analytics_events where user_id=$1 for update", [expiring]);
      const blocked = purge(b, expiringJob),
        expired = assert.rejects(blocked, /Activity erasure unavailable/);
      await waitLock(a, pidB);
      await pause(650);
      await a.query("commit");
      await expired;
      assert.equal(
        await count(expiring),
        1,
        "expiry after the row wait rolls physical deletion back",
      );
    }),
);
