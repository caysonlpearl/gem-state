import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { deletionDatabase } from "./helpers/account-deletion-database.mjs";
import {
  runAccountDeletion,
  deletionPhases,
  DeletionStepError,
} from "../src/lib/account-deletion-worker.ts";
const row = async (db, sql, args = []) => (await db.query(sql, args)).rows[0];
const claim = async (db) => row(db, "select * from claim_account_deletion()");
const advance = (db, job, done = true, phase = job.phase) =>
  row(db, "select advance_account_deletion($1,$2,$3,$4) ok", [
    job.id,
    job.lease_token,
    phase,
    done,
  ]);
const retry = (db, job, code = "media_unavailable") =>
  row(db, "select retry_account_deletion($1,$2,$3,$4) ok", [
    job.id,
    job.lease_token,
    job.phase,
    code,
  ]);

test("deletion requests atomically withdraw web/native shopping and advertising without suppressing another account", async () => {
  const db = await deletionDatabase();
  try {
    const a = randomUUID(),
      b = randomUUID();
    for (const u of [a, b]) {
      await db.query("insert into auth.users values($1)", [u]);
      await db.query("select mobile_accept_terms($1,'2026-11-12',true)", [u]);
      await db.query("insert into shopping_privacy values($1,true,true,now(),now())", ["u:" + u]);
      await db.query("insert into shopping_queue values($1,'processing',now(),true)", [u]);
      await db.query("insert into shopping_deliveries values($1,'processing',now())", [u]);
      await db.query("insert into shopping_ad_outbox values($1,$2,'pending')", [u, "u:" + u]);
      await db.query(
        "insert into mobile_ad_consents(user_id,advertising,att,platform)values($1,true,'authorized','ios')",
        [u],
      );
      await db.query("select mobile_register_device($1,$2,'ios')", [u, "synthetic-device-" + u]);
    }
    await db.query("select mobile_request_deletion($1)", [a]);
    await db.query("select mobile_request_deletion($1)", [a]);
    assert.equal((await row(db, "select count(*)::int n from account_deletion_jobs")).n, 1);
    assert.equal(
      (
        await row(
          db,
          "select count(*)::int n from shopping_consents where user_id=$1 and source='account_deletion' and not allowed",
          [a],
        )
      ).n,
      3,
    );
    const choice = await row(db, "select * from shopping_privacy where subject=$1", ["u:" + a]);
    assert.equal(choice.personalization, false);
    assert.equal(choice.advertising, false);
    assert.equal(
      (await row(db, "select * from shopping_accounts where user_id=$1", [a])).delivery_blocked,
      true,
    );
    for (const t of ["shopping_queue", "shopping_deliveries", "shopping_ad_outbox"]) {
      assert.equal(
        (await row(db, `select status from ${t} where user_id=$1`, [a])).status,
        "suppressed",
      );
      assert.notEqual(
        (await row(db, `select status from ${t} where user_id=$1`, [b])).status,
        "suppressed",
      );
    }
    assert.equal(
      (await row(db, "select advertising from mobile_ad_consents where user_id=$1", [a]))
        .advertising,
      false,
    );
    assert.equal(
      (await row(db, "select count(*)::int n from mobile_push_devices where user_id=$1", [a])).n,
      0,
    );
    assert.equal(
      (await row(db, "select count(*)::int n from mobile_push_devices where user_id=$1", [b])).n,
      1,
    );
    assert.equal(
      await claim(db),
      undefined,
      "Worker stays off until the complete processor is configured",
    );
    await db.exec("set role authenticated");
    await assert.rejects(
      () => db.query("select * from account_deletion_jobs"),
      /permission denied/,
    );
    await assert.rejects(
      () => db.query("select * from claim_account_deletion()"),
      /permission denied/,
    );
  } finally {
    await db.close();
  }
});

test("leased deletion resumes partial phases, rejects stale workers and retains the target across Auth deletion", async () => {
  const db = await deletionDatabase();
  try {
    const user = randomUUID();
    await db.query("insert into auth.users values($1)", [user]);
    await db.query("select mobile_request_deletion($1)", [user]);
    await db.exec("update account_deletion_controls set worker_enabled=true");
    let job = await claim(db);
    assert(job.lease_token);
    assert.equal(job.phase, "inventory");
    assert.equal(await claim(db), undefined);
    assert.equal((await advance(db, job, true, "verification")).ok, false, "No phase skipping");
    assert.equal((await advance(db, job, false)).ok, true);
    assert.equal((await advance(db, job)).ok, false, "A checkpoint releases its old lease");
    job = await claim(db);
    assert.equal(job.phase, "inventory");
    await db.query(
      "update account_deletion_jobs set lease_until=now()-interval '1 second' where id=$1",
      [job.id],
    );
    assert.equal((await advance(db, job)).ok, false, "Expired leases cannot checkpoint");
    const recovered = await claim(db);
    assert.notEqual(recovered.lease_token, job.lease_token);
    assert.equal((await retry(db, job)).ok, false, "An old worker cannot delay a newer worker");
    assert.equal((await advance(db, recovered)).ok, true);
    for (const phase of ["authorization", "media", "records", "identity"]) {
      job = await claim(db);
      assert.equal(job.phase, phase);
      if (phase === "identity") await db.query("delete from auth.users where id=$1", [user]);
      assert.equal((await advance(db, job)).ok, true);
    }
    job = await claim(db);
    assert.equal(job.phase, "verification");
    assert.equal(job.user_id, user);
    assert.equal(
      (await row(db, "select count(*)::int n from mobile_account_deletions")).n,
      0,
      "Auth cascade cannot erase the private durable job",
    );
    assert.equal((await advance(db, job)).ok, true);
    const receipt = await row(db, "select * from account_deletion_jobs where id=$1", [job.id]);
    assert.equal(receipt.status, "completed");
    assert.equal(receipt.user_id, null);
    assert(receipt.completed_at);
    assert.equal(receipt.lease_token, null);
    assert.equal(await claim(db), undefined);
  } finally {
    await db.close();
  }
});

test("verification cannot report completion while Auth exists and failures keep a delayed resumable job", async () => {
  const db = await deletionDatabase();
  try {
    const user = randomUUID();
    await db.query("insert into auth.users values($1)", [user]);
    await db.query("select mobile_request_deletion($1)", [user]);
    await db.exec("update account_deletion_controls set worker_enabled=true");
    let job;
    for (const phase of deletionPhases.slice(0, -1)) {
      job = await claim(db);
      assert.equal(job.phase, phase);
      await advance(db, job);
    }
    job = await claim(db);
    assert.equal(job.phase, "verification");
    await assert.rejects(() => advance(db, job), /identity still exists/);
    await assert.rejects(
      () => retry(db, job, "user@example.com token-secret"),
      /Invalid deletion failure code/,
    );
    await assert.rejects(() => retry(db, job, null), /Invalid deletion failure code/);
    await assert.rejects(() => advance(db, job, null), /Invalid deletion checkpoint/);
    assert.equal((await retry(db, job, "verification_failed")).ok, true);
    const pending = await row(
      db,
      "select *,available_at>now() as delayed from account_deletion_jobs where id=$1",
      [job.id],
    );
    assert.equal(pending.failures, 1);
    const wait = Date.parse(pending.available_at) - Date.now();
    assert(
      wait > 55000 && wait < 65000,
      "First failure waits about one minute regardless of successful phase count",
    );
    assert.equal(pending.status, "retry");
    assert.equal(pending.phase, "verification");
    assert.equal(pending.user_id, user);
    assert(pending.delayed);
    assert.equal(await claim(db), undefined);
  } finally {
    await db.close();
  }
});

test("a failure in request suppression rolls back the queue and original request together", async () => {
  const db = await deletionDatabase();
  try {
    const user = randomUUID();
    await db.query("insert into auth.users values($1)", [user]);
    await db.exec(
      "create function fail_deletion_fixture() returns trigger language plpgsql as $$begin raise exception 'Synthetic database outage';end$$;create trigger fail_fixture before insert on shopping_privacy for each row execute function fail_deletion_fixture();",
    );
    await assert.rejects(
      () => db.query("select mobile_request_deletion($1)", [user]),
      /Synthetic database outage/,
    );
    for (const t of ["mobile_account_deletions", "account_deletion_jobs"])
      assert.equal((await row(db, `select count(*)::int n from ${t}`)).n, 0);
  } finally {
    await db.close();
  }
});

test("worker executes only its leased phase and retries without exposing private provider errors", async () => {
  const now = Date.now(),
    job = {
      id: randomUUID(),
      user_id: randomUUID(),
      phase: "media",
      lease_token: randomUUID(),
      lease_until: new Date(now + 300000).toISOString(),
    };
  let checkpoints = 0,
    retries = [];
  const queue = {
    claim: async () => job,
    assertBoundaries: async () => {},
    isCurrent: async () => true,
    advance: async () => {
      checkpoints++;
      return true;
    },
    retry: async (j, code) => {
      retries.push(code);
      return true;
    },
  };
  const work = Object.fromEntries(
    deletionPhases.map((p) => [
      p,
      async () => {
        assert.equal(p, "media");
        throw Error("private@example.com signed-token=SECRET");
      },
    ]),
  );
  assert.deepEqual(await runAccountDeletion(queue, work, () => now), {
    status: "retry",
    phase: "media",
  });
  assert.equal(checkpoints, 0);
  assert.deepEqual(retries, ["worker_failed"]);
  work.media = async () => {
    throw new DeletionStepError("media_unavailable");
  };
  assert.equal((await runAccountDeletion(queue, work, () => now)).status, "retry");
  assert.equal(retries.at(-1), "media_unavailable");
  work.media = async (j, signal) => {
    assert(!signal.aborted);
    return { done: false };
  };
  assert.equal((await runAccountDeletion(queue, work, () => now)).status, "continued");
  assert.equal(checkpoints, 1);
  queue.advance = async () => false;
  assert.equal((await runAccountDeletion(queue, work, () => now)).status, "lease_lost");
});

test("deployment recovers earlier requests and suppresses their separately consented website measurement", async () => {
  const user = randomUUID();
  const db = await deletionDatabase({
    beforeJobs: async (db) => {
      await db.query("insert into auth.users values($1)", [user]);
      await db.query("insert into shopping_privacy values($1,true,true,now(),now())", [
        "u:" + user,
      ]);
      await db.query("select mobile_request_deletion($1)", [user]);
    },
  });
  try {
    assert.equal((await row(db, "select user_id from account_deletion_jobs")).user_id, user);
    const privacy = await row(db, "select * from shopping_privacy where subject=$1", ["u:" + user]);
    assert.equal(privacy.personalization, false);
    assert.equal(privacy.advertising, false);
    assert.equal(await claim(db), undefined);
  } finally {
    await db.close();
  }
});

test("missing cleanup adapters and malformed results cannot advance, and short leases start no work", async () => {
  const now = Date.now(),
    job = {
      id: randomUUID(),
      user_id: randomUUID(),
      phase: "verification",
      lease_token: randomUUID(),
      lease_until: new Date(now + 300000).toISOString(),
    };
  let writes = 0,
    retries = 0,
    calls = 0;
  const queue = {
    claim: async () => job,
    assertBoundaries: async () => {},
    isCurrent: async () => true,
    advance: async () => {
      writes++;
      return true;
    },
    retry: async () => {
      retries++;
      return true;
    },
  };
  assert.equal((await runAccountDeletion(queue, {}, () => now)).status, "retry");
  assert.equal(writes, 0);
  assert.equal(retries, 1);
  assert.equal(
    (
      await runAccountDeletion(
        queue,
        Object.fromEntries(deletionPhases.map((phase) => [phase, async () => ({ done: "yes" })])),
        () => now,
      )
    ).status,
    "retry",
  );
  assert.equal(writes, 0);
  assert.equal(retries, 2);
  job.lease_until = new Date(now + 5000).toISOString();
  assert.equal(
    (
      await runAccountDeletion(
        queue,
        {
          verification: async () => {
            calls++;
            return { done: true };
          },
        },
        () => now,
      )
    ).status,
    "lease_lost",
  );
  assert.equal(calls, 0);
  assert.equal(retries, 2);
});
