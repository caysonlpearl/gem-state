import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { test } from "node:test";

import { buildPhotoMigrationPlan } from "../scripts/storage-migration-plan.mjs";

const project = "abcdefghijklmnopqrst";
const row = {
  bucket: "listing-media",
  path: "seller/photo.jpg",
  bytes: 100,
  etag: '"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"',
  contentType: "image/jpeg",
  updatedAt: "2026-11-01T00:00:00Z",
};
const inventory = (objects) => ({
  schemaVersion: 1,
  projectRef: project,
  capturedAt: "2026-11-01T00:00:00Z",
  objects,
});

test("paired metadata produces two isolated targets and only a proposed transfer saving", () => {
  const plan = buildPhotoMigrationPlan(
    inventory([row, { ...row, bucket: "ask-evidence" }]),
    project,
  );
  assert.equal(plan.summary.sourceObjects, 2);
  assert.equal(plan.summary.proposedDownloads, 1);
  assert.equal(plan.summary.proposedDownloadBytes, 100);
  assert.equal(plan.summary.targetBytes, 200);
  assert.equal(plan.summary.pairedMetadataGroups, 1);
  assert.equal(plan.groups[0].source.bucket, "listing-media");
  assert.equal(plan.groups[0].targets.length, 2);
  assert.equal(plan.groups[0].verification, "not-downloaded-or-verified");
  assert.match(plan.gates.join(" "), /not byte verification/);
});

test("changed sizes, content types, missing ETags and unrelated paths never collapse downloads", () => {
  for (const change of [
    { bytes: 101 },
    { contentType: "image/png" },
    { etag: null },
    { etag: "different" },
    { etag: "opaque-multipart-2" },
    { path: "seller/other.jpg" },
  ]) {
    const plan = buildPhotoMigrationPlan(
      inventory([row, { ...row, bucket: "ask-evidence", ...change }]),
      project,
    );
    assert.equal(plan.summary.proposedDownloads, 2);
    assert.equal(plan.summary.pairedMetadataGroups, 0);
  }
});

test("approval digest is stable across export ordering and changes when source metadata changes", () => {
  const other = { ...row, bucket: "ask-evidence" };
  const a = buildPhotoMigrationPlan(inventory([row, other]), project);
  const b = buildPhotoMigrationPlan(inventory([other, row]), project);
  const changed = buildPhotoMigrationPlan(inventory([row, { ...other, bytes: 101 }]), project);
  assert.equal(a.inventorySha256, b.inventorySha256);
  assert.notEqual(a.inventorySha256, changed.inventorySha256);
});

test("wrong projects, missing sizes, duplicate rows and unsafe paths fail closed", () => {
  assert.throws(() => buildPhotoMigrationPlan(inventory([row]), "zzzzzzzzzzzzzzzzzzzz"), /project/);
  assert.throws(() => buildPhotoMigrationPlan(inventory([]), project), /no photo/);
  assert.throws(
    () => buildPhotoMigrationPlan({ ...inventory([row]), capturedAt: 0 }, project),
    /capture timestamp/,
  );
  for (const bad of [
    { bytes: null },
    { bytes: -1 },
    { bytes: Number.MAX_SAFE_INTEGER + 1 },
    { contentType: "text/html" },
    { updatedAt: null },
    { path: "../photo.jpg" },
    { path: "/photo.jpg" },
    { path: "seller//photo.jpg" },
    { path: "seller\\photo.jpg" },
    { bucket: "conversation-attachments" },
  ]) {
    assert.throws(() => buildPhotoMigrationPlan(inventory([{ ...row, ...bad }]), project));
  }
  assert.throws(() => buildPhotoMigrationPlan(inventory([row, row]), project), /duplicate/);
});

test("CLI writes a local preflight only, refuses overwrite and rejects execution flags", async () => {
  const directory = await mkdtemp(join(tmpdir(), "bluebird-storage-plan-"));
  try {
    const input = join(directory, "inventory.json");
    const output = join(directory, "plan.json");
    await writeFile(input, JSON.stringify(inventory([row])));
    const args = [
      "scripts/storage-migration-plan.mjs",
      "--inventory",
      input,
      "--project",
      project,
      "--output",
      output,
    ];
    const first = spawnSync(process.execPath, args, { encoding: "utf8" });
    assert.equal(first.status, 0, first.stderr);
    assert.equal(JSON.parse(await readFile(output, "utf8")).kind, "photo-migration-preflight-only");
    assert.equal(spawnSync(process.execPath, args, { encoding: "utf8" }).status, 1);
    assert.equal(
      spawnSync(process.execPath, [...args, "--execute", "true"], { encoding: "utf8" }).status,
      1,
    );
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
