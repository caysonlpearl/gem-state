import test from "node:test";
import assert from "node:assert/strict";
import { readFile, writeFile, mkdtemp, stat, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import ts from "typescript";
import { PGlite } from "@electric-sql/pglite";
import {
  buildPhotoRemovalPlan,
  verifyPhotoRemovalProof,
  photoRemovalPermitAllowed,
} from "../src/lib/photo-source-removal-plan.server.mjs";
import { processPhotoSourceRemoval } from "../src/lib/photo-source-removal.server.mjs";
import {
  runApprovedSourceRemoval,
  photoRemovalSampleEntries,
} from "../src/lib/photo-source-removal.browser.ts";
import { fixture, runtime, project, runIds, actor, now } from "./photo-source-removal-fixture.mjs";

test("review packets bind exact copies, position, count, totals and scope even with odd tree widths", () => {
  const { plan } = fixture(7);
  assert.ok(plan.entries.every((entry) => verifyPhotoRemovalProof(plan.header, entry)));
  for (const change of [
    (p) => {
      p.entries[0].candidate.source.path = "owner/unapproved.jpg";
    },
    (p) => {
      p.entries[0].index = 1;
    },
    (p) => {
      p.entries[0].proof[0].side = "left";
    },
    (p) => {
      p.entries[0].proof[0].hash = "f".repeat(64);
    },
    (p) => {
      p.header.totalObjects++;
    },
    (p) => {
      p.header.totalBytes++;
    },
    (p) => {
      p.header.projectRef = "x".repeat(20);
    },
    (p) => {
      p.header.notBefore = "2026-11-04T03:55:00.000Z";
    },
    (p) => {
      p.entries[0].proof.push(p.entries[0].proof[0]);
    },
  ]) {
    const changed = structuredClone(plan);
    change(changed);
    assert.equal(verifyPhotoRemovalProof(changed.header, changed.entries[0]), false);
  }
  const one = fixture(1).plan;
  assert.deepEqual(one.entries[0].proof, []);
  assert.equal(verifyPhotoRemovalProof(one.header, one.entries[0]), true);
});
test("the read-only sample spans both stores with unique, bounded entries", () => {
  const entries = photoRemovalSampleEntries(fixture(19).plan);
  assert.equal(entries.length, 8);
  assert.equal(new Set(entries.map((e) => e.index)).size, 8);
  assert.equal(entries.filter((e) => e.candidate.source.bucket === "listing-media").length, 4);
  assert.equal(entries.filter((e) => e.candidate.source.bucket === "ask-evidence").length, 4);
  assert.equal(photoRemovalSampleEntries(fixture(1).plan).length, 1);
});
test("preview cannot become executable and packet preparation rejects a tampered review", () => {
  const value = fixture();
  value.review.reviewReady = false;
  value.review.gates = ["retention-cutoff-not-reached"];
  assert.throws(
    () => buildPhotoRemovalPlan(value.review, { projectRef: project, runIds }),
    /ready cleanup review/,
  );
  const preview = buildPhotoRemovalPlan(value.review, { projectRef: project, runIds }, true);
  assert.equal(preview.header.reviewReady, false);
  assert.equal(
    photoRemovalPermitAllowed(value.permit, preview.header, actor, now.getTime()),
    false,
  );
  value.review.candidates[0].references[0].count++;
  assert.throws(
    () => buildPhotoRemovalPlan(value.review, { projectRef: project, runIds }, true),
    /fingerprint/,
  );
});
test("removal requires the exact actor/packet permit, valid retention and a short fresh issue window", () => {
  const value = fixture(),
    header = value.plan.header;
  assert.equal(photoRemovalPermitAllowed(value.permit, header, actor, now.getTime()), true);
  for (const raw of ["", "{}", "null", "[]", "invalid"])
    assert.equal(photoRemovalPermitAllowed(raw, header, actor, now.getTime()), false);
  for (const change of [
    (p) => {
      p.actorId = runIds[0];
    },
    (p) => {
      p.rootSha256 = "f".repeat(64);
    },
    (p) => {
      p.projectRef = "x".repeat(20);
    },
    (p) => {
      p.totalObjects++;
    },
    (p) => {
      p.totalBytes++;
    },
    (p) => {
      p.runIds.reverse();
    },
    (p) => {
      p.notBefore = "2026-11-04T03:55:00.000Z";
    },
    (p) => {
      p.issuedAt = "2026-11-04T03:50:00.000Z";
    },
    (p) => {
      p.issuedAt = "2026-11-04T04:20:00.000Z";
    },
    (p) => {
      p.expiresAt = "2026-11-04T07:00:00.000Z";
    },
  ]) {
    const permit = JSON.parse(value.permit);
    change(permit);
    assert.equal(
      photoRemovalPermitAllowed(JSON.stringify(permit), header, actor, now.getTime()),
      false,
    );
  }
});
test("disabled deletion, invalid proofs and oversized/duplicate batches stop before storage access", async () => {
  const value = fixture(),
    state = runtime(value);
  for (const data of [
    { ...value.plan, mode: "remove", entries: [{ ...value.plan.entries[0], index: 999 }] },
    { ...value.plan, mode: "remove", entries: Array(9).fill(value.plan.entries[0]) },
    { ...value.plan, mode: "remove", entries: [value.plan.entries[0], value.plan.entries[0]] },
  ])
    await assert.rejects(processPhotoSourceRemoval(data, state.deps), /reviewed scope/);
  await assert.rejects(
    processPhotoSourceRemoval({ ...value.plan, mode: "remove" }, { ...state.deps, permit: "{}" }),
    /not enabled/,
  );
  assert.equal(state.snapshots, 0);
  assert.deepEqual(state.calls, []);
});
test("read-only checks work with deletion disabled and never remove a copy", async () => {
  const value = fixture(),
    state = runtime(value);
  const result = await processPhotoSourceRemoval(
    { ...value.plan, mode: "check" },
    { ...state.deps, permit: "{}" },
  );
  assert.equal(result.status, "checked");
  assert.equal(result.removalEnabled, false);
  assert.equal(result.removed, 0);
  assert.equal(result.results.length, 2);
  assert.equal(state.calls.filter((c) => c.kind === "remove").length, 0);
});
test("approved removal uses only exact Supabase paths, retains receipt/media data and reconciles replay", async () => {
  const value = fixture(),
    state = runtime(value),
    before = structuredClone(state.current.retainedRecords);
  const result = await processPhotoSourceRemoval({ ...value.plan, mode: "remove" }, state.deps);
  assert.equal(result.status, "complete");
  assert.equal(result.removed, 2);
  assert.equal(state.snapshots, 5);
  assert.deepEqual(state.current.retainedRecords, before);
  assert.deepEqual(
    state.calls.filter((c) => c.kind === "remove").map((c) => [c.bucket, ...c.paths]),
    [
      ["listing-media", "owner/photo-0.jpg"],
      ["ask-evidence", "owner/photo-1.jpg"],
    ],
  );
  const replay = await processPhotoSourceRemoval({ ...value.plan, mode: "remove" }, state.deps);
  assert.equal(replay.status, "complete");
  assert.equal(replay.removed, 0);
  assert.ok(replay.results.every((row) => row.status === "already-absent"));
  assert.equal(state.calls.filter((c) => c.kind === "remove").length, 2);
});
test("changes after HEADs, pending operations and unmatched R2 targets stop before removal", async () => {
  for (const kind of ["source", "reference", "pending", "r2"]) {
    const value = fixture(),
      state = runtime(value),
      original = state.deps.snapshot;
    let reads = 0;
    state.deps.snapshot = async (targets) => {
      if (++reads === 2) {
        if (kind === "source")
          state.current.retainedRecords[0].source.updatedAt = "2026-11-01T10:00:00.123457Z";
        if (kind === "reference") state.current.retainedRecords[0].references[0].count++;
        if (kind === "pending")
          state.current.retainedRecords[0].pendingOperations = ["claim-incomplete"];
      }
      return original(targets);
    };
    if (kind === "r2") state.deps.matches = async () => false;
    const result = await processPhotoSourceRemoval({ ...value.plan, mode: "remove" }, state.deps);
    assert.equal(result.status, "blocked", kind);
    assert.equal(result.removed, 0);
    assert.equal(state.calls.filter((c) => c.kind === "remove").length, 0);
  }
});
test("unacknowledged removals and failed post-checks preserve uncertainty and never retry", async () => {
  for (const kind of ["lost-ack", "post-failure", "lost-retained-row"]) {
    const value = fixture(),
      state = runtime(value),
      remove = state.deps.remove,
      snapshot = state.deps.snapshot;
    let reads = 0;
    if (kind === "lost-ack")
      state.deps.remove = async (...args) => {
        await remove(...args);
        throw new Error("internal detail");
      };
    state.deps.snapshot = async (targets) => {
      if (++reads === (kind === "lost-ack" ? 3 : 5)) {
        if (kind === "post-failure") throw new Error("internal detail");
        if (kind === "lost-retained-row") state.current.retainedRecords[0].references = [];
      }
      return snapshot(targets);
    };
    const result = await processPhotoSourceRemoval({ ...value.plan, mode: "remove" }, state.deps);
    assert.equal(result.status, "indeterminate", kind);
    assert.ok(state.calls.filter((c) => c.kind === "remove").length <= 2);
    assert.equal(JSON.stringify(result).includes("internal detail"), false);
    if (kind === "lost-ack")
      assert.ok(result.results.some((row) => row.status === "absent-after-attempt"));
  }
});
test("a source changed during the other bucket operation is preserved by a new immediate check", async () => {
  const value = fixture(),
    state = runtime(value),
    remove = state.deps.remove;
  state.deps.remove = async (bucket, paths) => {
    await remove(bucket, paths);
    if (bucket === "listing-media") {
      const evidence = state.current.retainedRecords.find(
        (row) => row.target.bucket === "ask-evidence",
      );
      evidence.source.updatedAt = "2026-11-01T10:00:00.123457Z";
    }
  };
  const result = await processPhotoSourceRemoval({ ...value.plan, mode: "remove" }, state.deps);
  assert.notEqual(result.status, "complete");
  assert.equal(result.removed, 1);
  assert.deepEqual(
    state.calls.filter((call) => call.kind === "remove").map((call) => call.bucket),
    ["listing-media"],
  );
  assert.equal(state.removed.has("ask-evidence/owner/photo-1.jpg"), false);
  assert.ok(result.results.some((row) => row.status === "blocked"));
});
test("R2 targets are refreshed after a prior bucket operation before deleting the next bucket", async () => {
  const value = fixture(),
    state = runtime(value),
    matches = state.deps.matches;
  state.deps.matches = async (bucket, ...rest) => {
    if (bucket === "ask-evidence" && state.calls.some((call) => call.kind === "remove"))
      return false;
    return matches(bucket, ...rest);
  };
  const result = await processPhotoSourceRemoval({ ...value.plan, mode: "remove" }, state.deps);
  assert.notEqual(result.status, "complete");
  assert.equal(result.removed, 1);
  assert.equal(state.calls.filter((call) => call.kind === "remove").length, 1);
  assert.equal(state.removed.has("ask-evidence/owner/photo-1.jpg"), false);
});
test("worst-shape eight-copy batches fit the worker subrequest allowance", async () => {
  for (const bucketFor of [
    "listing-media",
    "ask-evidence",
    (i) => (i === 7 ? "ask-evidence" : "listing-media"),
    (i) => (i === 7 ? "listing-media" : "ask-evidence"),
  ]) {
    const value = fixture(8, bucketFor),
      state = runtime(value);
    const result = await processPhotoSourceRemoval({ ...value.plan, mode: "remove" }, state.deps);
    assert.equal(result.status, "complete");
    assert.equal(result.removed, 8);
    // Includes authentication/role requests, every RPC, each R2 HEAD and Storage delete.
    const subrequests = 2 + state.snapshots + state.calls.length;
    assert.ok(subrequests <= 50, `Batch uses ${subrequests} subrequests`);
  }
});
test("browser removal is bounded, derives actual counts, stops on uncertainty and never retries", async () => {
  const value = fixture(19);
  let calls = 0;
  const progress = [];
  const run = () =>
    runApprovedSourceRemoval({
      plan: value.plan,
      shouldStop: () => false,
      progress: (p) => progress.push(p),
      step: async (data) => {
        calls++;
        assert.ok(data.entries.length <= 8);
        if (calls === 2) throw new Error("unknown transport result");
        return {
          status: "complete",
          removed: 9999,
          results: data.entries.map((e) => ({ index: e.index, status: "removed", reason: null })),
        };
      },
    });
  const result = await run();
  assert.equal(calls, 2);
  assert.equal(result.status, "unconfirmed");
  assert.equal(result.removed, 8);
  assert.equal(result.results.length, 8);
  assert.equal(result.unconfirmed.length, 8);
  assert.deepEqual(progress.at(-1), { removed: 8, alreadyAbsent: 0, reviewed: 8 });
});
test("manual resume retains exact membership proofs and records the server's stopping gates", async () => {
  const value = fixture(19);
  const sent = [];
  const result = await runApprovedSourceRemoval({
    plan: value.plan,
    startIndex: 8,
    shouldStop: () => false,
    progress: () => {},
    step: async (data) => {
      sent.push(data.entries.map((entry) => entry.index));
      assert.ok(data.entries.every((entry) => verifyPhotoRemovalProof(data.header, entry)));
      const stopped = sent.length === 2;
      return {
        status: stopped ? "blocked" : "complete",
        gates: stopped ? ["fresh-snapshot-required"] : [],
        results: data.entries.map((entry) => ({
          index: entry.index,
          status: stopped ? "not-attempted" : "removed",
          reason: null,
        })),
      };
    },
  });
  assert.deepEqual(sent, [
    [8, 9, 10, 11, 12, 13, 14, 15],
    [16, 17, 18],
  ]);
  assert.equal(result.startIndex, 8);
  assert.equal(result.removed, 8);
  assert.equal(result.status, "blocked");
  assert.deepEqual(result.gates, ["fresh-snapshot-required"]);
  assert.deepEqual(result.unconfirmed, []);
});
test("invalid resume boundaries never issue a storage step", async () => {
  const value = fixture(19);
  let calls = 0;
  for (const startIndex of [-1, 1, 19, 24, NaN])
    await assert.rejects(
      runApprovedSourceRemoval({
        plan: value.plan,
        startIndex,
        shouldStop: () => false,
        progress: () => {},
        step: async () => {
          calls++;
          throw Error("must not run");
        },
      }),
      /valid batch boundary/,
    );
  assert.equal(calls, 0);
});
test("the offline packet CLI produces a private preview and never overwrites existing evidence", async () => {
  const dir = await mkdtemp(join(tmpdir(), "photo-removal-packet-"));
  try {
    const value = fixture();
    value.review.reviewReady = false;
    value.review.gates = ["retention-cutoff-not-reached"];
    const review = join(dir, "review.json"),
      output = join(dir, "plan.json");
    await writeFile(review, JSON.stringify(value.review));
    const args = [
      "scripts/storage-source-removal-plan.mjs",
      "--review",
      review,
      "--project",
      project,
      "--runs",
      runIds.join(","),
      "--output",
      output,
      "--preview",
    ];
    const first = spawnSync(process.execPath, args, { encoding: "utf8" });
    assert.equal(first.status, 0, first.stderr);
    assert.equal((await stat(output)).mode & 0o777, 0o600);
    assert.equal(first.stdout.includes("owner/photo"), false);
    assert.equal(JSON.parse(await readFile(output, "utf8")).header.reviewReady, false);
    assert.notEqual(spawnSync(process.execPath, args, { encoding: "utf8" }).status, 0);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("the real read-only SQL RPC bounds scope, denies public callers and preserves receipts after source removal", async () => {
  const db = new PGlite();
  try {
    await db.exec(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
      CREATE SCHEMA storage;
      CREATE TABLE storage.objects(bucket_id text,name text,metadata jsonb,updated_at timestamptz);
      CREATE TABLE photo_migration_runs(id uuid,total_groups int,completed_groups int,running_groups int,failed_groups int);
      CREATE TABLE photo_migration_items(run_id uuid,ordinal int,status text,entries jsonb);
      CREATE TABLE photo_object_receipts(bucket text,path text,r2_key text,sha256 text,byte_size bigint,content_type text,
       source_etag text,source_updated_at timestamptz,verified_at timestamptz,thumbnail_key text,thumbnail_sha256 text,thumbnail_bytes bigint,thumbnail_content_type text);
      CREATE TABLE ask_media(storage_path text); CREATE TABLE listing_media(storage_path text);
      CREATE TABLE fb_marketplace_import_items(evidence_paths text[],public_paths text[]);
      CREATE TABLE seller_claim_transfers(status text,manifest jsonb);
      CREATE TABLE photo_upload_tickets(path text,verified_at timestamptz,payload jsonb);`);
    const value = fixture(3);
    for (const run of value.snapshot.runs)
      await db.query("INSERT INTO photo_migration_runs VALUES($1,$2,$2,0,0)", [
        run.id,
        run.totalGroups,
      ]);
    for (const row of value.snapshot.objects) {
      const s = row.source,
        r = row.receipt;
      await db.query("INSERT INTO storage.objects VALUES($1,$2,$3::jsonb,$4::timestamptz)", [
        s.bucket,
        s.path,
        JSON.stringify({ size: s.bytes, eTag: s.etag, mimetype: s.contentType }),
        s.updatedAt,
      ]);
      await db.query("INSERT INTO photo_migration_items VALUES($1,$2,'complete',$3::jsonb)", [
        row.approvals[0].runId,
        row.approvals[0].ordinal,
        JSON.stringify([s]),
      ]);
      await db.query(
        "INSERT INTO photo_object_receipts VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)",
        [
          s.bucket,
          s.path,
          r.key,
          r.sha256,
          r.bytes,
          r.contentType,
          r.sourceEtag,
          r.sourceUpdatedAt,
          r.verifiedAt,
          r.thumbnail?.key ?? null,
          r.thumbnail?.sha256 ?? null,
          r.thumbnail?.bytes ?? null,
          r.thumbnail?.contentType ?? null,
        ],
      );
      await db.query(
        `INSERT INTO ${s.bucket === "listing-media" ? "listing_media" : "ask_media"} VALUES($1)`,
        [s.path],
      );
    }
    await db.exec(
      await readFile(
        new URL(
          "../supabase/migrations/20261103093000_add_readonly_photo_cleanup_targets.sql",
          import.meta.url,
        ),
        "utf8",
      ),
    );
    const targets = value.snapshot.objects.slice(0, 2).map((row) => row.target);
    for (const role of ["anon", "authenticated"]) {
      await db.exec(`SET ROLE ${role}`);
      await assert.rejects(
        db.query("SELECT public.photo_source_cleanup_targets($1::jsonb) result", [
          JSON.stringify(targets),
        ]),
        /permission denied/,
      );
      await db.exec("RESET ROLE");
    }
    await db.exec("SET ROLE service_role");
    const read = async (targets) =>
      (
        await db.query("SELECT public.photo_source_cleanup_targets($1::jsonb) result", [
          JSON.stringify(targets),
        ])
      ).rows[0].result;
    const before = await read(targets);
    assert.equal(before.objects.length, 2);
    assert.equal(before.retainedRecords.length, 2);
    assert.ok(
      before.objects.every((row) =>
        targets.some((t) => t.path === row.source.path && t.bucket === row.source.bucket),
      ),
    );
    assert.match(before.objects[0].source.updatedAt, /123456/);
    for (const invalid of [
      [],
      Array(9).fill(targets[0]),
      [targets[0], targets[0]],
      [{ bucket: "other", path: "a" }],
      [{ bucket: "listing-media", path: "../secret" }],
    ])
      await assert.rejects(read(invalid), /Invalid cleanup target scope/);
    await db.exec("RESET ROLE");
    await db.query("DELETE FROM storage.objects WHERE bucket_id=$1 AND name=$2", [
      targets[0].bucket,
      targets[0].path,
    ]);
    // Only the offline fixture simulates Storage API effects; the RPC is read-only.
    const after = await read(targets);
    assert.equal(after.objects.length, 1);
    assert.equal(after.retainedRecords.length, 2);
    const absent = after.retainedRecords.find((row) => row.target.path === targets[0].path);
    assert.equal(absent.source, null);
    assert.ok(absent.receipt);
    assert.equal(absent.references[0].count, 1);
    await db.query("INSERT INTO seller_claim_transfers VALUES('preparing',$1::jsonb)", [
      JSON.stringify([{ bucket: targets[1].bucket, old: targets[1].path, new: "new/photo.jpg" }]),
    ]);
    const pending = await read(targets);
    assert.deepEqual(
      pending.retainedRecords.find((row) => row.target.path === targets[1].path).pendingOperations,
      ["claim-incomplete"],
    );
  } finally {
    await db.close();
  }
});

test("the actual server action denies non-admin/wrong-project/disabled removal before privileged access", async () => {
  const source = readFileSync(
    new URL("../src/lib/photo-storage.functions.ts", import.meta.url),
    "utf8",
  );
  const ast = ts.createSourceFile("functions.ts", source, ts.ScriptTarget.Latest, true);
  const node = ast.statements.find(
    (n) =>
      ts.isVariableStatement(n) &&
      n.declarationList.declarations.some(
        (d) => d.name.getText(ast) === "processPhotoSourceCleanup",
      ),
  );
  let storageCalls = 0;
  const headers = [];
  const context = vm.createContext({
    URL,
    Date,
    requireSupabaseAuth: "auth",
    removalInputSchema: { parse: (v) => v },
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
        name.includes("SUPABASE_URL") ? `https://${project}.supabase.co` : "{}",
    },
    planRuntime: { photoRemovalPermitAllowed },
    getPhotoStorageModule: async () => {
      storageCalls++;
      throw new Error("must not access storage");
    },
    storageRuntime: async () => {
      storageCalls++;
      throw new Error("must not access storage");
    },
  });
  const executable = node
    .getText(ast)
    .replace(/^export /, "")
    .replace('await import("@tanstack/react-start/server")', "response")
    .replace('await import("./runtime-env.server")', "environment")
    .replace('await import("./photo-source-removal-plan.server.mjs")', "planRuntime");
  vm.runInContext(
    ts.transpile(executable, { target: ts.ScriptTarget.ES2022 }) +
      ";globalThis.action=processPhotoSourceCleanup",
    context,
  );
  const value = fixture();
  const args = (allowed) => ({
    data: { ...value.plan, mode: "remove" },
    context: { userId: actor, supabase: { rpc: async () => ({ data: allowed, error: null }) } },
  });
  await assert.rejects(context.action(args(false)), /Administrator access/);
  const wrong = args(true);
  wrong.data.header = { ...wrong.data.header, projectRef: "x".repeat(20) };
  await assert.rejects(context.action(wrong), /project does not match/);
  await assert.rejects(context.action(args(true)), /not enabled/);
  assert.equal(storageCalls, 0);
  assert.ok(
    headers.some(([name, value]) => name === "Cache-Control" && value === "private, no-store"),
  );
});
