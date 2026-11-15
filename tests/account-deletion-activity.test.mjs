import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { createAccountDeletionActivityErasure } from "../src/lib/account-deletion-activity.server.ts";
import {
  activityDatabase,
  activityMigration,
} from "./helpers/account-deletion-activity-database.mjs";
import { fixtureMemberSession } from "./helpers/account-deletion-owned-listings-database.mjs";

async function setup(t, { many = 1, install = true } = {}) {
  const db = await activityDatabase({ install });
  t.after(() => db.close());
  const user = randomUUID(),
    other = randomUUID();
  await db.query("insert into auth.users(id)values($1),($2)", [user, other]);
  const seed = async (owner, count) => {
    await db.query(
      `insert into analytics_events(user_id,session_id,name,props,occurred_at)
      select $1,'synthetic-shared-browser','listing_viewed','{"traffic_visit":"synthetic-visit","private_fixture":"owned activity","listing_id":"public-item"}'::jsonb,
      now()-interval '91 days' from generate_series(1,$2::int)`,
      [owner, count],
    );
    if (owner)
      await db.query(
        "insert into rate_limit_events(user_id,action)select $1,'synthetic-action'from generate_series(1,$2::int)",
        [owner, count],
      );
  };
  await seed(user, many);
  await seed(other, 1);
  await seed(null, 1);
  const clear = () => db.exec("select set_config('request.jwt.claims','{}',false)");
  const start = async () => {
    await clear();
    await db.query("select mobile_request_deletion($1)", [user]);
    await db.exec("update account_deletion_controls set worker_enabled=true");
    return (
      await db.query(
        "update account_deletion_jobs set phase='records',status='processing',lease_token=gen_random_uuid(),lease_until=clock_timestamp()+interval '5 minutes'where user_id=$1 returning *",
        [user],
      )
    ).rows[0];
  };
  const step = (job, limit = 100) =>
    db
      .query("select purge_account_deletion_activity($1,$2,$3,$4)r", [
        job.id,
        user,
        job.lease_token,
        limit,
      ])
      .then((r) => r.rows[0].r);
  const count = async (table, owner = user) =>
    (
      await db.query(`select count(*)::int n from ${table} where user_id is not distinct from $1`, [
        owner,
      ])
    ).rows[0].n;
  const snapshot = async () =>
    Object.fromEntries(
      await Promise.all(
        ["analytics_events", "rate_limit_events"].map(async (table) => [
          table,
          (await db.query(`select * from ${table} order by id`)).rows,
        ]),
      ),
    );
  return { db, user, other, start, step, count, seed, clear, snapshot };
}

test("bounded cleanup physically removes the target's full linked events and throttles without guessing ownership from a shared browser", async (t) => {
  const f = await setup(t, { many: 203 });
  const untouched = (await f.snapshot()).analytics_events.filter((r) => r.user_id !== f.user);
  const job = await f.start();
  const receipts = [];
  for (let n = 0; n < 10; n++) {
    const before = await f.snapshot();
    const r = await f.step(job);
    const after = await f.snapshot();
    const physical = Object.keys(before).reduce(
      (sum, k) => sum + before[k].length - after[k].length,
      0,
    );
    assert.equal(r.deleted, physical);
    assert(r.deleted <= 100);
    receipts.push(r);
    if (r.pass_done) break;
  }
  assert.deepEqual(
    receipts.map((r) => r.deleted),
    [100, 100, 3, 100, 100, 3],
  );
  assert.equal(receipts.at(-1).pass_done, true);
  assert.equal(await f.count("analytics_events"), 0);
  assert.equal(await f.count("rate_limit_events"), 0);
  assert.deepEqual((await f.snapshot()).analytics_events, untouched);
  assert.equal(await f.count("rate_limit_events", f.other), 1);
  assert.deepEqual(await f.step(job), { source: null, deleted: 0, pass_done: true });
});

test("real history clearing and throttle limits work for active members; pending members cannot collect or unlink their records", async (t) => {
  const f = await setup(t);
  await fixtureMemberSession(f.db, f.other);
  await f.db.query("select enforce_rate_limit('real-throttle',1,interval '1 hour')");
  await assert.rejects(
    f.db.query("select enforce_rate_limit('real-throttle',1,interval '1 hour')"),
    /reached the limit/,
  );
  await f.db.query("select clear_shopping_history($1)", ["u:" + f.other]);
  assert.equal(await f.count("analytics_events", f.other), 0);
  const cleared = (
    await f.db.query(
      "select * from analytics_events where props->>'private_fixture'='owned activity'and user_id is null and session_id is null",
    )
  ).rows;
  assert.equal(cleared.length, 1);
  assert.equal("traffic_visit" in cleared[0].props, false);
  await assert.rejects(
    f.db.query("update rate_limit_events set user_id=$1 where user_id=$2", [f.user, f.other]),
    /ownership is immutable/,
  );
  const job = await f.start(),
    before = await f.snapshot();
  for (const [sql, args] of [
    ["insert into analytics_events(user_id,name)values($1,'late')", [f.user]],
    ["insert into rate_limit_events(user_id,action)values($1,'late')", [f.user]],
    [
      "update analytics_events set user_id=null,session_id=null,props=props-'traffic_visit'where user_id=$1",
      [f.user],
    ],
  ])
    await assert.rejects(f.db.query(sql, args), /Private account records unavailable/);
  await f.db.query("select clear_shopping_history($1)", ["u:" + f.user]);
  assert.deepEqual(
    await f.snapshot(),
    before,
    "history withdrawal still works without unlinking records that the pending eraser owns",
  );
  await fixtureMemberSession(f.db, f.user);
  await assert.rejects(
    f.db.query("insert into analytics_events(name)values('anonymous-after-request')"),
    /Private account records unavailable/,
  );
  await f.clear();
  assert.deepEqual(await f.snapshot(), before);
  assert.equal((await f.step(job)).source, "analytics_events");
});

test("actual scheduled retention skips pending ownership while continuing 90-day retirement for active and guest activity", async (t) => {
  const f = await setup(t);
  await f.start();
  await f.db.query("select retain_shopping_data()");
  assert.equal(await f.count("analytics_events"), 1);
  assert.equal(await f.count("analytics_events", f.other), 0);
  assert.equal(
    (
      await f.db.query(
        "select count(*)::int n from analytics_events where user_id is null and session_id is null and not(props?'traffic_visit')",
      )
    ).rows[0].n,
    2,
  );
  assert.equal((await f.db.query("select count(*)::int n from analytics_events")).rows[0].n, 3);
  assert.equal(
    (await f.db.query("select account_access_coverage()c")).rows[0].c.unguarded_functions,
    0,
  );
});

test("Auth cannot strand residual linked activity, and independent verification requires actual cleanup and absent Auth", async (t) => {
  const f = await setup(t),
    job = await f.start();
  await assert.rejects(f.db.query("delete from auth.users where id=$1", [f.user]), (e) =>
    ["23503", "23001"].includes(e.code),
  );
  await f.db.query("update account_deletion_jobs set phase='verification'where id=$1", [job.id]);
  const verify = () =>
    f.db.query("select verify_account_deletion_activity($1,$2,$3)r", [
      job.id,
      f.user,
      job.lease_token,
    ]);
  const before = await f.snapshot();
  await assert.rejects(verify());
  assert.deepEqual(await f.snapshot(), before);
  await f.db.query("update account_deletion_jobs set phase='records'where id=$1", [job.id]);
  for (let i = 0; i < 5; i++) if ((await f.step(job)).pass_done) break;
  await f.db.query("delete from auth.users where id=$1", [f.user]);
  await f.db.query("update account_deletion_jobs set phase='verification'where id=$1", [job.id]);
  assert.equal((await verify()).rows[0].r, true);
});

test("source shape, incoming cascades, function ACLs, paused controls and lease drift stop cleanup without partial erasure", async (t) => {
  const f = await setup(t),
    job = await f.start(),
    before = await f.snapshot();
  for (const mutation of [
    "alter table analytics_events disable trigger account_deletion_activity_writer",
    "create table synthetic_new_child(id uuid primary key,event_id uuid references analytics_events(id)on delete cascade)",
    "alter table rate_limit_events add column unexpected_private text",
    "grant execute on function purge_account_deletion_activity(uuid,uuid,uuid,integer)to authenticated",
    "update account_deletion_controls set worker_enabled=false",
    "update account_deletion_jobs set lease_until=clock_timestamp()-interval '1 second'",
  ]) {
    await f.db.exec("begin");
    await f.db.exec(mutation);
    await assert.rejects(f.step(job));
    await f.db.exec("rollback");
    assert.deepEqual(await f.snapshot(), before);
  }
  await f.db.exec("set role authenticated");
  await assert.rejects(f.step(job), (e) => e.code === "42501");
  await f.db.exec("reset role");
  await f.db.exec("set role service_role");
  assert.equal((await f.step(job, 1)).deleted, 1);
  await f.db.exec("reset role");
});

test("installation refuses unexpected callbacks, changed maintenance and unreviewed read permissions", async (t) => {
  for (const mutate of [
    async (db) =>
      db.exec(
        "create function synthetic_unreviewed_completion()returns trigger language plpgsql as $$begin return new;end$$;create trigger synthetic_unreviewed_completion after update on account_deletion_jobs for each row execute function synthetic_unreviewed_completion()",
      ),
    async (db) =>
      db.exec(
        "create or replace function retain_shopping_data()returns void language plpgsql security definer set search_path=public,pg_temp as $$begin null;end$$",
      ),
    async (db) => db.exec("grant select on analytics_events to public"),
    async (db) =>
      db.exec(
        "create policy synthetic_unreviewed_read on analytics_events for select to authenticated using(true)",
      ),
  ]) {
    const db = await activityDatabase({ install: false });
    t.after(() => db.close());
    await mutate(db);
    await assert.rejects(
      db.exec(activityMigration()),
      /Review (disabled activity prerequisites|activity callbacks|activity permissions|activity policies)/,
    );
    await db.exec("rollback");
    assert.equal(
      (
        await db.query(
          "select to_regprocedure('purge_account_deletion_activity(uuid,uuid,uuid,integer)')r",
        )
      ).rows[0].r,
      null,
    );
  }
});

test("the installed SDK performs one attempt after a lost acknowledgment, resumes from remaining rows and sanitizes private errors", async (t) => {
  const f = await setup(t),
    job = await f.start();
  let calls = 0,
    lost = true;
  const client = createClient(
      "https://udxxfuticbxwiehoepeg.supabase.co",
      "sb_secret_synthetic_fixture_only_123456",
      {
        auth: { persistSession: false, autoRefreshToken: false },
        global: {
          fetch: async (input, init) => {
            const req = new Request(input, init),
              name = new URL(req.url).pathname.split("/").at(-1),
              args = await req.json();
            calls++;
            assert(
              ["purge_account_deletion_activity", "verify_account_deletion_activity"].includes(
                name,
              ),
            );
            const value = (
              await f.db.query(
                `select ${name}(${Object.values(args)
                  .map((_, i) => "$" + (i + 1))
                  .join(",")})r`,
                Object.values(args),
              )
            ).rows[0].r;
            if (lost) {
              lost = false;
              throw Error("Private synthetic transport diagnostic");
            }
            return new Response(JSON.stringify(value), {
              headers: { "content-type": "application/json" },
            });
          },
        },
      },
    ),
    component = createAccountDeletionActivityErasure(client),
    signal = () => AbortSignal.timeout(15000);
  await assert.rejects(
    component.step(job, signal()),
    (e) => e.message === "records_unavailable" && e.code === "records_unavailable" && !e.cause,
  );
  assert.equal(calls, 1);
  assert.equal(await f.count("analytics_events"), 0);
  assert.equal((await component.step(job, signal())).passDone, true);
  assert.equal(calls, 2);
  const done = await component.step(job, signal());
  assert.deepEqual(done, { source: null, deleted: 0, passDone: true });
  await assert.rejects(
    component.step({ ...job, user_id: "not-an-account" }, signal()),
    (e) => e.code === "records_unavailable",
  );
  assert.equal(calls, 3);
});
