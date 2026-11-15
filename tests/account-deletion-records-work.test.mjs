import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { recordsWorkFixture as fixture } from "./helpers/account-deletion-records-work-database.mjs";

test("actual records work drains bounded real SQL components through the durable queue and advances only to identity", async (t) => {
  const f = await fixture(t);
  const { result, lastFailure } = await f.drain();
  assert.equal(result.status, "advanced", JSON.stringify(lastFailure));
  const job = (await f.db.query("select * from account_deletion_jobs where id=$1", [f.job.id]))
    .rows[0];
  assert.equal(job.phase, "identity");
  assert.notEqual(job.status, "completed");
  assert.equal(
    (await f.db.query("select count(*)::int n from auth.users where id=$1", [f.user])).rows[0].n,
    1,
  );
  for (const table of ["watchlist", "employer_claims", "shopping_choices"])
    assert.equal(
      (await f.db.query(`select count(*)::int n from ${table} where user_id=$1`, [f.user])).rows[0]
        .n,
      0,
    );
  assert.equal(
    (await f.db.query("select count(*)::int n from profiles where id=$1", [f.user])).rows[0].n,
    0,
  );
  assert.equal(
    (
      await f.db.query("select count(*)::int n from mobile_account_deletions where user_id=$1", [
        f.user,
      ])
    ).rows[0].n,
    1,
  );
  assert.equal(
    (
      await f.db.query("select count(*)::int n from order_payments where recorded_by=$1", [
        f.f.f.buyer,
      ])
    ).rows[0].n,
    1,
    "Another account is preserved",
  );
  assert(f.calls.some((c) => c.name === "inspect_account_deletion_auth_dependencies"));
  const verification = (
    await f.db.query(
      "update account_deletion_jobs set phase='verification',status='processing',lease_token=gen_random_uuid(),lease_until=clock_timestamp()+interval '5 minutes' where id=$1 returning *",
      [f.job.id],
    )
  ).rows[0];
  await assert.rejects(
    f.records.verify(verification, AbortSignal.timeout(40000)),
    (e) => e.code === "verification_failed",
  );
  // This explicit removal is confined to the disposable fixture. The records
  // adapter itself must never remove Auth or mark the entire job completed.
  await f.db.query("update account_deletion_jobs set phase='identity' where id=$1", [f.job.id]);
  await f.db.query("delete from auth.users where id=$1", [f.user]);
  await f.db.query("update account_deletion_jobs set phase='verification' where id=$1", [f.job.id]);
  assert.equal(await f.records.verify(verification, AbortSignal.timeout(40000)), true);
  assert.notEqual(
    (await f.db.query("select status from account_deletion_jobs where id=$1", [f.job.id])).rows[0]
      .status,
    "completed",
  );
});

test("a lost committed shopping response performs one SDK request, keeps durable retry state and resumes from remaining rows", async (t) => {
  const f = await fixture(t);
  f.loseAck();
  assert.equal((await f.run()).status, "retry");
  assert.equal(f.calls.filter((c) => c.name === "purge_account_deletion_shopping").length, 1);
  assert.equal(
    (
      await f.db.query("select count(*)::int n from shopping_privacy where subject=$1", [
        "u:" + f.user,
      ])
    ).rows[0].n,
    0,
    "The committed privacy-row removal is not rolled back by a lost HTTP response",
  );
  assert.equal(
    (await f.db.query("select count(*)::int n from order_payments where recorded_by=$1", [f.user]))
      .rows[0].n,
    203,
    "No later component ran after the lost response",
  );
  const row = (
    await f.db.query("select status,last_error_code from account_deletion_jobs where id=$1", [
      f.job.id,
    ])
  ).rows[0];
  assert.deepEqual(row, { status: "retry", last_error_code: "records_unavailable" });
  await f.db.query("update account_deletion_jobs set available_at=clock_timestamp()where id=$1", [
    f.job.id,
  ]);
  assert.equal((await f.drain()).result.status, "advanced");
});

test("a lost claim response cannot automatically reserve a second account through SDK retries", async (t) => {
  const f = await fixture(t),
    other = randomUUID();
  await f.db.query("insert into auth.users(id)values($1)", [other]);
  await f.db.query("select mobile_request_deletion($1)", [other]);
  f.loseAck("claim_account_deletion");
  await assert.rejects(
    f.queue.claim(),
    (e) => e.code === "worker_failed" && e.message === "worker_failed" && !e.cause,
  );
  assert.equal(f.calls.filter((c) => c.name === "claim_account_deletion").length, 1);
  assert.equal(
    (await f.db.query("select status from account_deletion_jobs where id=$1", [f.job.id])).rows[0]
      .status,
    "processing",
  );
  assert.equal(
    (await f.db.query("select status from account_deletion_jobs where user_id=$1", [other])).rows[0]
      .status,
    "requested",
  );
});

test("an unhandled Auth-linked audit record prevents records advancement and is never cascaded away", async (t) => {
  const f = await fixture(t, { unknown: true });
  const value = await f.drain();
  assert.equal(value.result.status, "retry");
  assert.equal(
    (await f.db.query("select phase from account_deletion_jobs where id=$1", [f.job.id])).rows[0]
      .phase,
    "records",
  );
  assert.equal(
    (
      await f.db.query("select count(*)::int n from unhandled_account_records where user_id=$1", [
        f.user,
      ])
    ).rows[0].n,
    1,
  );
});

test("financial references retain their evidence and prevent phase advancement without a retention decision", async (t) => {
  const f = await fixture(t, { financial: true });
  const before = (
    await f.db.query("select id,total_cents,status from orders where buyer_id=$1 order by id", [
      f.user,
    ])
  ).rows;
  assert.equal((await f.drain()).result.status, "retry");
  assert.deepEqual(
    (
      await f.db.query("select id,total_cents,status from orders where buyer_id=$1 order by id", [
        f.user,
      ])
    ).rows,
    before,
  );
  assert.equal(
    (await f.db.query("select phase from account_deletion_jobs where id=$1", [f.job.id])).rows[0]
      .phase,
    "records",
  );
});
