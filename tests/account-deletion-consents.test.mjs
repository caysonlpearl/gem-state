import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { createAccountDeletionConsentErasure } from "../src/lib/account-deletion-consents.server.ts";
import {
  consentErasureDatabase,
  consentErasureMigration,
} from "./helpers/account-deletion-consent-erasure-database.mjs";

import { installPaymentCallback } from "./helpers/account-deletion-payment-database.mjs";
import { seedCatalog } from "./helpers/account-deletion-catalog-database.mjs";

const tables = ["shopping_accounts", "shopping_consents", "mobile_ad_consents"];
async function fixture(t, { many = 0, install = true } = {}) {
  const db = await consentErasureDatabase({ install });
  t.after(() => db.close());
  const user = randomUUID(),
    other = randomUUID(),
    guest = "g:" + randomUUID();
  for (const id of [user, other]) {
    await db.query("insert into auth.users(id,raw_user_meta_data)values($1,$2)", [
      id,
      { shopping_terms_version: "2026-11-12", shopping_alerts: true },
    ]);
    await db.query("select mobile_accept_terms($1,'2026-11-12',true)", [id]);
    await db.query(
      "insert into mobile_ad_consents(user_id,platform,advertising,att)values($1,'ios',true,'authorized'),($1,'android',true,'not_applicable')",
      [id],
    );
  }
  if (many)
    await db.query(
      "insert into shopping_consents(user_id,subject,purpose,allowed,version)select $1::uuid,'u:'||$1::uuid::text,'personalization',true,'2026-11-12'from generate_series(1,$2::int)",
      [user, many],
    );
  await db.query(
    "insert into shopping_consents(subject,purpose,allowed,version)values($1,'personalization',false,'2026-11-12')",
    [guest],
  );
  const snapshot = async () =>
    Object.fromEntries(
      await Promise.all(
        tables.map(async (table) => [
          table,
          (
            await db.query(
              `select * from ${table} order by ${table === "shopping_consents" ? "id" : table === "mobile_ad_consents" ? "user_id,platform" : "user_id"}`,
            )
          ).rows,
        ]),
      ),
    );
  const start = async () => {
    await db.query("select mobile_request_deletion($1)", [user]);
    await db.exec("update account_deletion_controls set worker_enabled=true");
    return (
      await db.query(
        "update account_deletion_jobs set status='processing',phase='records',lease_token=gen_random_uuid(),lease_until=clock_timestamp()+interval '5 minutes'where user_id=$1 returning *",
        [user],
      )
    ).rows[0];
  };
  const step = (job, limit = 100, phase = "records") =>
    db
      .query("select purge_account_deletion_consents($1,$2,$3,$4,$5)r", [
        job.id,
        user,
        job.lease_token,
        phase,
        limit,
      ])
      .then((r) => r.rows[0].r);
  const drain = async (job) => {
    for (let n = 0; n < 30; n++) if ((await step(job)).pass_done) return;
    throw Error("Consent drain did not finish");
  };
  return { db, user, other, guest, snapshot, start, step, drain };
}
test("bounded consent cleanup erases full owned records, preserves another account/guest and requires an absent identity for independent verification", async (t) => {
  const f = await fixture(t, { many: 203 }),
    job = await f.start();
  for (const role of ["anon", "authenticated"]) {
    await f.db.exec(`set role ${role}`);
    try {
      await assert.rejects(f.step(job), (e) => e.code === "42501");
    } finally {
      await f.db.exec("reset role");
    }
  }
  const before = await f.snapshot(),
    untouched = Object.fromEntries(
      tables.map((k) => [k, before[k].filter((r) => r.user_id !== f.user)]),
    );
  // Historical canonical account subjects can have a null FK. They remain
  // directly attributable by that exact subject, never by a browser guess.
  await f.db.query(
    "insert into shopping_consents(subject,purpose,allowed,version)values($1,'personalization',false,'2026-11-12')",
    ["u:" + f.user],
  );
  await assert.rejects(f.db.query("delete from auth.users where id=$1", [f.user]), (e) =>
    ["23503", "23001"].includes(e.code),
  );
  let total = 0;
  for (let n = 0; n < 20; n++) {
    const old = await f.snapshot(),
      r = await f.step(job),
      next = await f.snapshot();
    assert.equal(
      r.deleted,
      tables.reduce((sum, k) => sum + old[k].length - next[k].length, 0),
    );
    assert(r.deleted <= 100);
    total += r.deleted;
    if (r.pass_done) break;
  }
  assert(total > 203);
  assert.deepEqual(await f.snapshot(), untouched);
  assert.deepEqual(await f.step(job), { source: null, deleted: 0, pass_done: true });
  await f.db.query("update account_deletion_jobs set phase='verification'where id=$1", [job.id]);
  const verify = () =>
    f.db.query("select verify_account_deletion_consents($1,$2,$3)r", [
      job.id,
      f.user,
      job.lease_token,
    ]);
  await assert.rejects(verify());
  // Deletion itself created only a negative preference in the six-shopping
  // component; its separate post-identity drain remains required.
  await f.db.query("delete from auth.users where id=$1", [f.user]);
  const verifiedBefore = await f.snapshot();
  assert.equal((await verify()).rows[0].r, true);
  assert.deepEqual(await f.snapshot(), verifiedBefore);
});
test("real pending opt-outs remain effective but cannot re-enable alerts/tracking, replace terms, rotate ownership or recreate data after Auth removal", async (t) => {
  const f = await fixture(t),
    job = await f.start();
  const terms = (
    await f.db.query(
      "select terms_version,terms_accepted_at,mobile_terms_version,mobile_terms_accepted_at from shopping_accounts where user_id=$1",
      [f.user],
    )
  ).rows[0];
  await f.db.query("select set_shopping_account($1,false,false,'2026-11-12')", [f.user]);
  await f.db.query("select set_shopping_privacy($1,$2,false,false,'2026-11-12')", [
    "u:" + f.user,
    f.user,
  ]);
  await f.db.query(
    "update mobile_ad_consents set advertising=false,att='denied',updated_at=now()where user_id=$1",
    [f.user],
  );
  assert.deepEqual(
    (
      await f.db.query(
        "select terms_version,terms_accepted_at,mobile_terms_version,mobile_terms_accepted_at from shopping_accounts where user_id=$1",
        [f.user],
      )
    ).rows[0],
    terms,
  );
  for (const [sql, args] of [
    ["select set_shopping_account($1,false,true,'2026-11-12')", [f.user]],
    ["select mobile_accept_terms($1,'2026-11-12',false)", [f.user]],
    ["update shopping_accounts set terms_version='replacement'where user_id=$1", [f.user]],
    ["update shopping_accounts set suppressed_at=null where user_id=$1", [f.user]],
    ["update mobile_ad_consents set advertising=true where user_id=$1", [f.user]],
    [
      "insert into shopping_consents(user_id,subject,purpose,allowed,version)values($1,$2,'advertising',false,'2026-11-12')",
      [f.user, "u:" + f.other],
    ],
    ["update shopping_consents set allowed=false where user_id=$1 and allowed", [f.other]],
  ])
    await assert.rejects(f.db.query(sql, args));
  assert.deepEqual(
    (
      await f.db.query(
        "select account_deletion_consent_barrier_current()consent,account_deletion_activity_barrier_current()activity,account_deletion_shopping_barrier_current()shopping,account_access_coverage()coverage",
      )
    ).rows[0],
    {
      consent: true,
      activity: true,
      shopping: true,
      coverage: { unguarded_functions: 0, unguarded_tables: 0, helper_privilege_gaps: 0 },
    },
  );
  await f.drain(job);
  await f.db.query("select set_shopping_account($1,false,false,'2026-11-12')", [f.user]);
  assert.equal(
    (await f.db.query("select account_deletion_consent_remaining($1)r", [f.user])).rows[0].r,
    true,
  );
  await assert.rejects(f.db.query("delete from auth.users where id=$1", [f.user]), (e) =>
    ["23503", "23001"].includes(e.code),
  );
  await f.drain(job);
  await f.db.query("delete from auth.users where id=$1", [f.user]);
  await assert.rejects(
    f.db.query("select set_shopping_account($1,false,false,'2026-11-12')", [f.user]),
  );
  await assert.rejects(
    f.db.query(
      "insert into shopping_consents(subject,purpose,allowed,version)values($1,'advertising',false,'2026-11-12')",
      ["u:" + f.user],
    ),
  );
});
test("related claim/audit evidence holds terms without partial erasure and without changing a retained record", async (t) => {
  const f = await fixture(t),
    record = randomUUID();
  await f.db.query("insert into admin_audit_log(id,actor_id)values($1,$2)", [record, f.user]);
  const job = await f.start(),
    before = await f.snapshot(),
    audit = (await f.db.query("select * from admin_audit_log")).rows;
  await assert.rejects(f.step(job), /Consent evidence retention requires explicit handling/);
  assert.deepEqual(await f.snapshot(), before);
  assert.deepEqual((await f.db.query("select * from admin_audit_log")).rows, audit);
  // Another account's evidence alone does not justify retaining this member.
  await f.db.query("update admin_audit_log set actor_id=$1 where id=$2", [f.other, record]);
  await f.drain(job);
  assert.deepEqual(
    (await f.db.query("select actor_id from admin_audit_log where id=$1", [record])).rows,
    [{ actor_id: f.other }],
  );
});
test("anonymous maintenance retires genuine guest consent while preserving historical account-subject terms evidence and permits a post-identity bounded pass", async (t) => {
  const f = await fixture(t);
  await f.db.query(
    "insert into shopping_consents(subject,purpose,allowed,version,recorded_at)values($1,'terms',true,'2026-11-12',now()-interval '91 days'),($2,'personalization',false,'2026-11-12',now()-interval '91 days')",
    ["u:" + f.user, f.guest],
  );
  await f.db.query("select retain_shopping_data()");
  assert.equal(
    (
      await f.db.query(
        "select count(*)::int n from shopping_consents where subject=$1 and user_id is null",
        ["u:" + f.user],
      )
    ).rows[0].n,
    1,
  );
  assert.equal(
    (
      await f.db.query(
        "select count(*)::int n from shopping_consents where subject=$1 and recorded_at<now()-interval '90 days'",
        [f.guest],
      )
    ).rows[0].n,
    0,
  );
  const job = await f.start();
  await f.drain(job);
  await f.db.exec("alter table shopping_consents disable trigger account_deletion_consent_writer");
  await f.db.query(
    "insert into shopping_consents(subject,purpose,allowed,version)values($1,'advertising',false,'2026-11-12')",
    ["u:" + f.user],
  );
  await f.db.exec("alter table shopping_consents enable trigger account_deletion_consent_writer");
  await f.db.query("delete from auth.users where id=$1", [f.user]);
  await f.db.query("update account_deletion_jobs set phase='identity'where id=$1", [job.id]);
  assert.equal((await f.step(job, 100, "identity")).deleted, 1);
});
test("schema/permission drift, expired leases and contradictory historical owners refuse removal; installer does not adopt unknown hooks", async (t) => {
  const f = await fixture(t),
    job = await f.start(),
    before = await f.snapshot();
  for (const sql of [
    "alter table shopping_consents disable trigger account_deletion_consent_writer",
    "create table unexpected_consent_child(id uuid references shopping_consents(id)on delete cascade)",
    "grant execute on function guard_account_deletion_consent_writer()to authenticated",
    "alter table editorial_audit_events drop column actor_user_id",
    "update account_deletion_controls set worker_enabled=false",
    "update account_deletion_jobs set lease_until=now()-interval '1 second'",
  ]) {
    await f.db.exec("begin");
    await f.db.exec(sql);
    await assert.rejects(f.step(job));
    await f.db.exec("rollback");
    assert.deepEqual(await f.snapshot(), before);
  }
  await f.db.exec("alter table shopping_consents disable trigger account_deletion_consent_writer");
  await f.db.query(
    "insert into shopping_consents(user_id,subject,purpose,allowed,version)values($1,$2,'terms',true,'2026-11-12')",
    [f.user, "u:" + f.other],
  );
  await f.db.exec("alter table shopping_consents enable trigger account_deletion_consent_writer");
  await assert.rejects(f.step(job), /ownership requires review/);
  const uninstalled = await fixture(t, { install: false });
  await uninstalled.db.exec(
    "create function unknown_consent_completion()returns trigger language plpgsql as $$begin return new;end$$;create trigger unknown_consent_completion after update on account_deletion_jobs for each row execute function unknown_consent_completion()",
  );
  await assert.rejects(uninstalled.db.exec(consentErasureMigration()), /prerequisites/);
});
test("real SDK disables automatic retries after a lost acknowledgment; explicit retry drains only remaining work and sanitizes errors", async (t) => {
  const f = await fixture(t, { many: 103 }),
    job = await f.start();
  let calls = 0;
  const requests = [];
  const db = createClient("https://synthetic.supabase.co", "synthetic-key", {
    global: {
      fetch: async (url, options) => {
        calls++;
        const body = JSON.parse(options.body);
        requests.push({ url, body });
        const receipt = (
          await f.db.query("select purge_account_deletion_consents($1,$2,$3,$4,$5)r", [
            body._id,
            body._user,
            body._lease,
            body._phase,
            body._limit,
          ])
        ).rows[0].r;
        if (calls === 1) throw Error("private provider failure");
        return new Response(JSON.stringify(receipt), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      },
    },
  });
  const adapter = createAccountDeletionConsentErasure(db);
  await assert.rejects(
    adapter.step(job, new AbortController().signal),
    (e) => e.code === "records_unavailable" && !e.message.includes("private"),
  );
  assert.equal(calls, 1);
  assert.equal(requests[0].body._phase, "records");
  assert.equal(
    (await f.db.query("select count(*)::int n from shopping_consents where user_id=$1", [f.user]))
      .rows[0].n,
    10,
  );
  const next = await adapter.step(job, new AbortController().signal);
  assert.equal(calls, 2);
  assert.equal(next.deleted, 10);
  assert.equal(next.passDone, false);
  await f.drain(job);
  const fake = {
    rpc: () => ({
      abortSignal() {
        return this;
      },
      retry(value) {
        assert.equal(value, false);
        return Promise.resolve({
          error: null,
          data: { source: "shopping_consents", deleted: 101, pass_done: true },
        });
      },
    }),
  };
  await assert.rejects(
    createAccountDeletionConsentErasure(fake).step(job, new AbortController().signal),
    (e) => e.code === "records_unavailable",
  );
});

for (const role of ["buyer", "seller"])
  test(`captured payment finalizer and replay keep working with the new evidence guards during ${role} deletion`, async (t) => {
    const db = await consentErasureDatabase();
    t.after(() => db.close());
    await installPaymentCallback(db);
    const f = await seedCatalog(db),
      order = randomUUID(),
      listing = randomUUID();
    for (const user of [f.buyer, f.seller])
      if (!(role === "buyer" && user === f.buyer))
        await db.query("select set_shopping_account($1,true,true,'2026-11-12')", [user]);
    await db.exec(
      "create table if not exists shopping_controls(id boolean primary key default true,tracking boolean default false);insert into shopping_controls(tracking)values(true)",
    );
    await db.query("select set_shopping_privacy($1,$2,true,false,'2026-11-12')", [
      "u:" + f.buyer,
      f.buyer,
    ]);
    await db.exec("select set_config('parkvault.trusted_operation','on',false)");
    await db.query(
      "insert into asks(id,product_id,variant_id,seller_id,price_cents)values($1,$2,$3,$4,10000)",
      [listing, f.product, f.variant, f.seller],
    );
    const fee = (await db.query("select id from fee_schedules limit 1")).rows[0].id;
    await db.query(
      "insert into orders(id,buyer_id,seller_id,product_id,variant_id,origin,status,merchandise_cents,buyer_fee_cents,seller_fee_cents,total_cents,payout_cents,fee_schedule_id,fee_snapshot,ask_id)values($1,$2,$3,$4,$5,'buy_now','awaiting_payment',10000,1000,500,11000,9500,$6,'{}',$7)",
      [order, f.buyer, f.seller, f.product, f.variant, fee, listing],
    );
    await db.query("update asks set status='matched',matched_order_id=$1 where id=$2", [
      order,
      listing,
    ]);
    await db.query("select mobile_request_deletion($1)", [f[role]]);
    for (let n = 0; n < 2; n++)
      await db.query(
        "select finalize_stripe_order_payment($1,'cs_synthetic','pi_synthetic','ch_synthetic',11000,0,'succeeded',null)",
        [order],
      );
    assert.deepEqual(
      (
        await db.query(
          "select status,payment_authorized,stripe_payment_intent_id from orders where id=$1",
          [order],
        )
      ).rows[0],
      {
        status: "payment_captured",
        payment_authorized: true,
        stripe_payment_intent_id: "pi_synthetic",
      },
    );
    for (const table of ["order_payments", "order_payouts", "order_events"])
      assert.equal(
        (await db.query(`select count(*)::int n from ${table} where order_id=$1`, [order])).rows[0]
          .n,
        1,
      );
    assert.equal(
      (await db.query("select count(*)::int n from notifications where user_id=$1", [f[role]]))
        .rows[0].n,
      0,
    );
    assert.equal(
      (await db.query("select count(*)::int n from shopping_events where user_id=$1", [f.buyer]))
        .rows[0].n,
      role === "buyer" ? 0 : 1,
    );
    assert.equal(
      (await db.query("select account_deletion_consent_barrier_current()r")).rows[0].r,
      true,
    );
    assert.equal(
      (await db.query("select worker_enabled from account_deletion_controls")).rows[0]
        .worker_enabled,
      false,
    );
  });
