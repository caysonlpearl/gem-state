import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { consentDeletionDatabase } from "./helpers/account-deletion-consent-database.mjs";

test("real opt-out callbacks still finish with both deletion boundaries installed, without discarding pending analytics ownership", async (t) => {
  const db = await consentDeletionDatabase();
  t.after(() => db.close());
  const user = randomUUID(),
    other = randomUUID();
  await db.query("insert into auth.users(id)values($1),($2)", [user, other]);
  for (const id of [user, other]) {
    await db.query("select set_shopping_account($1,true,true,'2026-11-12')", [id]);
    await db.query("select set_shopping_privacy($1,$2,true,true,'2026-11-12')", ["u:" + id, id]);
    await db.query(
      "insert into shopping_events(id,subject,user_id,session_id,kind,listing_id)values(gen_random_uuid(),$1,$2,gen_random_uuid(),'view','public-item')",
      ["u:" + id, id],
    );
    await db.query(
      "insert into analytics_events(user_id,session_id,name,props)values($1,'synthetic-browser','listing_viewed','{\"traffic_visit\":\"synthetic-visit\"}')",
      [id],
    );
  }
  await db.query("select mobile_request_deletion($1)", [user]);
  await db.query("select set_shopping_privacy($1,$2,false,false,'2026-11-12')", [
    "u:" + user,
    user,
  ]);
  const permission = (
    await db.query("select * from shopping_privacy where subject=$1", ["u:" + user])
  ).rows[0];
  assert.equal(permission.personalization, false);
  assert.equal(permission.advertising, false);
  assert.equal(
    (await db.query("select count(*)::int n from shopping_events where user_id=$1", [user])).rows[0]
      .n,
    0,
  );
  assert.equal(
    (await db.query("select count(*)::int n from analytics_events where user_id=$1", [user]))
      .rows[0].n,
    1,
  );
  assert.equal(
    (await db.query("select count(*)::int n from shopping_events where user_id=$1", [other]))
      .rows[0].n,
    1,
  );
  await assert.rejects(
    db.query("select set_shopping_privacy($1,$2,true,true,'2026-11-12')", ["u:" + user, user]),
  );
  assert.equal(
    (await db.query("select personalization from shopping_privacy where subject=$1", ["u:" + user]))
      .rows[0].personalization,
    false,
  );
  assert.deepEqual(
    (
      await db.query(
        "select account_deletion_shopping_barrier_current()shopping,account_deletion_activity_barrier_current()activity,account_access_coverage()coverage",
      )
    ).rows[0],
    {
      shopping: true,
      activity: true,
      coverage: { unguarded_tables: 0, unguarded_functions: 0, helper_privilege_gaps: 0 },
    },
  );
  await db.exec("update account_deletion_controls set worker_enabled=true");
  const job = (
    await db.query(
      "update account_deletion_jobs set phase='records',status='processing',lease_token=gen_random_uuid(),lease_until=clock_timestamp()+interval '5 minutes'where user_id=$1 returning *",
      [user],
    )
  ).rows[0];
  const eraseShopping = () =>
    db.query("select purge_account_deletion_shopping($1,$2,$3,'records',100)r", [
      job.id,
      user,
      job.lease_token,
    ]);
  for (let n = 0; n < 10; n++) if ((await eraseShopping()).rows[0].r.pass_done) break;
  assert.equal(
    (await db.query("select account_deletion_shopping_remaining($1)r", [user])).rows[0].r,
    false,
  );
  for (let n = 0; n < 5; n++)
    if (
      (
        await db.query("select purge_account_deletion_activity($1,$2,$3,100)r", [
          job.id,
          user,
          job.lease_token,
        ])
      ).rows[0].r.pass_done
    )
      break;
  assert.equal(
    (await db.query("select count(*)::int n from analytics_events where user_id=$1", [user]))
      .rows[0].n,
    0,
  );
  await db.query("select set_shopping_privacy($1,$2,false,false,'2026-11-12')", [
    "u:" + user,
    user,
  ]);
  assert.equal(
    (await db.query("select account_deletion_shopping_remaining($1)r", [user])).rows[0].r,
    true,
    "a legitimate late decline must be drained again; an earlier pass is not completion",
  );
  assert.equal(
    (await db.query("select count(*)::int n from analytics_events where user_id=$1", [user]))
      .rows[0].n,
    0,
    "late decline cannot recreate deleted activity",
  );
  for (let n = 0; n < 10; n++) if ((await eraseShopping()).rows[0].r.pass_done) break;
  assert.equal(
    (await db.query("select account_deletion_shopping_remaining($1)r", [user])).rows[0].r,
    false,
  );
});

test("captured signup and onboarding callbacks preserve the two source-specific choices alongside the deletion guards", async (t) => {
  const db = await consentDeletionDatabase();
  t.after(() => db.close());
  const web = randomUUID(),
    mobile = randomUUID();
  await db.query("insert into auth.users(id,raw_user_meta_data)values($1,$2),($3,$4)", [
    web,
    { shopping_terms_version: "2026-11-12", shopping_alerts: true },
    mobile,
    {
      shopping_terms_version: "2026-11-12",
      shopping_signup_source: "mobile",
      shopping_alerts: false,
    },
  ]);
  const account = async (id) =>
    (await db.query("select * from shopping_accounts where user_id=$1", [id])).rows[0];
  assert.equal((await account(web)).mobile_terms_version, null);
  assert.equal((await account(mobile)).mobile_terms_version, "2026-11-12");
  assert.equal((await account(mobile)).mobile_shopping_alerts, false);
  assert.equal(
    (await db.query("select count(*)::int n from shopping_consents where user_id=$1", [mobile]))
      .rows[0].n,
    2,
  );
  assert.equal((await db.query("select count(*)::int n from mobile_ad_consents")).rows[0].n, 0);
  await db.query("select mobile_accept_terms($1,'2026-11-12',false)", [web]);
  assert.equal((await account(web)).mobile_shopping_alerts, false);
  await db.query("select set_shopping_account($1,false,true,'2026-11-12')", [web]);
  assert.equal((await account(web)).mobile_shopping_alerts, false);
  await assert.rejects(db.query("select mobile_accept_terms($1,'old',true)", [web]));
});
