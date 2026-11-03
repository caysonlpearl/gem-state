import test from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import ts from "typescript";
import { readFileSync } from "node:fs";
import {
  probePhotoSourceCleanupTargets,
  cleanupCopyPermitDisabled,
} from "../src/lib/photo-source-cleanup-probe.server.mjs";
import { runPhotoCleanupChecks } from "../src/lib/photo-source-cleanup.browser.ts";

const projectRef = "udxxfuticbxwiehoepeg";
const sha = "a".repeat(64),
  thumbSha = "b".repeat(64),
  partition = "c".repeat(64);
const targets = (n) =>
  Array.from({ length: n }, (_, i) => ({ bucket: "listing-media", path: `owner/${i}.jpg` }));
const receipt = (target) => ({
  ...target,
  key: `original/v1/${partition}/${sha}`,
  bytes: 200,
  sha256: sha,
  thumbnail: { key: `thumbnail/v1/${partition}/${thumbSha}`, bytes: 100, sha256: thumbSha },
});
const checked = (target) => ({
  ...target,
  checkedAt: new Date().toISOString(),
  original: { ...receipt(target), matched: true },
  thumbnail: { ...receipt(target).thumbnail, matched: true },
});
const controls = {
  checkedAt: new Date().toISOString(),
  projectRef,
  readMode: "r2",
  uploadMode: "r2",
  copyPermitDisabled: true,
  sourceFallbackUntil: "2026-11-04T03:56:00.000Z",
};

test("bounded probes use current receipt keys, deduplicate requests and never invoke body/write operations", async () => {
  const requested = targets(16);
  let active = 0,
    maximum = 0,
    heads = 0;
  const deps = {
    projectRef,
    receipts: async (values) => values.map(receipt),
    matches: async () => {
      active++;
      maximum = Math.max(maximum, active);
      heads++;
      await new Promise((resolve) => setTimeout(resolve, 1));
      active--;
      return true;
    },
    download() {
      assert.fail("No photo body downloads");
    },
    put() {
      assert.fail("No writes");
    },
    delete() {
      assert.fail("No deletions");
    },
  };
  const result = await probePhotoSourceCleanupTargets({ projectRef, targets: requested }, deps);
  assert.equal(result.verified, 16);
  assert.equal(heads, 32);
  assert.ok(maximum <= 8);
  for (let i = 0; i < 16; i++) assert.equal(result.checks[i].path, requested[i].path);
  heads = 0;
  const deduped = await probePhotoSourceCleanupTargets(
    { projectRef, targets: [requested[0], requested[0]] },
    deps,
  );
  assert.equal(deduped.checks.length, 1);
  assert.equal(heads, 2);
});
test("wrong project, oversized batches and invalid paths stop before privileged reads", async () => {
  let reads = 0;
  for (const input of [
    { projectRef: "x".repeat(20), targets: targets(1) },
    { projectRef, targets: targets(17) },
    { projectRef, targets: [{ bucket: "avatars", path: "one" }] },
    { projectRef, targets: [{ bucket: "listing-media", path: "../one" }] },
  ])
    await assert.rejects(() =>
      probePhotoSourceCleanupTargets(input, {
        projectRef,
        receipts() {
          reads++;
        },
      }),
    );
  assert.equal(reads, 0);
});
test("private evidence checks its original without inventing a listing preview", async () => {
  const target = { bucket: "ask-evidence", path: "owner/evidence.jpg" };
  let heads = 0;
  const result = await probePhotoSourceCleanupTargets(
    { projectRef, targets: [target] },
    {
      projectRef,
      receipts: async () => [{ ...receipt(target), thumbnail: null }],
      matches: async () => {
        heads++;
        return true;
      },
    },
  );
  assert.equal(result.verified, 1);
  assert.equal(heads, 1);
  assert.equal(result.checks[0].thumbnail, null);
});
test("missing, invalid, mismatched and unavailable targets cannot become verified", async () => {
  const target = targets(1)[0];
  const cases = [
    { rows: [], matches: async () => true },
    { rows: [{ ...receipt(target), thumbnail: null }], matches: async () => true },
    { rows: [{ ...receipt(target), key: "unsafe/key" }], matches: async () => true },
    { rows: [receipt(target)], matches: async () => false },
    {
      rows: [receipt(target)],
      matches: async () => {
        throw new Error("private provider error");
      },
    },
  ];
  for (const value of cases) {
    const result = await probePhotoSourceCleanupTargets(
      { projectRef, targets: [target] },
      { projectRef, receipts: async () => value.rows, matches: value.matches },
    );
    assert.equal(result.verified, 0);
    assert.equal(JSON.stringify(result).includes("private provider error"), false);
  }
  await assert.rejects(() =>
    probePhotoSourceCleanupTargets(
      { projectRef, targets: [target] },
      {
        projectRef,
        receipts: async () => {
          throw new Error("read unavailable");
        },
      },
    ),
  );
});
test("copying is reported disabled only for an absent or explicitly empty permit", () => {
  for (const value of ["", "  ", "{}", " { } "])
    assert.equal(cleanupCopyPermitDisabled(value), true);
  for (const value of ["invalid", "null", "[]", '{"runId":"one"}'])
    assert.equal(cleanupCopyPermitDisabled(value), false);
});
test("browser batches are bounded, preserve scope and derive successes from actual checks", async () => {
  const requests = [],
    progress = [];
  const result = await runPhotoCleanupChecks({
    projectRef,
    targets: targets(35),
    shouldStop: () => false,
    progress: (value) => progress.push(value),
    probe: async (data) => {
      requests.push(data);
      return { controls, checks: data.targets.map(checked), verified: 9999 };
    },
  });
  assert.equal(result.status, "complete");
  assert.equal(result.verified, 35);
  assert.deepEqual(
    requests.map((r) => r.targets.length),
    [16, 16, 3],
  );
  assert.ok(requests.every((r) => r.projectRef === projectRef));
  assert.deepEqual(progress.at(-1), { checked: 35, verified: 35 });
});
test("stop, mismatch and network failure preserve completed checks without continuing", async () => {
  for (const mode of ["stop", "mismatch", "error", "binding"]) {
    let calls = 0,
      stop = false;
    const result = await runPhotoCleanupChecks({
      projectRef,
      targets: targets(35),
      shouldStop: () => stop,
      progress: () => {
        if (mode === "stop") stop = true;
      },
      probe: async (data) => {
        calls++;
        if (mode === "error" && calls === 2) throw new Error("secret must not be exposed");
        const checks = data.targets.map(checked);
        if (mode === "mismatch") checks[0].thumbnail.matched = false;
        if (mode === "binding") checks[0].path = "other/photo.jpg";
        return { controls, checks };
      },
    });
    assert.equal(
      result.status,
      { stop: "stopped", mismatch: "unverified", error: "error", binding: "error" }[mode],
    );
    assert.equal(calls, mode === "error" ? 2 : 1);
    assert.equal(result.checks.length, mode === "binding" ? 0 : 16);
    assert.equal(JSON.stringify(result).includes("secret must not be exposed"), false);
  }
});
test("actual server handler denies non-admin callers before storage access and uses private uncached responses", async () => {
  const source = readFileSync(
    new URL("../src/lib/photo-storage.functions.ts", import.meta.url),
    "utf8",
  );
  const ast = ts.createSourceFile("functions.ts", source, ts.ScriptTarget.Latest, true);
  const node = ast.statements.find(
    (n) =>
      ts.isVariableStatement(n) &&
      n.declarationList.declarations.some(
        (d) => d.name.getText(ast) === "checkPhotoCleanupTargets",
      ),
  );
  let runtime = 0,
    headers = [];
  const c = vm.createContext({
    URL,
    Date,
    Set,
    Number,
    String,
    AbortSignal,
    requireSupabaseAuth: "auth",
    cleanupProbeInputSchema: { parse: (input) => input },
    createServerFn: () => ({
      middleware() {
        return this;
      },
      validator() {
        return this;
      },
      handler: (fn) => fn,
    }),
    response: { setResponseHeader: (...args) => headers.push(args) },
    environment: {
      serverEnv: (name) =>
        name.includes("SUPABASE_URL") ? `https://${projectRef}.supabase.co` : "{}",
    },
    probeRuntime: { probePhotoSourceCleanupTargets, cleanupCopyPermitDisabled },
    getPhotoStorageModule: async () => ({
      currentPhotoMode: () => "r2",
      currentPhotoUploadMode: () => "r2",
      currentPhotoSourceFallbackPolicy: () => ({
        expiresAt: Date.parse(controls.sourceFallbackUntil),
      }),
    }),
    storageRuntime: async () => {
      runtime++;
      return {
        db: {
          from: () => ({
            select() {
              return this;
            },
            in() {
              return this;
            },
            abortSignal() {
              return this;
            },
            retry: async () => ({
              data: [
                {
                  bucket: "listing-media",
                  path: "owner/0.jpg",
                  r2_key: receipt(targets(1)[0]).key,
                  sha256: sha,
                  byte_size: 200,
                  thumbnail_key: receipt(targets(1)[0]).thumbnail.key,
                  thumbnail_bytes: 100,
                  thumbnail_sha256: thumbSha,
                },
              ],
              error: null,
            }),
          }),
        },
        r2: { matches: async () => true },
      };
    },
  });
  const executable = node
    .getText(ast)
    .replace(/^export /, "")
    .replace('await import("@tanstack/react-start/server")', "response")
    .replace('await import("./runtime-env.server")', "environment")
    .replace('await import("./photo-source-cleanup-probe.server.mjs")', "probeRuntime");
  vm.runInContext(
    ts.transpile(executable, { target: ts.ScriptTarget.ES2022 }) +
      ";globalThis.check=checkPhotoCleanupTargets",
    c,
  );
  const args = (allowed) => ({
    data: { projectRef, targets: targets(1) },
    context: {
      userId: "owner",
      supabase: {
        rpc: async () => ({ data: allowed, error: null }),
      },
    },
  });
  await assert.rejects(() => c.check(args(false)), /Administrator access required/);
  assert.equal(runtime, 0);
  await assert.rejects(
    () => c.check({ ...args(true), data: { projectRef: "x".repeat(20), targets: targets(1) } }),
    /project does not match/,
  );
  assert.equal(runtime, 0);
  const result = await c.check(args(true));
  assert.equal(runtime, 1);
  assert.equal(result.verified, 1);
  assert.equal(result.controls.copyPermitDisabled, true);
  assert.equal(result.controls.projectRef, projectRef);
  assert.ok(
    headers.some(([name, value]) => name === "Cache-Control" && value === "private, no-store"),
  );
});
