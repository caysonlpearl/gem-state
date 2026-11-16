import test from "node:test";
import assert from "node:assert/strict";
import { randomBytes, randomUUID } from "node:crypto";
import { authorizationFixture } from "./helpers/account-deletion-authorization-database.mjs";
import { createAccountDeletionAuthorizationWork } from "../src/lib/account-deletion-authorization.server.ts";
import { createAccountDeletionRecordsWork } from "../src/lib/account-deletion-records-work.server.ts";
const signal = () => AbortSignal.timeout(40000);
const coded = (code) => (e) => e.code === code && e.message === code && e.cause === undefined;

test("leased Apple authorization work revokes one verified credential, retains other members and minimizes receipts before independent verification", async (t) => {
  const f = await authorizationFixture(t);
  assert.equal((await f.run()).status, "continued", JSON.stringify(f.lastFailure()));
  assert.equal(f.providerCalls.length, 1);
  assert.equal(
    (
      await f.db.query("select count(*)::int n from apple_authorization_vault where user_id=$1", [
        f.owner.userId,
      ])
    ).rows[0].n,
    0,
  );
  assert.equal(
    (
      await f.db.query("select count(*)::int n from apple_authorization_vault where user_id=$1", [
        f.other.userId,
      ])
    ).rows[0].n,
    1,
  );
  const sent = JSON.stringify(f.calls);
  for (const secret of [
    f.owner.refreshToken,
    f.owner.accessToken,
    f.owner.apple.privateKeyPem,
    f.config.vault.keys.v1,
  ])
    assert(!sent.includes(secret));
  assert.equal((await f.run()).status, "advanced");
  assert.equal(
    (await f.db.query("select phase from account_deletion_jobs where id=$1", [f.initial.id]))
      .rows[0].phase,
    "media",
  );
  assert.deepEqual(
    (
      await f.db.query(
        "select ready,manual_apple_revocation,finalized_at from account_deletion_authorization_state where job_id=$1",
        [f.initial.id],
      )
    ).rows[0],
    { ready: true, manual_apple_revocation: false, finalized_at: null },
  );
  // Exercise this completion barrier alone without bypassing the independent
  // media/records barriers installed on the real job table.
  await f.db
    .exec(`create temporary table authorization_completion_fixture(id uuid,user_id uuid,status text);
    create trigger authorization_completion_fixture after update of status,user_id on authorization_completion_fixture
    for each row execute function public.guard_account_deletion_authorization_completion()`);
  await f.db.query("insert into authorization_completion_fixture values($1,$2,'processing')", [
    f.initial.id,
    f.owner.userId,
  ]);
  await assert.rejects(
    f.db.query("update authorization_completion_fixture set status='completed',user_id=null"),
    /Account authorization cleanup incomplete/,
  );
  // Run the actual bounded inventory/records components before testing Auth
  // removal. Bypassing their retained-consent FKs would not prove composition.
  const inventory = await f.phase("inventory");
  for (let n = 0; n < 200; n++) {
    const r = (
      await f.db.query("select scan_account_deletion_media_inventory($1,$2,$3,50)r", [
        inventory.id,
        inventory.user_id,
        inventory.lease_token,
      ])
    ).rows[0].r;
    if (r.pass_done) break;
    if (n === 199) throw Error("Synthetic media inventory did not finish");
  }
  const records = createAccountDeletionRecordsWork(f.dbClient),
    recordJob = await f.phase("records");
  for (let n = 0; n < 50; n++) {
    const r = await records.step(recordJob, signal());
    if (r.done) break;
    if (n === 49) throw Error("Synthetic records did not finish");
  }
  const identity = await f.phase("identity");
  await assert.rejects(f.work.finalize(identity, signal()), coded("identity_unavailable"));
  await f.db.query("delete from auth.users where id=$1", [f.owner.userId]);
  await f.db.query(
    `insert into account_deletion_apple_receipts(job_id,credential_id,identity_id)
    select $1,gen_random_uuid(),gen_random_uuid() from generate_series(1,101)`,
    [f.initial.id],
  );
  const before = await f.phase("verification");
  await assert.rejects(f.work.verify(before, signal()), coded("verification_failed"));
  assert.equal(
    (
      await f.db.query(
        "select count(*)::int n from account_deletion_apple_receipts where job_id=$1 and identity_id is not null",
        [f.initial.id],
      )
    ).rows[0].n,
    102,
    "Verifier does not repair evidence",
  );
  const finish = await f.phase("identity");
  assert.deepEqual(await f.work.finalize(finish, signal()), { done: false, changed: 100 });
  assert.deepEqual(await f.work.finalize(finish, signal()), { done: false, changed: 2 });
  assert.deepEqual(await f.work.finalize(finish, signal()), { done: true, changed: 1 });
  assert.deepEqual(await f.work.finalize(finish, signal()), { done: true, changed: 0 });
  assert.equal(await f.work.verify(await f.phase("verification"), signal()), true);
  await f.db.query("update authorization_completion_fixture set status='completed',user_id=null");
  assert.equal(
    (
      await f.db.query(
        "select count(*)::int n from account_deletion_apple_receipts where identity_id=$1",
        [f.owner.identityId],
      )
    ).rows[0].n,
    0,
  );
  assert.notEqual(
    (await f.db.query("select status from account_deletion_jobs where id=$1", [f.initial.id]))
      .rows[0].status,
    "completed",
    "Authorization is one component, not whole erasure",
  );
});

test("lost committed acknowledgement resumes without duplicate provider revocation or plaintext receipts", async (t) => {
  const f = await authorizationFixture(t);
  f.loseAck();
  assert.equal((await f.run()).status, "retry");
  assert.equal(f.providerCalls.length, 1);
  assert.equal(
    f.calls.filter((c) => c.name === "acknowledge_account_deletion_apple_authorization").length,
    1,
    "SDK mutation retry is disabled",
  );
  assert.equal(
    (
      await f.db.query(
        "select count(*)::int n from account_deletion_apple_receipts where job_id=$1",
        [f.initial.id],
      )
    ).rows[0].n,
    1,
  );
  await f.resume();
  assert.equal((await f.run()).status, "advanced");
  assert.equal(f.providerCalls.length, 1);
});

test("a lost provider acknowledgement keeps credentials and retries the idempotent revocation before recording success", async (t) => {
  const f = await authorizationFixture(t);
  f.provider(() => {
    throw Error("Private ambiguous provider failure");
  });
  assert.equal((await f.run()).status, "retry");
  assert.equal(
    (
      await f.db.query("select count(*)::int n from apple_authorization_vault where user_id=$1", [
        f.owner.userId,
      ])
    ).rows[0].n,
    1,
  );
  assert.equal(
    (
      await f.db.query(
        "select count(*)::int n from account_deletion_apple_receipts where job_id=$1",
        [f.initial.id],
      )
    ).rows[0].n,
    0,
  );
  assert.equal(
    (
      await f.db.query("select last_error_code from account_deletion_jobs where id=$1", [
        f.initial.id,
      ])
    ).rows[0].last_error_code,
    "authorization_unavailable",
  );
  f.provider(undefined);
  await f.resume();
  assert.equal((await f.run()).status, "continued");
  assert.equal(f.providerCalls.length, 2);
  assert.equal((await f.run()).status, "advanced");
});

for (const kind of ["legacy", "google"])
  test(`${kind} account advances without Apple keys; only genuine missing-token Apple history records a manual-revocation requirement`, async (t) => {
    const f = await authorizationFixture(t, { kind });
    const work = createAccountDeletionAuthorizationWork(f.dbClient);
    const job = await f.queue.claim();
    assert.deepEqual(await work.step(job, signal()), { done: true });
    const state = (
      await f.db.query(
        "select ready,manual_apple_revocation from account_deletion_authorization_state where job_id=$1",
        [f.initial.id],
      )
    ).rows[0];
    assert.deepEqual(state, { ready: true, manual_apple_revocation: kind === "legacy" });
    assert.equal(f.providerCalls.length, 0);
    assert.equal(await f.queue.advance(job, true), true);
  });

test("missing keys, unrecognized client and provider errors never become a manual fallback", async (t) => {
  const f = await authorizationFixture(t);
  const job = await f.queue.claim();
  for (const config of [
    undefined,
    { ...f.config, vault: { ...f.config.vault, keys: { v1: randomBytes(32).toString("hex") } } },
    { ...f.config, clients: [{ ...f.owner.apple, clientId: "com.other.app" }] },
  ]) {
    const work = createAccountDeletionAuthorizationWork(f.dbClient, config, f.fetcher);
    await assert.rejects(work.step(job, signal()), coded("authorization_unavailable"));
  }
  assert.equal(f.providerCalls.length, 0);
  f.provider(() => new Response("PRIVATE provider error", { status: 500 }));
  await assert.rejects(f.work.step(job, signal()), coded("authorization_unavailable"));
  const state = (
    await f.db.query(
      "select ready,manual_apple_revocation from account_deletion_authorization_state where job_id=$1",
      [f.initial.id],
    )
  ).rows[0];
  assert.deepEqual(state, { ready: false, manual_apple_revocation: false });
  assert.equal(
    (
      await f.db.query("select count(*)::int n from apple_authorization_vault where user_id=$1", [
        f.owner.userId,
      ])
    ).rows[0].n,
    1,
  );
});

test("a previously corrupted encrypted credential cannot invoke Apple or become manual cleanup", async (t) => {
  const f = await authorizationFixture(t, { corrupt: true });
  assert.equal((await f.run()).status, "retry");
  assert.equal(f.providerCalls.length, 0);
  assert.deepEqual(
    (
      await f.db.query(
        "select ready,manual_apple_revocation from account_deletion_authorization_state where job_id=$1",
        [f.initial.id],
      )
    ).rows[0],
    { ready: false, manual_apple_revocation: false },
  );
  assert.equal(
    (
      await f.db.query("select count(*)::int n from apple_authorization_vault where user_id=$1", [
        f.owner.userId,
      ])
    ).rows[0].n,
    1,
  );
});

test("stale lease after provider success cannot discard credentials or advance the job", async (t) => {
  const f = await authorizationFixture(t);
  let replacement;
  f.provider(async () => {
    replacement = (
      await f.db.query(
        "update account_deletion_jobs set lease_token=gen_random_uuid()where id=$1 returning *",
        [f.initial.id],
      )
    ).rows[0];
    return new Response(null, { status: 200 });
  });
  assert.equal((await f.run()).status, "lease_lost");
  assert(replacement);
  assert.equal(
    (
      await f.db.query("select count(*)::int n from apple_authorization_vault where user_id=$1", [
        f.owner.userId,
      ])
    ).rows[0].n,
    1,
  );
  f.provider(undefined);
  assert.deepEqual(await f.work.step(replacement, signal()), { done: false });
  assert.equal(f.providerCalls.length, 2);
});

test("schema drift during provider revocation keeps the credential for a reviewed retry", async (t) => {
  const f = await authorizationFixture(t);
  f.provider(async () => {
    await f.db.exec("grant select on account_deletion_apple_receipts to authenticated");
    return new Response(null, { status: 200 });
  });
  assert.equal((await f.run()).status, "retry");
  assert.equal(f.providerCalls.length, 1);
  assert.equal(
    (
      await f.db.query("select count(*)::int n from apple_authorization_vault where user_id=$1", [
        f.owner.userId,
      ])
    ).rows[0].n,
    1,
  );
  assert.equal(
    (
      await f.db.query(
        "select count(*)::int n from account_deletion_apple_receipts where job_id=$1",
        [f.initial.id],
      )
    ).rows[0].n,
    0,
  );
});

test("fresh scope, identity write boundaries, private RPC grants and schema drift stop stale cleanup", async (t) => {
  const f = await authorizationFixture(t);
  const job = await f.queue.claim();
  await assert.rejects(
    f.db.query(
      "insert into auth.identities(id,user_id,provider,provider_id)values($1,$2,'email','private-new-identity')",
      [randomUUID(), f.owner.userId],
    ),
    /Private account records unavailable/,
  );
  for (const role of ["anon", "authenticated", "service_role"]) {
    await f.db.exec("set role " + role);
    await assert.rejects(
      f.db.query("select * from account_deletion_apple_receipts"),
      /permission denied/,
    );
    await f.db.exec("reset role");
    if (role !== "service_role") {
      await f.db.exec("set role " + role);
      await assert.rejects(
        f.db.query("select prepare_account_deletion_authorization($1,$2,$3)", [
          job.id,
          job.user_id,
          job.lease_token,
        ]),
        /permission denied/,
      );
      await f.db.exec("reset role");
    }
  }
  f.afterRpc(async (name) => {
    if (name === "prepare_account_deletion_authorization")
      await f.db.exec("update account_deletion_controls set worker_enabled=false");
  });
  await assert.rejects(f.work.step(job, signal()), coded("authorization_unavailable"));
  assert.equal(f.providerCalls.length, 0);
  f.afterRpc(undefined);
  await f.db.exec(
    "update account_deletion_controls set worker_enabled=true;grant select on account_deletion_authorization_state to authenticated",
  );
  assert.equal(
    (await f.db.query("select account_deletion_authorization_current()v")).rows[0].v,
    false,
  );
  await assert.rejects(f.work.step(job, signal()), coded("authorization_unavailable"));
  assert.equal(f.providerCalls.length, 0);
});
