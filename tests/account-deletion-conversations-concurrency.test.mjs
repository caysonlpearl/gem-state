import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { setTimeout as pause } from "node:timers/promises";
import { withListingTestPostgres } from "./helpers/postgres-test-cluster.mjs";
import { installDeletionPhotoWriterSchema } from "./helpers/account-deletion-photo-database.mjs";
import { installPrivateRecordSources } from "./helpers/account-deletion-private-database.mjs";
import { conversationDatabase } from "./helpers/account-deletion-conversations-database.mjs";

test(
  "conversation cleanup serializes with moderation reports and rolls back when a waiting lease expires",
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
      await conversationDatabase({ provided: db });
      const prepare = async () => {
        const user = randomUUID(),
          other = randomUUID(),
          conversation = randomUUID();
        await a.query("insert into auth.users(id)values($1),($2)", [user, other]);
        await a.query("insert into profiles(id,display_name)values($1,'Target'),($2,'Other')", [
          user,
          other,
        ]);
        await a.query("insert into conversations(id,buyer_id,seller_id)values($1,$2,$3)", [
          conversation,
          user,
          other,
        ]);
        await a.query(
          "insert into conversation_messages(conversation_id,sender_id,body)select $1,$2,'Synthetic target message' from generate_series(1,105)",
          [conversation, user],
        );
        await a.query(
          "insert into conversation_messages(conversation_id,sender_id,body)values($1,$2,'Synthetic retained message')",
          [conversation, other],
        );
        await a.query("select mobile_request_deletion($1)", [user]);
        await a.query("update account_deletion_controls set worker_enabled=true");
        const job = (
          await a.query(
            "update account_deletion_jobs set phase='records',status='processing',lease_token=gen_random_uuid(),lease_until=clock_timestamp()+interval '5 minutes'where user_id=$1 returning *",
            [user],
          )
        ).rows[0];
        return { user, other, conversation, job };
      };
      const purge = (f) =>
        a.query("select purge_account_deletion_conversations($1,$2,$3,100) result", [
          f.job.id,
          f.user,
          f.job.lease_token,
        ]);
      const report = (f, connection) =>
        connection.query(
          "insert into conversation_reports(conversation_id,reporter_id,reason)values($1,$2,'Synthetic report')",
          [f.conversation, f.other],
        );
      const count = (f) =>
        a.query("select count(*)::int n from conversation_messages where sender_id=$1", [f.user]);
      const waitLock = async (connection, pid) => {
        for (let i = 0; i < 50; i++) {
          if (
            (
              await connection.query("select wait_event_type from pg_stat_activity where pid=$1", [
                pid,
              ])
            ).rows[0]?.wait_event_type === "Lock"
          )
            return;
          await pause(10);
        }
        throw Error("The expected conversation lock was not observed");
      };
      const earlier = await prepare();
      await b.query("begin");
      await report(earlier, b);
      await a.query("begin");
      const earlierRejected = assert.rejects(purge(earlier), /retention/);
      await waitLock(b, a.processID);
      await b.query("commit");
      await earlierRejected;
      await a.query("rollback");
      assert.equal(
        (await count(earlier)).rows[0].n,
        105,
        "A report committed first preserves every target message",
      );
      const later = await prepare();
      await a.query("begin");
      assert.equal((await purge(later)).rows[0].result.changed, 100);
      const pending = report(later, b);
      await waitLock(a, b.processID);
      await a.query("commit");
      await pending;
      await assert.rejects(purge(later), /retention/);
      assert.equal((await count(later)).rows[0].n, 5, "A later report stops all further chunks");
      const expiring = await prepare();
      await b.query("begin");
      await b.query("select id from conversations where id=$1 for update", [expiring.conversation]);
      await a.query(
        "update account_deletion_jobs set lease_until=clock_timestamp()+interval '200 milliseconds'where id=$1",
        [expiring.job.id],
      );
      const expired = assert.rejects(purge(expiring), /Conversation erasure unavailable/);
      await waitLock(b, a.processID);
      await pause(250);
      await b.query("commit");
      await expired;
      assert.equal(
        (await count(expiring)).rows[0].n,
        105,
        "Expired work cannot commit provisional message deletions",
      );
    }),
);
