import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { deletionWorkerDatabase } from "./helpers/account-deletion-database.mjs";
import { createAccountDeletionQueue } from "../src/lib/account-deletion-queue.server.ts";
import {
  deletionPhases,
  DeletionStepError,
  runAccountDeletion,
} from "../src/lib/account-deletion-worker.ts";

const coverage = { unguarded_functions: 0, unguarded_tables: 0, helper_privilege_gaps: 0 };
const job = (phase = "inventory") => ({
  id: randomUUID(),
  user_id: randomUUID(),
  status: "processing",
  phase,
  lease_token: randomUUID(),
  lease_until: new Date(Date.now() + 300000).toISOString(),
});
const workFor = (step) => Object.fromEntries(deletionPhases.map((phase) => [phase, step]));
const coded = (code) => (error) => {
  assert(error instanceof DeletionStepError);
  assert.equal(error.message, code);
  assert.equal(error.code, code);
  assert.equal(error.cause, undefined);
  return true;
};
function transport(reply) {
  const calls = [];
  return {
    calls,
    rpc(name, args) {
      return {
        async abortSignal(signal) {
          assert(signal instanceof AbortSignal);
          signal.throwIfAborted();
          calls.push({ name, args, signal });
          return { data: await reply(name, args, signal), error: null };
        },
      };
    },
  };
}

async function fixture() {
  const db = await deletionWorkerDatabase();
  const bridge = transport(async (name, args) => {
    let result;
    switch (name) {
      case "claim_account_deletion":
        result = (await db.query("select * from claim_account_deletion()")).rows;
        break;
      case "advance_account_deletion":
        assert.deepEqual(Object.keys(args).sort(), ["_done", "_id", "_lease", "_phase"]);
        result = (
          await db.query("select advance_account_deletion($1,$2,$3,$4) value", [
            args._id,
            args._lease,
            args._phase,
            args._done,
          ])
        ).rows[0].value;
        break;
      case "retry_account_deletion":
        assert.deepEqual(Object.keys(args).sort(), ["_code", "_id", "_lease", "_phase"]);
        result = (
          await db.query("select retry_account_deletion($1,$2,$3,$4) value", [
            args._id,
            args._lease,
            args._phase,
            args._code,
          ])
        ).rows[0].value;
        break;
      case "account_deletion_lease_current":
        assert.deepEqual(Object.keys(args).sort(), ["_id", "_lease", "_phase", "_user"]);
        result = (
          await db.query("select account_deletion_lease_current($1,$2,$3,$4) value", [
            args._id,
            args._user,
            args._lease,
            args._phase,
          ])
        ).rows[0].value;
        break;
      case "account_access_coverage":
        result = (await db.query("select account_access_coverage() value")).rows[0].value;
        break;
      default:
        assert.fail("Unknown RPC");
    }
    return JSON.parse(JSON.stringify(result));
  });
  return { db, bridge, queue: createAccountDeletionQueue(bridge) };
}

test("server queue runs installed SQL phases under service permissions, keeps retries durable and refuses completion while identity exists", async () => {
  const { db, queue } = await fixture();
  const user = randomUUID(),
    other = randomUUID();
  try {
    await db.query("insert into auth.users(id) values($1),($2)", [user, other]);
    await db.query("select mobile_request_deletion($1)", [user]);
    await db.exec("set role service_role");
    assert.equal(await queue.claim(), null, "disabled worker must remain idle");
    await db.exec(
      "reset role; update account_deletion_controls set worker_enabled=true; set role service_role",
    );
    const first = await queue.claim();
    assert.equal(first.user_id, user);
    assert(Object.isFrozen(first));
    assert.equal(await queue.retry(first, "inventory_unavailable"), true);
    assert.equal(await queue.advance(first, true), false, "retried lease cannot checkpoint");
    assert.equal(await queue.retry(first, "worker_failed"), false);
    assert.equal(await queue.claim(), null, "retry delay survives invocation");
    await db.exec(
      "reset role; update account_deletion_jobs set available_at=now(); set role service_role",
    );
    const seen = [];
    const work = workFor(async (claimed, signal) => {
      signal.throwIfAborted();
      assert.equal(claimed.user_id, user);
      assert(!("status" in claimed));
      seen.push(claimed.phase);
      return { done: true };
    });
    for (const phase of deletionPhases.slice(0, -1)) {
      assert.deepEqual(await runAccountDeletion(queue, work), { status: "advanced", phase });
    }
    assert.deepEqual(await runAccountDeletion(queue, work), {
      status: "retry",
      phase: "verification",
    });
    await db.exec("reset role");
    const pending = (await db.query("select * from account_deletion_jobs")).rows[0];
    assert.equal(pending.user_id, user);
    assert.equal(pending.status, "retry");
    assert.equal(pending.last_error_code, "worker_failed");
    // Only synthetic identities in this disposable database are removed.
    await db.query("delete from auth.users where id=$1", [user]);
    await db.exec("update account_deletion_jobs set available_at=now(); set role service_role");
    assert.deepEqual(await runAccountDeletion(queue, work), {
      status: "advanced",
      phase: "verification",
    });
    assert.deepEqual(await runAccountDeletion(queue, work), { status: "idle" });
    await db.exec("reset role");
    const receipt = (await db.query("select * from account_deletion_jobs")).rows[0];
    assert.equal(receipt.status, "completed");
    assert.equal(receipt.user_id, null);
    assert.equal(receipt.lease_token, null);
    assert.equal((await db.query("select id from auth.users")).rows[0].id, other);
    assert.deepEqual(seen, [...deletionPhases, "verification"]);
  } finally {
    await db.close();
  }
});

test("new unguarded member RPC during a phase prevents a checkpoint and leaves a coded retry", async () => {
  const { db, queue } = await fixture();
  try {
    const user = randomUUID();
    await db.query("insert into auth.users(id) values($1)", [user]);
    await db.query("select mobile_request_deletion($1)", [user]);
    await db.exec("update account_deletion_controls set worker_enabled=true");
    let steps = 0;
    const work = workFor(async () => {
      steps++;
      await db.exec(
        "create function public.new_member_read() returns int language sql security definer as $$ select 1 $$",
      );
      return { done: true };
    });
    assert.deepEqual(await runAccountDeletion(queue, work), {
      status: "retry",
      phase: "inventory",
    });
    const pending = (await db.query("select phase,last_error_code from account_deletion_jobs"))
      .rows[0];
    assert.deepEqual(pending, { phase: "inventory", last_error_code: "verification_failed" });
    await db.exec("update account_deletion_jobs set available_at=now()");
    assert.equal((await runAccountDeletion(queue, work)).status, "retry");
    assert.equal(steps, 1, "existing drift must prevent starting another step");
  } finally {
    await db.close();
  }
});

test("invalid claim responses never reach cleanup and extra response fields never enter its job", async () => {
  const valid = job();
  for (const response of [
    null,
    {},
    [valid, valid],
    [{ ...valid, id: "wrong" }],
    [{ ...valid, user_id: null }],
    [{ ...valid, lease_token: "wrong" }],
    [{ ...valid, phase: "completed" }],
    [{ ...valid, status: "retry" }],
    [{ ...valid, lease_until: "not-a-date" }],
  ]) {
    const queue = createAccountDeletionQueue(transport(async () => response));
    await assert.rejects(queue.claim(), coded("worker_failed"));
  }
  const queue = createAccountDeletionQueue(
    transport(async () => [
      { ...valid, private_email: "private@example.com", provider_token: "SECRET" },
    ]),
  );
  const claimed = await queue.claim();
  assert.deepEqual(Object.keys(claimed).sort(), [
    "id",
    "lease_token",
    "lease_until",
    "phase",
    "user_id",
  ]);
  assert(Object.isFrozen(claimed));
});

test("all access coverage checks must be present numeric zero, and cancelled checks make no RPC", async () => {
  for (const response of [
    null,
    [],
    {},
    { ...coverage, unguarded_tables: "0" },
    { ...coverage, unguarded_functions: 1 },
    { ...coverage, unguarded_tables: 1 },
    { ...coverage, helper_privilege_gaps: 1 },
    { ...coverage, future_check: 0 },
  ]) {
    const queue = createAccountDeletionQueue(transport(async () => response));
    await assert.rejects(
      queue.assertBoundaries(new AbortController().signal),
      coded("verification_failed"),
    );
  }
  const db = transport(async () => coverage);
  const queue = createAccountDeletionQueue(db);
  await queue.assertBoundaries(new AbortController().signal);
  const controller = new AbortController();
  controller.abort();
  await assert.rejects(queue.assertBoundaries(controller.signal), coded("verification_failed"));
  assert.equal(db.calls.length, 1);
});

test("RPC failures and invalid write results expose only allowlisted codes", async () => {
  const valid = job();
  for (const fail of [
    () => {
      throw Error("private@example.com signed-token=SECRET");
    },
    () => undefined,
    () => "true",
    () => null,
  ]) {
    const queue = createAccountDeletionQueue(transport(fail));
    await assert.rejects(queue.advance(valid, true), coded("worker_failed"));
    await assert.rejects(queue.retry(valid, "worker_failed"), coded("worker_failed"));
  }
  const db = transport(async () => false);
  const queue = createAccountDeletionQueue(db);
  assert.equal(await queue.advance(valid, false), false);
  assert.equal(await queue.retry(valid, "worker_failed"), false);
  await assert.rejects(queue.advance(valid, "yes"), coded("worker_failed"));
  await assert.rejects(queue.advance({ ...valid, id: "wrong" }, true), coded("worker_failed"));
  await assert.rejects(queue.retry(valid, "private@example.com"), coded("worker_failed"));
  assert.equal(db.calls.length, 2, "invalid writes must be rejected before transmission");
  const errorResponse = createAccountDeletionQueue({
    rpc: () => ({ abortSignal: async () => ({ data: [], error: { message: "SECRET" } }) }),
  });
  await assert.rejects(errorResponse.claim(), coded("worker_failed"));
});

test("every cleanup adapter is required before starting and neither phases nor the final verifier can retarget a job", async () => {
  for (const phase of ["inventory", "verification"]) {
    const target = job(phase);
    let calls = 0,
      checks = 0,
      writes = 0;
    const retries = [];
    const queue = {
      claim: async () => target,
      isCurrent: async () => true,
      assertBoundaries: async () => {
        checks++;
      },
      advance: async () => {
        writes++;
        return true;
      },
      retry: async (claimed, code) => {
        assert.equal(claimed.user_id, target.user_id);
        retries.push(code);
        return true;
      },
    };
    const work = workFor(async (claimed) => {
      calls++;
      claimed.user_id = randomUUID();
      return { done: true };
    });
    const incomplete = { ...work };
    delete incomplete.media;
    assert.equal((await runAccountDeletion(queue, incomplete)).status, "retry");
    assert.equal(calls, 0);
    assert.equal(checks, 0);
    assert.equal((await runAccountDeletion(queue, work)).status, "retry");
    assert.equal(calls, 1);
    assert.equal(checks, 1);
    assert.equal(writes, 0);
    assert.deepEqual(retries, ["worker_failed", "worker_failed"]);
    // Final verification has the same post-step guard as every other phase.
    queue.assertBoundaries = async () => {
      if (++checks === 3) throw new DeletionStepError("verification_failed");
    };
    assert.equal(
      (
        await runAccountDeletion(
          queue,
          workFor(async () => ({ done: true })),
        )
      ).status,
      "retry",
    );
    assert.equal(writes, 0);
    assert.equal(retries.at(-1), "verification_failed");
  }
});

test("live database lease checks bind the target, phase and token, honor the operator switch and stay private", async () => {
  const { db, queue } = await fixture();
  const user = randomUUID();
  try {
    await db.query("insert into auth.users(id) values($1)", [user]);
    await db.query("select mobile_request_deletion($1)", [user]);
    await db.exec("update account_deletion_controls set worker_enabled=true");
    const claimed = await queue.claim(),
      signal = new AbortController().signal;
    assert.equal(await queue.isCurrent(claimed, signal), true);
    for (const patch of [
      { id: randomUUID() },
      { user_id: randomUUID() },
      { lease_token: randomUUID() },
      { phase: "media" },
    ])
      assert.equal(await queue.isCurrent({ ...claimed, ...patch }, signal), false);
    await db.exec("update account_deletion_controls set worker_enabled=false");
    assert.equal(await queue.isCurrent(claimed, signal), false);
    assert.equal(
      await queue.advance(claimed, true),
      false,
      "SQL must refuse a checkpoint even if a worker skipped its read guard",
    );
    assert.equal(await queue.claim(), null);
    await db.exec("update account_deletion_controls set worker_enabled=true");
    assert.equal(await queue.isCurrent(claimed, signal), true);
    for (const role of ["anon", "authenticated"]) {
      await db.exec(`set role ${role}`);
      await assert.rejects(
        db.query("select account_deletion_lease_current($1,$2,$3,$4)", [
          claimed.id,
          claimed.user_id,
          claimed.lease_token,
          claimed.phase,
        ]),
        /permission denied/,
      );
      await db.exec("reset role");
    }
    await db.exec("set role service_role");
    assert.equal(await queue.isCurrent(claimed, signal), true);
    await db.exec("reset role");
    await db.query(
      "update account_deletion_jobs set lease_until=now()-interval '1 second' where id=$1",
      [claimed.id],
    );
    assert.equal(
      await queue.isCurrent(
        { ...claimed, lease_until: new Date(Date.now() + 3600000).toISOString() },
        signal,
      ),
      false,
    );
    const recovered = await queue.claim();
    assert.notEqual(recovered.lease_token, claimed.lease_token);
    assert.equal(await queue.isCurrent(claimed, signal), false);
    assert.equal(await queue.isCurrent(recovered, signal), true);
    assert.equal(await queue.advance(claimed, true), false);
  } finally {
    await db.close();
  }
});

test("disabling work during a phase prevents its checkpoint, including final verification after Auth removal", async () => {
  for (const phase of ["inventory", "verification"]) {
    const { db, queue } = await fixture();
    const user = randomUUID();
    try {
      await db.query("insert into auth.users(id) values($1)", [user]);
      await db.query("select mobile_request_deletion($1)", [user]);
      await db.query("update account_deletion_jobs set phase=$1", [phase]);
      await db.exec("update account_deletion_controls set worker_enabled=true");
      if (phase === "verification") await db.query("delete from auth.users where id=$1", [user]);
      let started = 0;
      const work = workFor(async () => {
        started++;
        await db.exec("update account_deletion_controls set worker_enabled=false");
        return { done: true };
      });
      assert.deepEqual(await runAccountDeletion(queue, work), { status: "lease_lost", phase });
      assert.equal(started, 1);
      const pending = (await db.query("select status,phase,user_id from account_deletion_jobs"))
        .rows[0];
      assert.deepEqual(pending, { status: "processing", phase, user_id: user });
      assert.equal(await queue.claim(), null);
    } finally {
      await db.close();
    }
  }
});

test("a fabricated or disabled claim reaches no cleanup even when its client-side expiry looks valid", async () => {
  const { db, queue } = await fixture();
  const user = randomUUID();
  try {
    await db.query("insert into auth.users(id) values($1)", [user]);
    await db.query("select mobile_request_deletion($1)", [user]);
    await db.exec("update account_deletion_controls set worker_enabled=true");
    const claimed = await queue.claim();
    let calls = 0;
    const work = workFor(async () => {
      calls++;
      return { done: true };
    });
    for (const patch of [{ user_id: randomUUID() }, { lease_token: randomUUID() }])
      assert.equal(
        (
          await runAccountDeletion(
            { ...queue, claim: async () => ({ ...claimed, ...patch }) },
            work,
          )
        ).status,
        "lease_lost",
      );
    await db.exec("update account_deletion_controls set worker_enabled=false");
    assert.equal(
      (await runAccountDeletion({ ...queue, claim: async () => claimed }, work)).status,
      "lease_lost",
    );
    assert.equal(calls, 0);
  } finally {
    await db.close();
  }
});

test("malformed lease responses, missing guards and cancellation cannot authorize work or leak provider details", async () => {
  const target = job(),
    signal = new AbortController().signal;
  for (const value of [undefined, null, "true", 1, {}, { current: true }]) {
    const queue = createAccountDeletionQueue(transport(async () => value));
    await assert.rejects(queue.isCurrent(target, signal), coded("worker_failed"));
  }
  for (const value of [true, false])
    assert.equal(
      await createAccountDeletionQueue(transport(async () => value)).isCurrent(target, signal),
      value,
    );
  const db = transport(async () => {
    throw Error("private@example.invalid signed-token=SECRET");
  });
  const queue = createAccountDeletionQueue(db);
  await assert.rejects(queue.isCurrent(target, signal), coded("worker_failed"));
  const controller = new AbortController();
  controller.abort();
  await assert.rejects(queue.isCurrent(target, controller.signal), coded("worker_failed"));
  await assert.rejects(
    queue.isCurrent({ ...target, user_id: "invalid" }, signal),
    coded("worker_failed"),
  );
  assert.equal(db.calls.length, 1);
  let calls = 0,
    retries = 0;
  const missing = {
    claim: async () => target,
    assertBoundaries: async () => {
      calls++;
    },
    advance: async () => {
      throw Error("must not advance");
    },
    retry: async () => {
      retries++;
      return true;
    },
  };
  assert.equal(
    (
      await runAccountDeletion(
        missing,
        workFor(async () => {
          calls++;
          return { done: true };
        }),
      )
    ).status,
    "retry",
  );
  assert.equal(calls, 0);
  assert.equal(retries, 1);
});
