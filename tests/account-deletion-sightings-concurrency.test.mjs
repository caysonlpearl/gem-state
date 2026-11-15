import test from "node:test";
import assert from "node:assert/strict";
import { setTimeout as pause } from "node:timers/promises";
import { withListingTestPostgres } from "./helpers/postgres-test-cluster.mjs";
import { installDeletionPhotoWriterSchema } from "./helpers/account-deletion-photo-database.mjs";
import { installPrivateRecordSources } from "./helpers/account-deletion-private-database.mjs";
import { sightingsDatabase } from "./helpers/account-deletion-sightings-database.mjs";
import { seedCatalog } from "./helpers/account-deletion-catalog-database.mjs";
import { fixtureMemberSession } from "./helpers/account-deletion-owned-listings-database.mjs";
test(
  "real PostgreSQL serializes report responses, count repair and lease expiry without losing another member's response",
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
      await sightingsDatabase({ provided: db });
      const location = (
        await a.query(
          "insert into locations(id,name)values(gen_random_uuid(),'Synthetic race location')returning id",
        )
      ).rows[0].id;
      const report = async (f) =>
        (
          await a.query(
            "insert into sightings(reporter_id,variant_id,location_id,seen_at,availability,note)values($1,$2,$3,now(),'in_stock','Synthetic source note')returning id",
            [f.seller, f.variant, location],
          )
        ).rows[0].id;
      const respond = async (c, id, user) => {
        await fixtureMemberSession({ query: (s, args) => c.query(s, args) }, user);
        return c.query("select respond_to_sighting($1,'confirm')", [id]);
      };
      const clear = () => a.query("select set_config('request.jwt.claims','{}',false)");
      const start = async (f) => {
        await clear();
        await a.query("select mobile_request_deletion($1)", [f.seller]);
        await a.query("update account_deletion_controls set worker_enabled=true");
        return (
          await a.query(
            "update account_deletion_jobs set phase='records',status='processing',lease_token=gen_random_uuid(),lease_until=clock_timestamp()+interval '5 minutes'where user_id=$1 returning *",
            [f.seller],
          )
        ).rows[0];
      };
      const purge = (f, j) =>
        a.query("select purge_account_deletion_sightings($1,$2,$3,100)r", [
          j.id,
          f.seller,
          j.lease_token,
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
        throw Error("Expected live sighting lock was not observed");
      };
      const owner = await seedCatalog(db),
        responder = await seedCatalog(db),
        id = await report(owner);
      await b.query("begin");
      await respond(b, id, responder.seller);
      const deletion = a.query("select mobile_request_deletion($1)", [responder.seller]);
      await waitLock(b, a.processID);
      await b.query("commit");
      await deletion;
      assert.equal(
        (await a.query("select confirmation_count from sightings where id=$1", [id])).rows[0]
          .confirmation_count,
        1,
      );

      // Deleting a reporter blocks a different, active member's late response.
      const pendingOwner = await seedCatalog(db),
        active = await seedCatalog(db),
        pendingId = await report(pendingOwner);
      await a.query("begin");
      await a.query("select mobile_request_deletion($1)", [pendingOwner.seller]);
      const late = assert.rejects(
        respond(b, pendingId, active.seller),
        /Private account records unavailable/,
      );
      await waitLock(a, b.processID);
      await a.query("commit");
      await late;
      assert.equal(
        (await a.query("select confirmation_count from sightings where id=$1", [pendingId])).rows[0]
          .confirmation_count,
        0,
      );

      // Normal response first, then cleanup: repair sees the committed extra row.
      const source = await seedCatalog(db),
        subject = await seedCatalog(db),
        another = await seedCatalog(db),
        shared = await report(source);
      await respond(a, shared, subject.seller);
      await clear();
      const job = await start(subject);
      await b.query("begin");
      await respond(b, shared, another.seller);
      const waiting = purge(subject, job);
      await waitLock(b, a.processID);
      await b.query("commit");
      assert.equal((await waiting).rows[0].r.changed, 2);
      assert.equal(
        (await a.query("select confirmation_count from sightings where id=$1", [shared])).rows[0]
          .confirmation_count,
        1,
      );

      // Cleanup first, then normal response: parent locking prevents a lost count.
      const source2 = await seedCatalog(db),
        subject2 = await seedCatalog(db),
        another2 = await seedCatalog(db),
        shared2 = await report(source2);
      await respond(a, shared2, subject2.seller);
      await clear();
      const job2 = await start(subject2);
      await a.query("begin");
      assert.equal((await purge(subject2, job2)).rows[0].r.changed, 2);
      const next = respond(b, shared2, another2.seller);
      await waitLock(a, b.processID);
      await a.query("commit");
      await next;
      assert.equal(
        (await a.query("select confirmation_count from sightings where id=$1", [shared2])).rows[0]
          .confirmation_count,
        1,
      );
      assert.equal(
        (
          await a.query("select user_id from sighting_confirmations where sighting_id=$1", [
            shared2,
          ])
        ).rows[0].user_id,
        another2.seller,
      );

      const source3 = await seedCatalog(db),
        subject3 = await seedCatalog(db),
        shared3 = await report(source3);
      await respond(a, shared3, subject3.seller);
      await clear();
      const job3 = await start(subject3);
      await b.query("begin");
      await b.query("select id from sightings where id=$1 for update", [shared3]);
      await a.query(
        "update account_deletion_jobs set lease_until=clock_timestamp()+interval '200 milliseconds'where id=$1",
        [job3.id],
      );
      const expired = assert.rejects(
        purge(subject3, job3),
        /Sighting erasure unavailable|Private account records unavailable/,
      );
      await waitLock(b, a.processID);
      await pause(250);
      await b.query("commit");
      await expired;
      assert.equal(
        (await a.query("select confirmation_count from sightings where id=$1", [shared3])).rows[0]
          .confirmation_count,
        1,
      );
      assert.equal(
        (
          await a.query("select count(*)::int n from sighting_confirmations where sighting_id=$1", [
            shared3,
          ])
        ).rows[0].n,
        1,
      );
      assert.equal(
        (
          await a.query(
            "select nullif(current_setting('bluebird.sighting_cleanup',true),'')context",
          )
        ).rows[0].context,
        null,
      );
    }),
);
