import { createHash } from "node:crypto";
import {
  CLEANUP_REFERENCE_RELATIONS,
  buildPhotoSourceCleanupReview,
} from "../src/lib/photo-source-cleanup-review.server.mjs";
import { buildPhotoRemovalPlan } from "../src/lib/photo-source-removal-plan.server.mjs";
export const project = "udxxfuticbxwiehoepeg";
export const runIds = [
  "dd2be1fa-2c6d-4fad-b861-f25b3907b1f5",
  "20a1e9c0-5bef-43c7-a172-64bf8c62cddc",
];
export const cutoff = "2026-11-04T03:56:00.000Z";
export const actor = "11111111-2222-4333-8444-555555555555";
export const now = new Date("2026-11-04T04:01:00.000Z");
export function fixture(
  count = 2,
  bucketFor = (index) => (index % 2 ? "ask-evidence" : "listing-media"),
) {
  const objects = Array.from({ length: count }, (_, index) => {
    const bucket = typeof bucketFor === "function" ? bucketFor(index) : bucketFor,
      path = `owner/photo-${index}.jpg`;
    const source = {
      bucket,
      path,
      bytes: 200,
      etag: "d".repeat(32),
      contentType: "image/jpeg",
      updatedAt: "2026-11-01T10:00:00.123456Z",
    };
    const partition = createHash("sha256").update(path).digest("hex");
    const receipt = {
      bucket,
      path,
      bytes: 200,
      sha256: "a".repeat(64),
      key: `original/v1/${partition}/${"a".repeat(64)}`,
      contentType: "image/jpeg",
      sourceEtag: source.etag,
      sourceUpdatedAt: source.updatedAt,
      verifiedAt: "2026-11-02T10:00:00.000Z",
      thumbnail:
        bucket === "listing-media"
          ? {
              key: `thumbnail/v1/${partition}/${"b".repeat(64)}`,
              bytes: 100,
              sha256: "b".repeat(64),
              contentType: "image/webp",
            }
          : null,
    };
    return {
      target: { bucket, path },
      source,
      receipt,
      approvals: [
        { runId: runIds[0], ordinal: index, status: "complete", metadata: { ...source } },
      ],
      references: [{ kind: bucket === "listing-media" ? "listing_media" : "ask_media", count: 1 }],
      pendingOperations: [],
    };
  });
  const controls = {
    checkedAt: now.toISOString(),
    projectRef: project,
    readMode: "r2",
    uploadMode: "r2",
    copyPermitDisabled: true,
    sourceFallbackUntil: cutoff,
  };
  const snapshot = {
    schemaVersion: 1,
    kind: "photo-source-cleanup-snapshot",
    projectRef: project,
    capturedAt: "2026-11-04T04:00:00.000Z",
    scopeRunIds: runIds,
    referenceRelations: CLEANUP_REFERENCE_RELATIONS,
    runs: runIds.map((id) => ({
      id,
      totalGroups: count,
      completedGroups: count,
      failedGroups: 0,
      runningGroups: 0,
    })),
    objects,
    retainedRecords: structuredClone(objects),
    controls,
    targetChecks: objects.map((row) => ({
      ...row.target,
      checkedAt: now.toISOString(),
      original: { ...row.receipt, matched: true },
      thumbnail: row.receipt.thumbnail ? { ...row.receipt.thumbnail, matched: true } : null,
    })),
  };
  const review = buildPhotoSourceCleanupReview(
    snapshot,
    { projectRef: project, runIds, notBefore: cutoff },
    now,
  );
  const plan = buildPhotoRemovalPlan(review, { projectRef: project, runIds });
  const permit = JSON.stringify({
    kind: "photo-source-removal-permit",
    actorId: actor,
    projectRef: project,
    runIds: plan.header.runIds,
    notBefore: cutoff,
    rootSha256: plan.header.rootSha256,
    removalScopeSha256: plan.header.removalScopeSha256,
    totalObjects: plan.header.totalObjects,
    totalBytes: plan.header.totalBytes,
    reviewCapturedAt: plan.header.sourceCapturedAt,
    reviewGeneratedAt: plan.header.generatedAt,
    issuedAt: now.toISOString(),
    expiresAt: "2026-11-04T05:00:00.000Z",
  });
  return { snapshot, controls, review, plan, permit };
}
export function runtime(value = fixture()) {
  const removed = new Set(),
    calls = [],
    current = structuredClone(value.snapshot);
  let snapshots = 0;
  const deps = {
    projectRef: project,
    actorId: actor,
    permit: value.permit,
    now: () => now,
    controls: async () => structuredClone(value.controls),
    snapshot: async (targets) => {
      snapshots++;
      const result = structuredClone(current);
      result.capturedAt = now.toISOString();
      result.retainedRecords = result.retainedRecords.filter((row) =>
        targets.some((t) => t.bucket === row.target.bucket && t.path === row.target.path),
      );
      for (const row of result.retainedRecords)
        if (removed.has(`${row.target.bucket}/${row.target.path}`)) row.source = null;
      result.objects = result.retainedRecords.filter((row) => row.source);
      return result;
    },
    matches: async (bucket, key, bytes, sha256) => {
      calls.push({ kind: "head", bucket, key, bytes, sha256 });
      return true;
    },
    remove: async (bucket, paths) => {
      calls.push({ kind: "remove", bucket, paths });
      paths.forEach((path) => removed.add(`${bucket}/${path}`));
    },
  };
  return {
    deps,
    calls,
    removed,
    current,
    get snapshots() {
      return snapshots;
    },
  };
}
