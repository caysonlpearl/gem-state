import test from "node:test";
import assert from "node:assert/strict";
import { readFile, writeFile, mkdtemp, stat, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { PGlite } from "@electric-sql/pglite";
import {
  buildPhotoSourceCleanupReview as review,
  CLEANUP_REFERENCE_RELATIONS,
} from "../src/lib/photo-source-cleanup-review.server.mjs";

const project = "udxxfuticbxwiehoepeg";
const runIds = ["dd2be1fa-2c6d-4fad-b861-f25b3907b1f5", "20a1e9c0-5bef-43c7-a172-64bf8c62cddc"];
const cutoff = "2026-11-04T03:56:00.000Z";
const now = new Date("2026-11-04T04:00:00.000Z");
const options = { projectRef: project, runIds, notBefore: cutoff };
const sha = "a".repeat(64),
  thumbSha = "b".repeat(64),
  partition = "c".repeat(64);
function fixture() {
  const source = {
    bucket: "listing-media",
    path: "owner/photo.jpg",
    bytes: 200,
    contentType: "image/jpeg",
    etag: "d".repeat(32),
    updatedAt: "2026-11-01T10:00:00.123456+00:00",
  };
  const receipt = {
    bucket: source.bucket,
    path: source.path,
    bytes: 200,
    contentType: source.contentType,
    sha256: sha,
    key: `original/v1/${partition}/${sha}`,
    sourceEtag: source.etag,
    sourceUpdatedAt: source.updatedAt,
    verifiedAt: "2026-11-02T10:00:00Z",
    thumbnail: {
      key: `thumbnail/v1/${partition}/${thumbSha}`,
      sha256: thumbSha,
      bytes: 100,
      contentType: "image/webp",
    },
  };
  return {
    schemaVersion: 1,
    kind: "photo-source-cleanup-snapshot",
    projectRef: project,
    capturedAt: now.toISOString(),
    scopeRunIds: runIds,
    referenceRelations: [...CLEANUP_REFERENCE_RELATIONS],
    runs: runIds.map((id) => ({
      id,
      totalGroups: 1,
      completedGroups: 1,
      failedGroups: 0,
      runningGroups: 0,
    })),
    controls: {
      checkedAt: now.toISOString(),
      readMode: "r2",
      uploadMode: "r2",
      copyPermitDisabled: true,
      sourceFallbackUntil: cutoff,
    },
    targetChecks: [
      {
        bucket: source.bucket,
        path: source.path,
        checkedAt: now.toISOString(),
        original: { key: receipt.key, bytes: 200, sha256: sha, matched: true },
        thumbnail: { ...receipt.thumbnail, matched: true },
      },
    ],
    objects: [
      {
        source,
        approvals: [{ runId: runIds[0], ordinal: 0, status: "complete", metadata: { ...source } }],
        receipt,
        references: [{ kind: "listing_media", count: 1 }],
        pendingOperations: [],
      },
    ],
  };
}

test("a fully checked post-retention review preserves live references but never authorizes deletion", () => {
  const result = review(fixture(), options, now);
  assert.equal(result.reviewReady, true);
  assert.equal(result.deletionAuthorized, false);
  assert.equal(result.summary.metadataCandidates, 1);
  assert.deepEqual(result.candidates[0].references, [{ kind: "listing_media", count: 1 }]);
  assert.match(result.manifestSha256, /^[a-f0-9]{64}$/);
  assert.match(result.removalScopeSha256, /^[a-f0-9]{64}$/);
});
test("refreshing observations preserves the exact removal scope and changes the audit manifest", () => {
  const first = fixture();
  first.objects[0].references.push({ kind: "import_public", count: 2 });
  const later = structuredClone(first);
  later.capturedAt = "2026-11-04T04:02:00.000Z";
  later.controls.checkedAt = later.capturedAt;
  later.targetChecks[0].checkedAt = later.capturedAt;
  later.objects[0].receipt.verifiedAt = "2026-11-04T04:01:00.000Z";
  later.objects[0].references.reverse();
  const before = review(first, options, now);
  const after = review(later, options, new Date(later.capturedAt));
  assert.equal(before.reviewReady, true);
  assert.equal(after.reviewReady, true);
  assert.equal(after.removalScopeSha256, before.removalScopeSha256);
  assert.notEqual(after.manifestSha256, before.manifestSha256);
  assert.notEqual(after.snapshotSha256, before.snapshotSha256);
  assert.equal(after.deletionAuthorized, false);
});
test("removal scope binds source versions, targets, migration and reference counts", () => {
  const baseline = review(fixture(), options, now).removalScopeSha256;
  for (const change of [
    (s) => {
      s.objects[0].source.bytes++;
      s.objects[0].receipt.bytes++;
    },
    (s) => {
      s.objects[0].source.etag = "e".repeat(32);
      s.objects[0].receipt.sourceEtag = s.objects[0].source.etag;
    },
    (s) => {
      s.objects[0].source.updatedAt = "2026-11-01T10:00:00.123457Z";
      s.objects[0].receipt.sourceUpdatedAt = s.objects[0].source.updatedAt;
    },
    (s) => {
      s.objects[0].source.path = "owner/other.jpg";
      s.objects[0].receipt.path = s.objects[0].source.path;
    },
    (s) => {
      s.objects[0].receipt.key = `original/v1/${"e".repeat(64)}/${sha}`;
    },
    (s) => {
      s.objects[0].receipt.sha256 = "e".repeat(64);
      s.objects[0].receipt.key = `original/v1/${partition}/${"e".repeat(64)}`;
    },
    (s) => {
      s.objects[0].receipt.thumbnail.bytes++;
    },
    (s) => {
      s.objects[0].receipt.thumbnail.key = `thumbnail/v1/${"e".repeat(64)}/${thumbSha}`;
    },
    (s) => {
      s.objects[0].references[0].count++;
    },
    (s) => {
      s.objects[0].approvals[0].runId = runIds[1];
    },
  ]) {
    const snapshot = fixture();
    change(snapshot);
    snapshot.objects[0].approvals[0].metadata = { ...snapshot.objects[0].source };
    snapshot.targetChecks = [];
    const result = review(snapshot, options, now);
    assert.equal(result.summary.metadataCandidates, 1);
    assert.notEqual(result.removalScopeSha256, baseline);
  }
  const otherProject = fixture();
  otherProject.projectRef = "x".repeat(20);
  assert.notEqual(
    review(otherProject, { ...options, projectRef: otherProject.projectRef }, now)
      .removalScopeSha256,
    baseline,
  );
  assert.notEqual(
    review(fixture(), { ...options, notBefore: "2026-11-04T03:55:00Z" }, now).removalScopeSha256,
    baseline,
  );
});
test("a stable removal fingerprint cannot replace fresh successful checks or approval", () => {
  const good = review(fixture(), options, now);
  for (const change of [
    (s) => {
      s.targetChecks[0].original.matched = false;
    },
    (s) => {
      s.targetChecks[0].checkedAt = "2026-11-04T03:30:00Z";
    },
    (s) => {
      s.controls.readMode = "supabase";
    },
    (s) => {
      s.capturedAt = "2026-11-04T03:55:00Z";
    },
  ]) {
    const snapshot = fixture();
    change(snapshot);
    const result = review(snapshot, options, now);
    assert.equal(result.removalScopeSha256, good.removalScopeSha256);
    assert.equal(result.reviewReady, false);
    assert.equal(result.deletionAuthorized, false);
  }
});
test("retention, stale/future evidence and runtime rollback block final review", () => {
  for (const change of [
    (s) => {
      s.capturedAt = "2026-11-04T03:55:59Z";
    },
    (s) => {
      s.capturedAt = "2026-11-04T03:40:00Z";
    },
    (s) => {
      s.capturedAt = "2026-11-04T04:00:01Z";
    },
    (s) => {
      s.controls.readMode = "supabase";
    },
    (s) => {
      s.controls.copyPermitDisabled = false;
    },
    (s) => {
      s.controls.sourceFallbackUntil = "2026-11-05T03:56:00Z";
    },
    (s) => {
      delete s.controls;
    },
    (s) => {
      s.runs[0].runningGroups = 1;
    },
  ]) {
    const s = fixture();
    change(s);
    assert.equal(review(s, options, now).reviewReady, false);
  }
  const result = review(fixture(), options, new Date("2026-11-04T03:55:00Z"));
  assert.ok(result.gates.includes("retention-cutoff-not-reached"));
});
test("changed or unapproved sources and unfinished operations are excluded individually", () => {
  for (const change of [
    (s) => {
      s.objects[0].source.bytes++;
    },
    (s) => {
      s.objects[0].source.etag = "e".repeat(32);
    },
    (s) => {
      s.objects[0].source.updatedAt = "2026-11-01T10:00:00.123457Z";
    },
    (s) => {
      s.objects[0].approvals = [];
    },
    (s) => {
      s.objects[0].approvals.push(s.objects[0].approvals[0]);
    },
    (s) => {
      s.objects[0].approvals[0].status = "running";
    },
    (s) => {
      s.objects[0].approvals[0].ordinal = 1;
    },
    (s) => {
      s.objects[0].pendingOperations = ["claim-incomplete"];
    },
    (s) => {
      s.objects[0].pendingOperations = ["upload-incomplete"];
    },
  ]) {
    const s = fixture();
    change(s);
    const result = review(s, options, now);
    assert.equal(result.summary.metadataCandidates, 0);
    assert.equal(result.summary.excludedObjects, 1);
  }
});
test("a receipt alone is insufficient: current exact original and thumbnail checks are required", () => {
  for (const change of [
    (s) => {
      s.targetChecks = [];
    },
    (s) => {
      s.targetChecks[0].original.matched = false;
    },
    (s) => {
      s.targetChecks[0].original.key = `original/v1/${partition}/${thumbSha}`;
    },
    (s) => {
      s.targetChecks[0].thumbnail.bytes++;
    },
    (s) => {
      s.targetChecks[0].checkedAt = "2026-11-04T03:30:00Z";
    },
  ]) {
    const s = fixture();
    change(s);
    const result = review(s, options, now);
    assert.equal(result.summary.pendingR2Checks, 1);
    assert.equal(result.reviewReady, false);
  }
  for (const change of [
    (s) => {
      s.objects[0].receipt = null;
    },
    (s) => {
      s.objects[0].receipt.sourceEtag = null;
    },
    (s) => {
      s.objects[0].receipt.sourceUpdatedAt = "2026-11-01T10:00:00.123455Z";
    },
    (s) => {
      s.objects[0].receipt.thumbnail = null;
    },
    (s) => {
      s.objects[0].receipt.key = "arbitrary/key";
    },
  ]) {
    const s = fixture();
    change(s);
    assert.equal(review(s, options, now).summary.metadataCandidates, 0);
  }
});
test("wrong scope, missing coverage, duplicate rows/checks and unsafe paths fail closed", () => {
  for (const change of [
    (s) => {
      s.projectRef = "x".repeat(20);
    },
    (s) => {
      s.scopeRunIds = [runIds[0]];
    },
    (s) => {
      s.referenceRelations.pop();
    },
    (s) => {
      s.objects.push(s.objects[0]);
    },
    (s) => {
      s.targetChecks.push(s.targetChecks[0]);
    },
    (s) => {
      s.objects[0].source.path = "../other/photo.jpg";
    },
    (s) => {
      delete s.objects[0].references;
    },
    (s) => {
      s.objects[0].source.updatedAt = "2026-02-31T00:00:00Z";
    },
  ]) {
    const s = fixture();
    change(s);
    assert.throws(() => review(s, options, now), /Invalid source-cleanup/);
  }
});
test("the CLI creates a private review file, exposes no paths in stdout and refuses overwrite", async () => {
  const dir = await mkdtemp(join(tmpdir(), "photo-cleanup-review-"));
  try {
    const input = join(dir, "snapshot.json"),
      output = join(dir, "review.json");
    await writeFile(input, JSON.stringify(fixture()));
    const args = [
      "scripts/storage-source-cleanup-review.mjs",
      "--snapshot",
      input,
      "--project",
      project,
      "--runs",
      runIds.join(","),
      "--not-before",
      cutoff,
      "--output",
      output,
    ];
    const first = spawnSync(process.execPath, args, { encoding: "utf8" });
    assert.equal(first.status, 0, first.stderr);
    assert.equal((await stat(output)).mode & 0o777, 0o600);
    assert.equal(first.stdout.includes("owner/photo.jpg"), false);
    assert.equal(JSON.parse(await readFile(output, "utf8")).deletionAuthorized, false);
    const again = spawnSync(process.execPath, args, { encoding: "utf8" });
    assert.notEqual(again.status, 0);
    assert.match(again.stderr, /EEXIST/);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("the actual snapshot SQL includes all references and unfinished journals/tickets/migrations", async () => {
  const db = new PGlite();
  try {
    await db.exec(`CREATE SCHEMA storage;
      CREATE TABLE storage.objects(bucket_id text,name text,metadata jsonb,updated_at timestamptz);
      CREATE TABLE photo_migration_runs(id uuid,total_groups int,completed_groups int,running_groups int,failed_groups int);
      CREATE TABLE photo_migration_items(run_id uuid,ordinal int,status text,entries jsonb);
      CREATE TABLE photo_object_receipts(bucket text,path text,r2_key text,sha256 text,byte_size bigint,content_type text,
        source_etag text,source_updated_at timestamptz,verified_at timestamptz,thumbnail_key text,thumbnail_sha256 text,thumbnail_bytes bigint,thumbnail_content_type text);
      CREATE TABLE ask_media(storage_path text); CREATE TABLE listing_media(storage_path text);
      CREATE TABLE fb_marketplace_import_items(evidence_paths text[],public_paths text[]);
      CREATE TABLE seller_claim_transfers(status text,manifest jsonb);
      CREATE TABLE photo_upload_tickets(path text,verified_at timestamptz,payload jsonb);
      INSERT INTO storage.objects VALUES('listing-media','owner/photo.jpg','{"size":200,"eTag":"dddddddddddddddddddddddddddddddd","mimetype":"image/jpeg"}','2026-11-01T10:00:00.123456Z');
      INSERT INTO storage.objects VALUES('ask-evidence','owner/photo.jpg','{"size":200,"eTag":"dddddddddddddddddddddddddddddddd","mimetype":"image/jpeg"}','2026-11-01T10:00:00.123456Z');
      INSERT INTO ask_media VALUES('owner/photo.jpg');
      INSERT INTO listing_media VALUES('owner/photo.jpg');
      INSERT INTO fb_marketplace_import_items VALUES('{owner/photo.jpg}','{owner/photo.jpg}');
      INSERT INTO seller_claim_transfers VALUES('preparing','[{"bucket":"listing-media","old":"owner/photo.jpg","new":"new/photo.jpg"}]');
      INSERT INTO photo_upload_tickets VALUES('owner/photo.jpg',NULL,'{"evidence":true}');`);
    const s = fixture();
    for (const id of runIds)
      await db.query("INSERT INTO photo_migration_runs VALUES($1,1,1,0,0)", [id]);
    await db.query("INSERT INTO photo_migration_items VALUES($1,0,'complete',$2::jsonb)", [
      runIds[0],
      JSON.stringify([s.objects[0].source, { ...s.objects[0].source, bucket: "ask-evidence" }]),
    ]);
    await db.query("INSERT INTO photo_migration_items VALUES($1,1,'failed',$2::jsonb)", [
      runIds[1],
      JSON.stringify([s.objects[0].source]),
    ]);
    const sql = await readFile(
      new URL("../scripts/sql/photo-source-cleanup-snapshot.sql", import.meta.url),
      "utf8",
    );
    const snapshot = (await db.query(sql)).rows[0].snapshot;
    assert.equal(snapshot.objects.length, 2);
    const row = snapshot.objects.find((r) => r.source.bucket === "listing-media");
    const evidence = snapshot.objects.find((r) => r.source.bucket === "ask-evidence");
    assert.equal(row.approvals.length, 2);
    assert.deepEqual(
      row.references.map((r) => r.kind),
      ["import_public", "listing_media"],
    );
    assert.deepEqual(row.pendingOperations, [
      "claim-incomplete",
      "migration-incomplete",
      "upload-incomplete",
    ]);
    assert.deepEqual(
      evidence.references.map((r) => r.kind),
      ["ask_media", "import_evidence"],
    );
    assert.deepEqual(evidence.pendingOperations, ["upload-incomplete"]);
    assert.deepEqual(snapshot.referenceRelations, CLEANUP_REFERENCE_RELATIONS);
    assert.equal(snapshot.runs.length, 2);
  } finally {
    await db.close();
  }
});
