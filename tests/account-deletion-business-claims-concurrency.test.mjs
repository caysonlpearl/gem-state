import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { setTimeout as pause } from "node:timers/promises";
import { withListingTestPostgres } from "./helpers/postgres-test-cluster.mjs";
import { businessClaimsDatabase } from "./helpers/account-deletion-business-claims-database.mjs";
import { fixtureMemberSession } from "./helpers/account-deletion-owned-listings-database.mjs";

test(
  "real PostgreSQL serializes approval with deletion, rejects a second business owner and keeps concurrent cleanup bounded",
  {
    skip: process.env.BLUEBIRD_DELETION_PG !== "1" ? "Run with BLUEBIRD_DELETION_PG=1" : false,
    timeout: 60000,
  },
  async () =>
    withListingTestPostgres(async (connect) => {
      const a = await connect(),
        b = await connect();
      await businessClaimsDatabase({
        provided: { exec: (s) => a.query(s), query: (s, args) => a.query(s, args) },
      });
      const pidA = (await a.query("select pg_backend_pid()pid")).rows[0].pid;
      const pidB = (await b.query("select pg_backend_pid()pid")).rows[0].pid;
      async function waitLock(connection, pid) {
        for (let n = 0; n < 80; n++) {
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
        throw Error("Expected claim lock not observed");
      }
      const user = randomUUID(),
        other = randomUUID(),
        admin = randomUUID();
      for (const id of [user, other, admin])
        await a.query("insert into auth.users(id,raw_user_meta_data)values($1,$2)", [
          id,
          { shopping_terms_version: "2026-11-12" },
        ]);
      await a.query("insert into conversation_fixture_operators(user_id)values($1)", [admin]);
      const directory = "fsq-" + randomUUID().replaceAll("-", "").slice(0, 24);
      await a.query(
        "insert into service_directory(id,name,trade,city)values($1,'Synthetic public business','Plumbing','Boise')",
        [directory],
      );
      const claim = async (owner) =>
        (
          await a.query(
            "insert into service_directory_claims(directory_id,user_id,contact,role)values($1,$2,'Synthetic private contact','Manager')returning id",
            [directory, owner],
          )
        ).rows[0].id;
      const owned = await claim(user),
        loser = await claim(other);
      await fixtureMemberSession(a, admin);
      await fixtureMemberSession(b, admin);
      await a.query("begin");
      assert.equal(
        (await a.query("select review_service_directory_claim($1,true)r", [owned])).rows[0].r,
        true,
      );
      const competing = b.query("select review_service_directory_claim($1,true)", [loser]).then(
        () => ({ success: true }),
        (error) => ({ error }),
      );
      await waitLock(a, pidB);
      await a.query("commit");
      assert((await competing).error);
      assert.equal(
        (await a.query("select status from service_directory_claims where id=$1", [loser])).rows[0]
          .status,
        "pending",
      );
      // An ordinary claim write already in flight finishes before deletion locks
      // the account. Once that lock commits, later approvals cannot revive it.
      await a.query("select set_config('request.jwt.claims','{}',false)");
      await b.query("select set_config('request.jwt.claims','{}',false)");
      await b.query("begin");
      await b.query(
        "insert into employer_claims(employer_key,employer_name,user_id,contact,role)values('inflight-employer','Synthetic employer',$1,'Synthetic private contact','Manager')",
        [user],
      );
      const deletion = a.query("select mobile_request_deletion($1)", [user]);
      await waitLock(b, pidA);
      await b.query("commit");
      await deletion;
      await assert.rejects(
        b.query(
          "insert into employer_claims(employer_key,employer_name,user_id,contact,role)values('late-employer','Synthetic employer',$1,'Synthetic private contact','Manager')",
          [user],
        ),
      );
      await a.query("update account_deletion_controls set worker_enabled=true");
      const job = (
        await a.query(
          "update account_deletion_jobs set phase='records',status='processing',lease_token=gen_random_uuid(),lease_until=clock_timestamp()+interval '5 minutes'where user_id=$1 returning *",
          [user],
        )
      ).rows[0];
      const purge = (c) =>
        c.query("select purge_account_deletion_business_claims($1,$2,$3,1)r", [
          job.id,
          user,
          job.lease_token,
        ]);
      await a.query("begin");
      const first = (await purge(a)).rows[0].r;
      const second = purge(b);
      await waitLock(a, pidB);
      await a.query("commit");
      const next = (await second).rows[0].r;
      assert.equal(first.changed, 1);
      assert.equal(next.changed, 1);
      for (let n = 0; n < 10; n++) if ((await purge(a)).rows[0].r.pass_done) break;
      assert.equal(
        (await a.query("select claimed_by from service_directory where id=$1", [directory])).rows[0]
          .claimed_by,
        null,
      );
      assert.equal(
        (
          await a.query("select count(*)::int n from service_directory_claims where user_id=$1", [
            other,
          ])
        ).rows[0].n,
        1,
      );
      assert.equal(
        (await a.query("select count(*)::int n from employer_claims where user_id=$1", [user]))
          .rows[0].n,
        0,
      );
    }),
);
