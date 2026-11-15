import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { setTimeout as pause } from "node:timers/promises";
import { withListingTestPostgres } from "./helpers/postgres-test-cluster.mjs";
import { consentErasureDatabase } from "./helpers/account-deletion-consent-erasure-database.mjs";

test(
  "real PostgreSQL orders consent writes, late declines, retained evidence and cleanup against deletion, concurrent workers and lease expiry",
  {
    skip: process.env.BLUEBIRD_DELETION_PG !== "1" ? "Run with BLUEBIRD_DELETION_PG=1" : false,
    timeout: 60000,
  },
  async () =>
    withListingTestPostgres(async (connect) => {
      const a = await connect(),
        b = await connect();
      await consentErasureDatabase({
        provided: { exec: (s) => a.query(s), query: (s, args) => a.query(s, args) },
      });
      const pidA = (await a.query("select pg_backend_pid()pid")).rows[0].pid,
        pidB = (await b.query("select pg_backend_pid()pid")).rows[0].pid;
      const waitLock = async (c, pid) => {
        for (let n = 0; n < 80; n++) {
          if (
            (await c.query("select wait_event_type from pg_stat_activity where pid=$1", [pid]))
              .rows[0]?.wait_event_type === "Lock"
          )
            return;
          await pause(10);
        }
        throw Error("Expected consent lock not observed");
      };
      const member = async () => {
        const id = randomUUID();
        await a.query("insert into auth.users(id,raw_user_meta_data)values($1,$2)", [
          id,
          { shopping_terms_version: "2026-11-12", shopping_alerts: true },
        ]);
        return id;
      };
      const start = async (user) => {
        await a.query("select mobile_request_deletion($1)", [user]);
        await a.query("update account_deletion_controls set worker_enabled=true");
        return (
          await a.query(
            "update account_deletion_jobs set phase='records',status='processing',lease_token=gen_random_uuid(),lease_until=clock_timestamp()+interval '5 minutes'where user_id=$1 returning *",
            [user],
          )
        ).rows[0];
      };
      const purge = (c, j, phase = "records") =>
        c.query("select purge_account_deletion_consents($1,$2,$3,$4,100)r", [
          j.id,
          j.user_id,
          j.lease_token,
          phase,
        ]);
      const drain = async (j) => {
        for (let n = 0; n < 20; n++) if ((await purge(a, j)).rows[0].r.pass_done) return;
        throw Error("Consent drain did not finish");
      };

      const earlier = await member();
      await b.query("begin");
      await b.query("select set_shopping_account($1,true,true,'2026-11-12')", [earlier]);
      const request = a.query("select mobile_request_deletion($1)", [earlier]);
      await waitLock(b, pidA);
      await b.query("commit");
      await request;
      await assert.rejects(
        b.query("select set_shopping_account($1,false,true,'2026-11-12')", [earlier]),
      );
      await b.query("select set_shopping_account($1,false,false,'2026-11-12')", [earlier]);

      const concurrent = await member();
      await a.query(
        "insert into shopping_consents(user_id,subject,purpose,allowed,version)select $1::uuid,'u:'||$1::uuid::text,'personalization',true,'2026-11-12'from generate_series(1,150)",
        [concurrent],
      );
      const cj = await start(concurrent);
      await a.query("begin");
      const first = (await purge(a, cj)).rows[0].r;
      const second = purge(b, cj);
      await waitLock(a, pidB);
      await a.query("commit");
      const next = (await second).rows[0].r;
      assert.equal(first.deleted, 100);
      assert.equal(next.deleted, 55);
      await drain(cj);

      const late = await member(),
        lj = await start(late);
      await drain(lj);
      // This is the real callback's canonical subject/null-FK decline. It holds
      // Auth through commit, but needs a post-identity pass because the FK is null.
      await b.query("begin");
      await b.query(
        "insert into shopping_consents(subject,purpose,allowed,version)values($1,'advertising',false,'2026-11-12')",
        ["u:" + late],
      );
      const removal = a.query("delete from auth.users where id=$1", [late]);
      await waitLock(b, pidA);
      await b.query("commit");
      await removal;
      await a.query("update account_deletion_jobs set phase='identity'where id=$1", [lj.id]);
      assert.equal((await purge(a, lj, "identity")).rows[0].r.deleted, 1);
      await assert.rejects(
        b.query(
          "insert into shopping_consents(subject,purpose,allowed,version)values($1,'advertising',false,'2026-11-12')",
          ["u:" + late],
        ),
      );

      const retained = await member(),
        rj = await start(retained);
      await a.query("begin");
      await a.query("insert into admin_audit_log(actor_id)values($1)", [retained]);
      const held = assert.rejects(
        purge(b, rj),
        /Consent evidence retention requires explicit handling/,
      );
      await waitLock(a, pidB);
      await a.query("commit");
      await held;
      assert.equal(
        (
          await a.query("select count(*)::int n from shopping_accounts where user_id=$1", [
            retained,
          ])
        ).rows[0].n,
        1,
      );

      const retired = await member(),
        tj = await start(retired);
      await a.query("begin");
      await drain(tj);
      const laterReference = assert.rejects(
        b.query("insert into admin_audit_log(actor_id)values($1)", [retired]),
        /Consent evidence has retired/,
      );
      await waitLock(a, pidB);
      await a.query("commit");
      await laterReference;
      const other = await member();
      await b.query("insert into admin_audit_log(actor_id)values($1)", [other]);

      const expired = await member(),
        ej = await start(expired);
      await a.query(
        "update account_deletion_jobs set lease_until=clock_timestamp()+interval '600 milliseconds'where id=$1",
        [ej.id],
      );
      const countBefore = (
        await a.query("select count(*)::int n from shopping_consents where user_id=$1", [expired])
      ).rows[0].n;
      await a.query("begin");
      await a.query("select id from shopping_consents where user_id=$1 for update", [expired]);
      const failed = assert.rejects(purge(b, ej), /Consent erasure unavailable/);
      await waitLock(a, pidB);
      await pause(650);
      await a.query("commit");
      await failed;
      assert.equal(
        (await a.query("select count(*)::int n from shopping_consents where user_id=$1", [expired]))
          .rows[0].n,
        countBefore,
      );
    }),
);
