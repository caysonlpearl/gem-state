import test from "node:test";
import assert from "node:assert/strict";
import { loadPhotoModules } from "./photo-storage-fixture.mjs";

const { runPhotoMigrationBatches } = loadPhotoModules()("./photo-migration-batches");
function fixture(total = 61) {
  const run = {
    id: "55555555-5555-4555-8555-555555555555",
    projectRef: "abcdefghijklmnopqrst",
    digest: "a".repeat(64),
    createdAt: "2026-11-02T00:00:00Z",
    totalGroups: total,
    totalSourceBytes: 1000,
    sourceBytesReserved: 0,
    confirmedDownloadBytes: 0,
    completedGroups: 0,
    failedGroups: 0,
    runningGroups: 0,
    lastFailure: null,
    permit: { maxGroups: total, maxSourceBytes: 2000, expiresAt: "2099-01-01T00:00:00Z" },
  };
  const state = { calls: 0, completed: 0, checkpoints: [], stop: false, events: [] };
  const status = () => ({ ...run, completedGroups: state.completed });
  const options = {
    run,
    retry: false,
    continuous: false,
    shouldStop: () => state.stop,
    now: () => Date.parse("2026-11-02T00:00:00Z"),
    onStatus: (value) => state.events.push(["status", value.completedGroups]),
    async step(input) {
      assert.equal(input.id, run.id);
      state.calls++;
      state.events.push(["step", state.calls, input.retry]);
      if (state.completed === total) return { state: "complete", reason: null, status: status() };
      state.completed++;
      return { state: "copied", reason: null, status: status() };
    },
    async refresh() {
      state.checkpoints.push(state.calls);
      state.events.push(["checkpoint", state.calls]);
      return status();
    },
  };
  return { run, state, options, status };
}

test("the existing single-batch action stops at 25 without continuing or refreshing", async () => {
  const f = fixture();
  assert.equal(await runPhotoMigrationBatches(f.options), "batch-finished");
  assert.equal(f.state.calls, 25);
  assert.deepEqual(f.state.checkpoints, []);
});

test("continuous copying checkpoints every 25 groups and awaits every server acknowledgement", async () => {
  const f = fixture();
  f.options.continuous = true;
  let inFlight = 0;
  const step = f.options.step;
  f.options.step = async (input) => {
    assert.equal(inFlight++, 0);
    await Promise.resolve();
    const result = await step(input);
    inFlight--;
    return result;
  };
  assert.equal(await runPhotoMigrationBatches(f.options), "complete");
  assert.equal(f.state.completed, 61);
  assert.equal(f.state.calls, 62, "completion must be acknowledged by the server");
  assert.deepEqual(f.state.checkpoints, [25, 50]);
  for (const boundary of [25, 50]) {
    const checkpoint = f.state.events.findIndex(
      ([kind, count]) => kind === "checkpoint" && count === boundary,
    );
    assert.equal(f.state.events[checkpoint + 1][0], "status");
    assert.deepEqual(f.state.events[checkpoint + 2], ["step", boundary + 1, false]);
  }
});

test("a user stop during an in-flight group lets that group settle and starts no next request", async () => {
  const f = fixture();
  f.options.continuous = true;
  const step = f.options.step;
  let release, started;
  const gate = new Promise((resolve) => {
    release = resolve;
  });
  const firstStarted = new Promise((resolve) => {
    started = resolve;
  });
  f.options.step = async (input) => {
    started();
    await gate;
    return step(input);
  };
  const work = runPhotoMigrationBatches(f.options);
  await firstStarted;
  f.state.stop = true;
  release();
  assert.equal(await work, "user-stop");
  assert.equal(f.state.calls, 1);
  assert.equal(f.state.completed, 1);
  assert.deepEqual(f.state.checkpoints, []);
});

test("stopped, busy and retry-limit acknowledgements never trigger another request", async () => {
  for (const [state, reason, expected] of [
    ["stopped", null, "stopped"],
    ["busy", null, "busy"],
    ["stopped", "retry-limit", "retry-limit"],
  ]) {
    const f = fixture();
    f.options.continuous = true;
    f.options.step = async () => {
      f.state.calls++;
      return { state, reason, status: f.status() };
    };
    assert.equal(await runPhotoMigrationBatches(f.options), expected);
    assert.equal(f.state.calls, 1);
    assert.deepEqual(f.state.checkpoints, []);
  }
});

test("a single retry stays single even when continuous mode is requested", async () => {
  const f = fixture();
  f.options.retry = true;
  f.options.continuous = true;
  assert.equal(await runPhotoMigrationBatches(f.options), "batch-finished");
  assert.equal(f.state.calls, 1);
  assert.deepEqual(f.state.checkpoints, []);
});

test("missing or expired approvals do not start a request", async () => {
  for (const permit of [
    null,
    { maxGroups: 61, maxSourceBytes: 2000, expiresAt: "2020-01-01T00:00:00Z" },
  ]) {
    const f = fixture();
    f.run.permit = permit;
    assert.equal(await runPhotoMigrationBatches(f.options), "permit-changed");
    assert.equal(f.state.calls, 0);
  }
});

test("a checkpoint cannot renew, widen or revoke the approval silently", async () => {
  for (const change of [
    null,
    { maxGroups: 100 },
    { maxSourceBytes: 4000 },
    { expiresAt: "2099-02-01T00:00:00Z" },
    { expiresAt: "2020-01-01T00:00:00Z" },
  ]) {
    const f = fixture();
    f.options.continuous = true;
    f.options.refresh = async () => ({
      ...f.status(),
      permit: change === null ? null : { ...f.run.permit, ...change },
    });
    assert.equal(await runPhotoMigrationBatches(f.options), "permit-changed");
    assert.equal(f.state.calls, 25);
  }
});

test("failure or an active lease at a checkpoint prevents the next batch", async () => {
  for (const [changes, expected] of [
    [{ failedGroups: 1 }, "stopped"],
    [{ runningGroups: 1 }, "busy"],
  ]) {
    const f = fixture();
    f.options.continuous = true;
    f.options.refresh = async () => ({ ...f.status(), ...changes });
    assert.equal(await runPhotoMigrationBatches(f.options), expected);
    assert.equal(f.state.calls, 25);
  }
});

test("another review or digest cannot be substituted at a checkpoint", async () => {
  for (const changes of [
    { id: "66666666-6666-4666-8666-666666666666" },
    { digest: "b".repeat(64) },
  ]) {
    const f = fixture();
    f.options.continuous = true;
    f.options.refresh = async () => ({ ...f.status(), ...changes });
    await assert.rejects(runPhotoMigrationBatches(f.options), /review changed/);
    assert.equal(f.state.calls, 25);
  }
});

test("a lost acknowledgement stops without retrying the uncertain operation", async () => {
  const f = fixture();
  f.options.continuous = true;
  f.options.step = async () => {
    f.state.calls++;
    throw new Error("acknowledgement lost");
  };
  await assert.rejects(runPhotoMigrationBatches(f.options), /acknowledgement lost/);
  assert.equal(f.state.calls, 1);
  assert.deepEqual(f.state.checkpoints, []);
});

function processingFixture() {
  const f = fixture(3);
  f.options.continuous = true;
  let failed = false;
  const step = f.options.step;
  f.state.preparations = 0;
  f.options.step = async (input) => {
    if (!failed && f.state.completed === 1) {
      failed = true;
      f.state.calls++;
      return {
        state: "stopped",
        reason: null,
        status: { ...f.status(), failedGroups: 1, lastFailure: "processing" },
      };
    }
    if (failed && f.state.completed === 1) assert.equal(input.retry, true);
    return step(input);
  };
  f.options.refresh = async () => ({
    ...f.status(),
    ...(failed && f.state.completed === 1 ? { failedGroups: 1, lastFailure: "processing" } : {}),
  });
  f.options.prepareProcessingRecovery = async (status) => {
    assert.equal(status.completedGroups, 1);
    f.state.preparations++;
  };
  return f;
}

test("continuous copying recovers one confirmed processing failure with one preparation and one retry", async () => {
  const f = processingFixture();
  assert.equal(await runPhotoMigrationBatches(f.options), "complete");
  assert.equal(f.state.completed, 3);
  assert.equal(f.state.calls, 5);
  assert.equal(f.state.preparations, 1);
  assert.equal(f.state.events.filter((e) => e[0] === "step" && e[2] === true).length, 1);
});

test("automatic preview recovery is absent from manual batches and explicit retries", async () => {
  for (const changes of [{ continuous: false }, { retry: true }]) {
    const f = processingFixture();
    Object.assign(f.options, changes);
    if (changes.retry) f.state.completed = 1;
    assert.equal(await runPhotoMigrationBatches(f.options), "stopped");
    assert.equal(f.state.preparations, 0);
  }
});

test("network uncertainty and nonprocessing failures never trigger preparation or retry", async () => {
  for (const changes of [
    { lastFailure: "copy-failed" },
    { lastFailure: "source-changed" },
    { lastFailure: "source-budget" },
    { runningGroups: 1 },
    { failedGroups: 2 },
    { completedGroups: 2 },
  ]) {
    const f = processingFixture();
    f.state.completed = 1;
    f.options.step = async () => {
      f.state.calls++;
      return {
        state: "stopped",
        reason: null,
        status: { ...f.status(), failedGroups: 1, lastFailure: "processing", ...changes },
      };
    };
    assert.equal(await runPhotoMigrationBatches(f.options), "stopped");
    assert.equal(f.state.calls, 1);
    assert.equal(f.state.preparations, 0);
  }
  const f = processingFixture();
  f.options.step = async () => {
    throw new Error("Unknown request outcome");
  };
  await assert.rejects(runPhotoMigrationBatches(f.options), /Unknown/);
  assert.equal(f.state.preparations, 0);
});

test("changed saved state before or after preparation stops before another mutation", async () => {
  for (const after of [false, true])
    for (const changes of [
      { completedGroups: 2 },
      { failedGroups: 0 },
      { runningGroups: 1 },
      { lastFailure: "copy-failed" },
    ]) {
      const f = processingFixture();
      let reads = 0;
      f.options.refresh = async () => ({
        ...f.status(),
        failedGroups: 1,
        lastFailure: "processing",
        ...(++reads === (after ? 2 : 1) ? changes : {}),
      });
      assert.equal(await runPhotoMigrationBatches(f.options), "stopped");
      assert.equal(f.state.calls, 2);
      assert.equal(f.state.preparations, after ? 1 : 0);
    }
});

test("approval changes and user stops are checked before and after browser preparation", async () => {
  for (const after of [false, true])
    for (const stop of [false, true]) {
      const f = processingFixture();
      let reads = 0;
      f.options.refresh = async () => {
        const change = ++reads === (after ? 2 : 1);
        if (stop && change) f.state.stop = true;
        return {
          ...f.status(),
          failedGroups: 1,
          lastFailure: "processing",
          ...(!stop && change ? { permit: null } : {}),
        };
      };
      assert.equal(
        await runPhotoMigrationBatches(f.options),
        stop ? "user-stop" : "permit-changed",
      );
      assert.equal(f.state.calls, 2);
      assert.equal(f.state.preparations, after ? 1 : 0);
    }
});

test("a failed preparation or failed recovery retry never loops or obtains another preparation", async () => {
  const f = processingFixture();
  f.options.prepareProcessingRecovery = async () => {
    f.state.preparations++;
    throw new Error("Preparation interrupted");
  };
  await assert.rejects(runPhotoMigrationBatches(f.options), /interrupted/);
  assert.equal(f.state.preparations, 1);
  assert.equal(f.state.calls, 2);
  for (const retryState of ["stopped", "busy"]) {
    const g = processingFixture();
    const step = g.options.step;
    g.options.step = async (input) => {
      if (input.retry) {
        g.state.calls++;
        return {
          state: retryState,
          reason: null,
          status: { ...g.status(), failedGroups: 1, lastFailure: "processing" },
        };
      }
      return step(input);
    };
    assert.equal(await runPhotoMigrationBatches(g.options), retryState);
    assert.equal(g.state.calls, 3);
    assert.equal(g.state.preparations, 1);
  }
});

test("recovery checkpoints count completed groups rather than retry requests", async () => {
  const f = fixture(30);
  f.options.continuous = true;
  let failed = false,
    recovered = false;
  const step = f.options.step,
    refresh = f.options.refresh;
  f.options.step = async (input) => {
    if (!failed && f.state.completed === 24) {
      failed = true;
      f.state.calls++;
      return {
        state: "stopped",
        reason: null,
        status: { ...f.status(), failedGroups: 1, lastFailure: "processing" },
      };
    }
    if (input.retry) recovered = true;
    return step(input);
  };
  f.options.refresh = async () => {
    const value = await refresh();
    return {
      ...value,
      ...(failed && !recovered ? { failedGroups: 1, lastFailure: "processing" } : {}),
    };
  };
  f.options.prepareProcessingRecovery = async () => {};
  assert.equal(await runPhotoMigrationBatches(f.options), "complete");
  assert.equal(f.state.calls, 32);
  assert.deepEqual(f.state.checkpoints, [25, 25, 26]);
  const checkpoint = f.state.events.findIndex(
    ([kind, count]) => kind === "checkpoint" && count === 26,
  );
  assert.deepEqual(f.state.events[checkpoint + 1], ["status", 25]);
  assert.deepEqual(f.state.events[checkpoint + 2], ["step", 27, false]);
});

test("a substituted review or an expired permit after preparation never receives a retry", async () => {
  for (const change of [{ id: "other" }, { digest: "b".repeat(64) }]) {
    const f = processingFixture();
    const refresh = f.options.refresh;
    let calls = 0;
    f.options.refresh = async () => ({ ...(await refresh()), ...(++calls === 2 ? change : {}) });
    await assert.rejects(runPhotoMigrationBatches(f.options), /review changed/);
    assert.equal(f.state.preparations, 1);
    assert.equal(f.state.calls, 2);
  }
  const f = processingFixture();
  let expired = false;
  f.options.now = () => Date.parse(expired ? "2100-01-01T00:00:00Z" : "2026-11-02T00:00:00Z");
  f.options.prepareProcessingRecovery = async () => {
    f.state.preparations++;
    expired = true;
  };
  assert.equal(await runPhotoMigrationBatches(f.options), "permit-changed");
  assert.equal(f.state.preparations, 1);
  assert.equal(f.state.calls, 2);
});
