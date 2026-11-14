import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import {
  installPrivateRecordSources,
  privateRecordsMigration,
  privateRecordsDatabase,
  privateRecordSources,
} from "./helpers/account-deletion-private-database.mjs";
import { deletionPhotoWriterDatabase } from "./helpers/account-deletion-photo-database.mjs";
import { storageProviderBridge } from "./helpers/account-deletion-storage-provider-database.mjs";
import { createAccountDeletionPrivateRecordErasure } from "../src/lib/account-deletion-private-records.server.ts";
const signal = () => AbortSignal.timeout(15000);
const unavailable = (e) =>
  e.code === "records_unavailable" && e.message === "records_unavailable" && !e.cause;
function adapter(db, after) {
  const bridge = storageProviderBridge(db, after);
  return {
    bridge,
    component: createAccountDeletionPrivateRecordErasure({
      rpc(name, args) {
        return {
          abortSignal(s) {
            return {
              retry(enabled) {
                assert.equal(enabled, false);
                return bridge.rpc(name, args).abortSignal(s);
              },
            };
          },
        };
      },
    }),
  };
}
async function seed(db, user, many = 1) {
  const search = randomUUID(),
    device = randomUUID(),
    notice = randomUUID();
  await db.query(
    "insert into notifications(id,user_id,kind,body) values($1,$2,'security','synthetic private notice')",
    [notice, user],
  );
  await db.query(
    "insert into mobile_push_devices(id,user_id,platform,token) values($1,$2,'ios',$3)",
    [device, user, "synthetic-device-" + randomUUID()],
  );
  await db.query(
    "insert into mobile_push_outbox(notification_id,device_id,user_id) values($1,$2,$3)",
    [notice, device, user],
  );
  await db.query(
    "insert into saved_searches(id,user_id,name,search,email_alerts) values($1,$2,'synthetic search','{\"q\":\"private shopping interest\"}',true)",
    [search, user],
  );
  for (let i = 0; i < many; i++) {
    await db.query(
      "insert into saved_search_matches(id,saved_search_id,listing_id) values($1,$2,$3)",
      [randomUUID(), search, randomUUID()],
    );
    await db.query(
      "insert into mobile_message_receipts(user_id,request_id,input_hash,result) values($1,$2,$3,$4)",
      [
        user,
        randomUUID(),
        new Uint8Array([1, 2, 3]),
        { messageId: randomUUID(), private: "synthetic retry" },
      ],
    );
  }
  await db.query("insert into watchlist(id,user_id,variant_id) values($1,$2,$3)", [
    randomUUID(),
    user,
    randomUUID(),
  ]);
  for (const table of ["saved_partner_homes", "saved_partner_jobs", "saved_partner_vehicles"])
    await db.query(`insert into ${table}(user_id,listing_id,snapshot) values($1,'fixture',$2)`, [
      user,
      { private: "synthetic saved copy" },
    ]);
  await db.query("insert into account_contact_preferences values($1,true,true)", [user]);
  await db.query("insert into account_notification_preferences values($1,true,true)", [user]);
  return { search, device, notice };
}
async function setup({ many = 1, request = false, after } = {}) {
  const db = await privateRecordsDatabase(),
    user = randomUUID(),
    other = randomUUID();
  await db.query("insert into auth.users(id) values($1),($2)", [user, other]);
  const own = await seed(db, user, many),
    foreign = await seed(db, other);
  await db.exec(
    "create table synthetic_financial_retention(id uuid primary key,user_id uuid,amount_cents integer)",
  );
  await db.query("insert into synthetic_financial_retention values($1,$2,12345)", [
    randomUUID(),
    user,
  ]);
  if (request) await db.query("select mobile_request_deletion($1)", [user]);
  else await db.query("insert into account_deletion_jobs(user_id) values($1)", [user]);
  await db.exec("update account_deletion_controls set worker_enabled=true");
  const job = (
    await db.query(
      "update account_deletion_jobs set phase='records',status='processing',lease_token=gen_random_uuid(),lease_until=clock_timestamp()+interval '5 minutes' where user_id=$1 returning *",
      [user],
    )
  ).rows[0];
  return { db, user, other, job, own, foreign, ...adapter(db, after) };
}
const total = async (db) =>
  (
    await db.query(
      `select (${privateRecordSources.map((t) => `(select count(*) from ${t})`).join("+")})::int n`,
    )
  ).rows[0].n;
test("installation refuses an active worker atomically without leaving cleanup functions or contracts", async () => {
  const db = await deletionPhotoWriterDatabase();
  try {
    await installPrivateRecordSources(db, { applyMigration: false });
    await db.exec("update account_deletion_controls set worker_enabled=true");
    await assert.rejects(db.exec(privateRecordsMigration()), /Review disabled worker/);
    await db.exec("rollback");
    const result = (
      await db.query(
        "select to_regclass('public.account_deletion_private_contract') contract,to_regprocedure('public.purge_account_deletion_private_records(uuid,uuid,uuid,text,integer)') cleanup",
      )
    ).rows[0];
    assert.equal(result.contract, null);
    assert.equal(result.cleanup, null);
  } finally {
    await db.close();
  }
});
async function finish(f) {
  const seen = new Set();
  for (let i = 0; i < 100; i++) {
    const before = await total(f.db),
      p = await f.component.step(f.job, signal());
    const after = await total(f.db);
    assert.equal(
      before - after,
      p.deleted,
      "reported bounded work includes every cascading delete",
    );
    assert(p.deleted <= 100);
    assert.equal("done" in p, false);
    if (p.source) seen.add(p.source);
    if (p.passDone) return seen;
  }
  throw Error("synthetic private cleanup did not finish");
}
test("private cleanup erases all twelve scoped sources in bounded child-first batches and preserves the other account and finance", async () => {
  const f = await setup({ many: 203 });
  try {
    const before = await total(f.db),
      first = await f.component.step(f.job, signal());
    assert.equal(first.source, "saved_search_matches");
    assert.equal(first.deleted, 100);
    assert.equal(first.passDone, false);
    assert.equal(before - (await total(f.db)), 100);
    const seen = await finish(f);
    seen.add(first.source);
    assert.deepEqual(seen, new Set(privateRecordSources));
    for (const table of privateRecordSources) {
      const query =
        table === "saved_search_matches"
          ? "select count(*)::int n from saved_search_matches m join saved_searches s on s.id=m.saved_search_id where s.user_id=$1"
          : `select count(*)::int n from ${table} where user_id=$1`;
      assert.equal((await f.db.query(query, [f.user])).rows[0].n, 0, table);
      assert((await f.db.query(query, [f.other])).rows[0].n > 0, table);
    }
    assert.equal(
      (
        await f.db.query(
          "select amount_cents from synthetic_financial_retention where user_id=$1",
          [f.user],
        )
      ).rows[0].amount_cents,
      12345,
    );
    assert.equal((await f.db.query("select count(*)::int n from auth.users")).rows[0].n, 2);
    const replay = await f.component.step(f.job, signal());
    assert.deepEqual(replay, { source: null, deleted: 0, passDone: true });
  } finally {
    await f.db.close();
  }
});
test("ordinary deletion suppression stays operational and late service writes/retries cannot resurrect private records", async () => {
  const f = await setup({ request: true });
  try {
    assert.equal(
      (
        await f.db.query("select count(*)::int n from mobile_push_devices where user_id=$1", [
          f.user,
        ])
      ).rows[0].n,
      0,
    );
    for (const sql of [
      "insert into notifications(id,user_id,kind) values(gen_random_uuid(),$1,'security')",
      "insert into mobile_message_receipts(user_id,request_id,input_hash) values($1,gen_random_uuid(),'fixture'::bytea)",
      "insert into saved_partner_homes(user_id,listing_id,snapshot) values($1,'late','{}')",
      "update account_notification_preferences set marketing_email=true where user_id=$1",
    ])
      await assert.rejects(f.db.query(sql, [f.user]), /Private account records unavailable/);
    await assert.rejects(
      f.db.query(
        "insert into saved_search_matches(id,saved_search_id,listing_id) values(gen_random_uuid(),$1,gen_random_uuid())",
        [f.own.search],
      ),
      /Private account records unavailable/,
    );
    await finish(f);
    await f.db.query("delete from auth.users where id=$1", [f.user]);
    await assert.rejects(
      f.db.query(
        "insert into notifications(id,user_id,kind) values(gen_random_uuid(),$1,'security')",
        [f.user],
      ),
      /Private account records unavailable/,
    );
  } finally {
    await f.db.close();
  }
});
test("phone-token handoff preserves new-account ownership and requires clearing the old account's delivery rows", async () => {
  const db = await privateRecordsDatabase(),
    a = randomUUID(),
    b = randomUUID();
  try {
    await db.query("insert into auth.users(id) values($1),($2)", [a, b]);
    const own = await seed(db, a);
    await assert.rejects(
      db.query("update mobile_push_devices set user_id=$1 where id=$2", [b, own.device]),
      /Private account records unavailable/,
    );
    await db.query("delete from mobile_push_outbox where device_id=$1", [own.device]);
    await db.query("update mobile_push_devices set user_id=$1 where id=$2", [b, own.device]);
    assert.equal(
      (await db.query("select user_id from mobile_push_devices where id=$1", [own.device])).rows[0]
        .user_id,
      b,
    );
    await assert.rejects(
      db.query(
        "insert into mobile_push_outbox(notification_id,device_id,user_id) values($1,$2,$3)",
        [own.notice, own.device, a],
      ),
      /Private account records unavailable/,
    );
    await db.query(
      "update auth.users set banned_until=clock_timestamp()+interval '1 day' where id=$1",
      [b],
    );
    await db.query(
      "insert into notifications(id,user_id,kind) values(gen_random_uuid(),$1,'security')",
      [b],
    );
    await db.query("update account_contact_preferences set allow_email=false where user_id=$1", [
      a,
    ]);
  } finally {
    await db.close();
  }
});

test("pending accounts can suppress an existing push without changing ownership, content or scheduling a new delivery", async () => {
  const f = await setup();
  try {
    await f.db.query(
      "update mobile_push_outbox set status='suppressed',lease_until=null,lease_id=null where user_id=$1",
      [f.user],
    );
    assert.equal(
      (await f.db.query("select status from mobile_push_outbox where user_id=$1", [f.user])).rows[0]
        .status,
      "suppressed",
    );
    await assert.rejects(
      f.db.query("update mobile_push_outbox set status='pending' where user_id=$1", [f.user]),
      /Private account records unavailable/,
    );
    await assert.rejects(
      f.db.query(
        "update mobile_push_outbox set status='suppressed',attempts=attempts+1 where user_id=$1",
        [f.user],
      ),
      /Private account records unavailable/,
    );
    await finish(f);
  } finally {
    await f.db.close();
  }
});
test("verification requires absent identity, does not repair rows, and final completion refuses retained private records", async () => {
  const f = await setup();
  try {
    await f.db.query("update account_deletion_jobs set phase='verification' where id=$1", [
      f.job.id,
    ]);
    f.job.phase = "verification";
    await assert.rejects(
      f.component.verify(f.job, signal()),
      (e) => e.code === "verification_failed",
    );
    await f.db.query("delete from auth.users where id=$1", [f.user]);
    const before = await total(f.db);
    await assert.rejects(
      f.component.verify(f.job, signal()),
      (e) => e.code === "verification_failed",
    );
    assert.equal(await total(f.db), before);
    await assert.rejects(
      f.db.query(
        "update account_deletion_jobs set user_id=null,status='completed',phase='completed',completed_at=clock_timestamp(),lease_token=null,lease_until=null where id=$1",
        [f.job.id],
      ),
      /Private account records remain/,
    );
    await f.db.query("update account_deletion_jobs set phase='identity' where id=$1", [f.job.id]);
    f.job.phase = "identity";
    await finish(f);
    await f.db.query("update account_deletion_jobs set phase='verification' where id=$1", [
      f.job.id,
    ]);
    f.job.phase = "verification";
    assert.equal(await f.component.verify(f.job, signal()), true);
  } finally {
    await f.db.close();
  }
});
test("changed scopes, stale leases, pause switches and unknown cascading relationships stop cleanup before data changes", async () => {
  const f = await setup();
  try {
    const before = await total(f.db);
    for (const patch of [
      { user_id: f.other },
      { lease_token: randomUUID() },
      { phase: "media" },
      { id: randomUUID() },
    ])
      await assert.rejects(f.component.step({ ...f.job, ...patch }, signal()), unavailable);
    await f.db.query(
      "update account_deletion_jobs set lease_until=clock_timestamp()-interval '1 second' where id=$1",
      [f.job.id],
    );
    await assert.rejects(f.component.step(f.job, signal()), unavailable);
    await f.db.query(
      "update account_deletion_jobs set lease_until=clock_timestamp()+interval '5 minutes' where id=$1",
      [f.job.id],
    );
    await f.db.exec("begin isolation level repeatable read");
    await assert.rejects(f.component.step(f.job, signal()), unavailable);
    await f.db.exec("rollback");
    await f.db.exec("update account_deletion_controls set worker_enabled=false");
    await assert.rejects(f.component.step(f.job, signal()), unavailable);
    await f.db.exec("update account_deletion_controls set worker_enabled=true");
    await f.db.exec(
      "create table synthetic_other_member_child(id uuid,user_id uuid,parent uuid references saved_searches(id) on delete cascade)",
    );
    await f.db.query("insert into synthetic_other_member_child values(gen_random_uuid(),$1,$2)", [
      f.other,
      f.own.search,
    ]);
    await f.db.exec("select protect_account_access_boundaries()");
    assert.deepEqual(
      (await f.db.query("select account_access_coverage() coverage")).rows[0].coverage,
      { unguarded_functions: 0, unguarded_tables: 0, helper_privilege_gaps: 0 },
    );
    await assert.rejects(
      f.db.query("select public.purge_account_deletion_private_records($1,$2,$3,'records',100)", [
        f.job.id,
        f.user,
        f.job.lease_token,
      ]),
      /relationships require review/,
    );
    await assert.rejects(f.component.step(f.job, signal()), unavailable);
    assert.equal(await total(f.db), before);
  } finally {
    await f.db.close();
  }
});
test("guard/contract drift cannot be silently accepted and service-role cannot rewrite contract fingerprints", async () => {
  const f = await setup();
  try {
    await f.db.exec(
      "alter table mobile_message_receipts disable trigger guard_account_deletion_private_record",
    );
    await assert.rejects(f.component.step(f.job, signal()), unavailable);
    await f.db.exec(
      "alter table mobile_message_receipts enable trigger guard_account_deletion_private_record",
    );
    await f.db.exec(
      "create or replace function public.account_deletion_private_records_remaining(_user uuid) returns boolean language sql stable security definer set search_path='' as 'select false'",
    );
    await assert.rejects(f.component.step(f.job, signal()), unavailable);
    await f.db.exec("set role service_role");
    await assert.rejects(
      f.db.exec("update account_deletion_private_contract set remaining_md5='forged'"),
      /permission denied/,
    );
    await f.db.exec("reset role");
  } finally {
    await f.db.close();
  }
});
test("lost cleanup acknowledgements retry remaining owned rows without implicit SDK retries or false phase completion", async () => {
  let lost = true;
  const f = await setup({
    many: 203,
    after: async (name) => {
      if (lost && name === "purge_account_deletion_private_records") {
        lost = false;
        throw Error("PRIVATE lost acknowledgement");
      }
    },
  });
  try {
    const before = await total(f.db);
    await assert.rejects(f.component.step(f.job, signal()), unavailable);
    assert.equal(f.bridge.calls.length, 1);
    assert.equal(before - (await total(f.db)), 100);
    await finish(f);
    assert.equal(
      (await f.db.query("select phase from account_deletion_jobs where id=$1", [f.job.id])).rows[0]
        .phase,
      "records",
    );
  } finally {
    await f.db.close();
  }
});

test("preexisting mixed-owner delivery rows and new write hooks require review instead of erasing another account", async () => {
  const f = await setup();
  try {
    await f.db.exec(
      "alter table mobile_push_outbox disable trigger guard_account_deletion_private_record",
    );
    await f.db.query("update mobile_push_outbox set user_id=$1 where device_id=$2", [
      f.other,
      f.own.device,
    ]);
    await f.db.exec(
      "alter table mobile_push_outbox enable trigger guard_account_deletion_private_record",
    );
    const before = await total(f.db);
    await assert.rejects(f.component.step(f.job, signal()), unavailable);
    assert.equal(await total(f.db), before);
    await f.db.exec(
      "alter table mobile_push_outbox disable trigger guard_account_deletion_private_record",
    );
    await f.db.query("update mobile_push_outbox set user_id=$1 where device_id=$2", [
      f.user,
      f.own.device,
    ]);
    await f.db.exec(
      "alter table mobile_push_outbox enable trigger guard_account_deletion_private_record",
    );
    await f.db.exec(
      "create function synthetic_new_hook() returns trigger language plpgsql as $$begin return new;end$$;create trigger z_unreviewed_writer before insert on notifications for each row execute function synthetic_new_hook()",
    );
    await assert.rejects(f.component.step(f.job, signal()), unavailable);
    assert.equal(await total(f.db), before);
  } finally {
    await f.db.close();
  }
});

test("ordinary members cannot invoke private erasure or read its contract", async () => {
  const f = await setup();
  try {
    for (const role of ["anon", "authenticated"]) {
      await f.db.exec(`set role ${role}`);
      await assert.rejects(
        f.db.query("select public.purge_account_deletion_private_records($1,$2,$3,'records',100)", [
          f.job.id,
          f.user,
          f.job.lease_token,
        ]),
        /permission denied/,
      );
      await assert.rejects(
        f.db.query("select * from public.account_deletion_private_contract"),
        /permission denied/,
      );
      await f.db.exec("reset role");
    }
    await f.db.exec("set role service_role");
    assert.equal(
      (
        await f.db.query(
          "select public.purge_account_deletion_private_records($1,$2,$3,'records',100) p",
          [f.job.id, f.user, f.job.lease_token],
        )
      ).rows[0].p.deleted,
      1,
    );
    await f.db.exec("reset role");
  } finally {
    await f.db.close();
  }
});

test("private adapter rejects malformed or forged acknowledgements and cancels before starting an RPC", async () => {
  const job = {
    id: randomUUID(),
    user_id: randomUUID(),
    lease_token: randomUUID(),
    phase: "records",
    lease_until: new Date(Date.now() + 60000).toISOString(),
  };
  let calls = 0,
    value;
  const component = createAccountDeletionPrivateRecordErasure({
    rpc() {
      calls++;
      return {
        abortSignal() {
          return {
            retry(enabled) {
              assert.equal(enabled, false);
              return Promise.resolve({ data: value, error: null });
            },
          };
        },
      };
    },
  });
  for (value of [
    null,
    { source: "unknown", deleted: 1, pass_done: false },
    { source: null, deleted: 0, pass_done: false },
    { source: "watchlist", deleted: 101, pass_done: true },
    { source: "watchlist", deleted: 1, pass_done: true, private: "must not return" },
  ])
    await assert.rejects(component.step(job, signal()), unavailable);
  const controller = new AbortController();
  controller.abort();
  const before = calls;
  await assert.rejects(component.step(job, controller.signal), unavailable);
  assert.equal(calls, before);
});
