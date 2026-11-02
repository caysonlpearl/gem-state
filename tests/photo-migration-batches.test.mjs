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
