import { createHash } from "node:crypto";
import { Buffer } from "node:buffer";

const BUCKETS = new Set(["listing-media", "ask-evidence"]);
export const CLEANUP_REFERENCE_RELATIONS = [
  "ask_media",
  "listing_media",
  "import_evidence",
  "import_public",
  "claim_transfers",
  "upload_tickets",
  "migration_items",
];
const SHA = /^[a-f0-9]{64}$/;
const UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-[1-5][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i;
const MAX_AGE = 15 * 60_000;
const fail = (message) => {
  throw new Error(`Invalid source-cleanup review: ${message}`);
};
const digest = (value) => createHash("sha256").update(JSON.stringify(value)).digest("hex");
const keyOf = (value) => `${value.bucket}/${value.path}`;
export { identity as normalizeCleanupTarget };
const imageType = (value) =>
  typeof value === "string" ? value.toLowerCase().replace(/^image\/jpg$/, "image/jpeg") : "";
const etag = (value) => (typeof value === "string" ? value.trim().replace(/^"|"$/g, "") : "");

// Preserve PostgreSQL microseconds: Date.parse alone loses sub-millisecond changes.
function instant(value) {
  if (typeof value !== "string") fail("timestamp is missing");
  const match = value.match(
    /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.(\d{1,6}))?(?:Z|[+-]\d{2}:\d{2})$/,
  );
  const millis = Date.parse(value);
  if (!match || !Number.isFinite(millis)) fail("timestamp is invalid");
  const [year, month, day, hour, minute, second] = value.slice(0, 19).split(/[-T:]/).map(Number);
  if (
    month < 1 ||
    month > 12 ||
    day < 1 ||
    day > new Date(Date.UTC(year, month, 0)).getUTCDate() ||
    hour > 23 ||
    minute > 59 ||
    second > 59
  )
    fail("timestamp is invalid");
  return {
    millis,
    canonical: `${new Date(millis).toISOString().slice(0, 19)}.${(match[1] ?? "").padEnd(6, "0")}Z`,
  };
}
function identity(value) {
  if (
    !value ||
    !BUCKETS.has(value.bucket) ||
    typeof value.path !== "string" ||
    !value.path ||
    Buffer.byteLength(value.path) > 1024 ||
    value.path.includes("\\") ||
    /[\x00-\x1f\x7f]/.test(value.path) ||
    value.path.split("/").some((p) => !p || p === "." || p === "..")
  )
    fail("unsafe bucket/path");
  return { bucket: value.bucket, path: value.path };
}
function metadata(value) {
  const id = identity(value);
  if (
    !Number.isSafeInteger(value.bytes) ||
    value.bytes < 1 ||
    value.bytes > 52428800 ||
    !/^image\/[a-z0-9.+-]+$/.test(imageType(value.contentType))
  )
    fail("invalid photo metadata");
  return {
    ...id,
    bytes: value.bytes,
    etag: etag(value.etag),
    contentType: imageType(value.contentType),
    updatedAt: instant(value.updatedAt).canonical,
  };
}
function sameMetadata(a, b) {
  return JSON.stringify(a) === JSON.stringify(b);
}
function fresh(value, captured, now, notBefore = -Infinity) {
  const time = instant(value).millis;
  return time >= notBefore && time <= now && time >= captured - MAX_AGE && now - time <= MAX_AGE;
}
function validReceipt(receipt, source, capturedAt) {
  if (
    !receipt ||
    keyOf(receipt) !== keyOf(source) ||
    receipt.bytes !== source.bytes ||
    imageType(receipt.contentType) !== source.contentType ||
    !SHA.test(receipt.sha256 ?? "") ||
    !new RegExp(`^original/v1/[a-f0-9]{64}/${receipt.sha256}$`).test(receipt.key ?? "")
  )
    return false;
  try {
    if (
      !source.etag ||
      etag(receipt.sourceEtag) !== source.etag ||
      instant(receipt.sourceUpdatedAt).canonical !== source.updatedAt ||
      instant(receipt.verifiedAt).millis < instant(source.updatedAt).millis ||
      instant(receipt.verifiedAt).millis > capturedAt
    )
      return false;
    const thumb = receipt.thumbnail;
    if (source.bucket === "listing-media" || thumb != null) {
      if (
        !thumb ||
        !SHA.test(thumb.sha256 ?? "") ||
        !new RegExp(`^thumbnail/v1/[a-f0-9]{64}/${thumb.sha256}$`).test(thumb.key ?? "") ||
        !Number.isSafeInteger(thumb.bytes) ||
        thumb.bytes < 1 ||
        thumb.bytes > 524288 ||
        !/^image\/[a-z0-9.+-]+$/.test(imageType(thumb.contentType))
      )
        return false;
    }
    return true;
  } catch {
    return false;
  }
}
function targetMatches(check, receipt, captured, now, notBefore) {
  try {
    if (!check || !fresh(check.checkedAt, captured, now, notBefore)) return false;
    const matches = (actual, expected) =>
      actual?.matched === true &&
      actual.key === expected.key &&
      actual.bytes === expected.bytes &&
      actual.sha256 === expected.sha256;
    return (
      matches(check.original, receipt) &&
      (receipt.thumbnail == null || matches(check.thumbnail, receipt.thumbnail))
    );
  } catch {
    return false;
  }
}

/** Local metadata review only. No network, credential, storage-write or deletion operation. */
export function buildPhotoSourceCleanupReview(snapshot, options, now = new Date()) {
  const nowMs = now.getTime();
  if (
    !Number.isFinite(nowMs) ||
    !/^[a-z0-9]{20}$/.test(options?.projectRef ?? "") ||
    !Array.isArray(options.runIds) ||
    !options.runIds.length ||
    options.runIds.some((id) => !UUID.test(id)) ||
    new Set(options.runIds).size !== options.runIds.length
  )
    fail("expected project/run scope is required");
  const cutoff = instant(options.notBefore).millis;
  if (
    snapshot?.schemaVersion !== 1 ||
    snapshot.kind !== "photo-source-cleanup-snapshot" ||
    snapshot.projectRef !== options.projectRef
  )
    fail("schema or project does not match");
  const captured = instant(snapshot.capturedAt).millis;
  if (
    !Array.isArray(snapshot.scopeRunIds) ||
    [...snapshot.scopeRunIds].sort().join() !== [...options.runIds].sort().join()
  )
    fail("migration scope does not match");
  if (
    !Array.isArray(snapshot.referenceRelations) ||
    [...snapshot.referenceRelations].sort().join() !==
      [...CLEANUP_REFERENCE_RELATIONS].sort().join()
  )
    fail("reference/operation coverage is incomplete");
  if (
    !Array.isArray(snapshot.objects) ||
    snapshot.objects.length > 20000 ||
    !Array.isArray(snapshot.runs)
  )
    fail("bounded source snapshot is required");
  const gates = [];
  if (nowMs < cutoff) gates.push("retention-cutoff-not-reached");
  if (captured < cutoff) gates.push("post-retention-snapshot-required");
  if (captured > nowMs || nowMs - captured > MAX_AGE) gates.push("fresh-snapshot-required");
  for (const id of options.runIds) {
    const runs = snapshot.runs.filter((run) => run.id === id);
    const run = runs[0];
    if (
      runs.length !== 1 ||
      !Number.isSafeInteger(run.totalGroups) ||
      run.totalGroups < 1 ||
      run.completedGroups !== run.totalGroups ||
      run.runningGroups !== 0 ||
      run.failedGroups !== 0
    )
      gates.push("approved-migration-incomplete");
  }
  const controls = snapshot.controls;
  try {
    if (
      !controls ||
      !fresh(controls.checkedAt, captured, nowMs, cutoff) ||
      controls.readMode !== "r2" ||
      controls.uploadMode !== "r2" ||
      controls.copyPermitDisabled !== true ||
      instant(controls.sourceFallbackUntil).millis !== cutoff
    )
      gates.push("fresh-runtime-controls-required");
  } catch {
    gates.push("fresh-runtime-controls-required");
  }
  const checks = new Map();
  if (snapshot.targetChecks != null && !Array.isArray(snapshot.targetChecks))
    fail("invalid R2 checks");
  for (const check of snapshot.targetChecks ?? []) {
    const id = keyOf(identity(check));
    if (checks.has(id)) fail("duplicate R2 check");
    checks.set(id, check);
  }
  const seen = new Set();
  const candidates = [];
  const excluded = [];
  for (const row of snapshot.objects) {
    const source = metadata(row.source);
    const id = keyOf(source);
    if (seen.has(id)) fail("duplicate source object");
    seen.add(id);
    if (
      !Array.isArray(row.approvals) ||
      !Array.isArray(row.references) ||
      !Array.isArray(row.pendingOperations)
    )
      fail("source evidence is incomplete");
    for (const ref of row.references) {
      if (
        !CLEANUP_REFERENCE_RELATIONS.includes(ref.kind) ||
        !Number.isSafeInteger(ref.count) ||
        ref.count < 1
      )
        fail("invalid reference count");
    }
    let reason;
    const approval = row.approvals[0];
    if (!approval) reason = "outside-approved-migration";
    else if (
      row.approvals.length !== 1 ||
      !options.runIds.includes(approval.runId) ||
      !Number.isSafeInteger(approval.ordinal) ||
      approval.ordinal < 0 ||
      approval.ordinal >=
        (snapshot.runs.find((run) => run.id === approval.runId)?.totalGroups ?? 0) ||
      approval.status !== "complete"
    )
      reason = "ambiguous-or-incomplete-migration";
    else if (!sameMetadata(source, metadata(approval.metadata))) reason = "source-changed";
    else if (row.pendingOperations.length) reason = "unfinished-photo-operation";
    else if (!validReceipt(row.receipt, source, captured))
      reason = "missing-or-mismatched-r2-receipt";
    if (reason) {
      excluded.push({ ...identity(source), reason });
      continue;
    }
    candidates.push({
      source,
      migration: { runId: approval.runId, ordinal: approval.ordinal },
      receipt: row.receipt,
      references: row.references,
      liveR2Verified: targetMatches(checks.get(id), row.receipt, captured, nowMs, cutoff),
    });
  }
  if ([...checks.keys()].some((id) => !seen.has(id))) fail("R2 check outside source snapshot");
  candidates.sort((a, b) => keyOf(a.source).localeCompare(keyOf(b.source), "en"));
  excluded.sort((a, b) => keyOf(a).localeCompare(keyOf(b), "en"));
  const pendingR2 = candidates.filter((row) => !row.liveR2Verified).length;
  if (pendingR2) gates.push("fresh-matching-r2-object-checks-required");
  if (!candidates.length) gates.push("no-review-candidates");
  const uniqueGates = [...new Set(gates)];
  // Approval identifies copies, not the time a later observation was made.
  // Keep the full manifest hash below as a separate, time-bound audit digest.
  const removalScopeSha256 = digest({
    kind: "photo-source-removal-scope",
    schemaVersion: 1,
    projectRef: options.projectRef,
    runIds: [...options.runIds].sort(),
    notBefore: new Date(cutoff).toISOString(),
    candidates: candidates.map((row) => ({
      source: row.source,
      migration: row.migration,
      receipt: {
        key: row.receipt.key,
        bytes: row.receipt.bytes,
        sha256: row.receipt.sha256,
        contentType: imageType(row.receipt.contentType),
        thumbnail: row.receipt.thumbnail
          ? {
              key: row.receipt.thumbnail.key,
              bytes: row.receipt.thumbnail.bytes,
              sha256: row.receipt.thumbnail.sha256,
              contentType: imageType(row.receipt.thumbnail.contentType),
            }
          : null,
      },
      references: row.references
        .map(({ kind, count }) => ({ kind, count }))
        .sort((a, b) => a.kind.localeCompare(b.kind, "en") || a.count - b.count),
    })),
  });
  return {
    schemaVersion: 1,
    kind: "photo-source-cleanup-review-only",
    generatedAt: now.toISOString(),
    projectRef: options.projectRef,
    capturedAt: snapshot.capturedAt,
    notBefore: options.notBefore,
    snapshotSha256: digest(snapshot),
    removalScopeSha256,
    manifestSha256: digest({
      projectRef: options.projectRef,
      capturedAt: snapshot.capturedAt,
      notBefore: options.notBefore,
      candidates,
    }),
    deletionAuthorized: false,
    reviewReady: uniqueGates.length === 0,
    gates: uniqueGates,
    summary: {
      sourceObjects: seen.size,
      metadataCandidates: candidates.length,
      candidateBytes: candidates.reduce((sum, row) => sum + row.source.bytes, 0),
      liveR2Verified: candidates.length - pendingR2,
      pendingR2Checks: pendingR2,
      excludedObjects: excluded.length,
      exclusions: excluded.reduce((counts, row) => {
        counts[row.reason] = (counts[row.reason] ?? 0) + 1;
        return counts;
      }, {}),
    },
    candidates,
    excluded,
    executionRequirements: [
      "This review never authorizes deletion. Obtain action-time approval of this exact manifest.",
      "Re-read source metadata, receipts, references and unfinished operations immediately before each Storage API removal; skip changes.",
      "Recheck original and preview R2 existence, length and SHA-256 metadata before removal.",
      "Delete only Supabase object copies through the Storage API; preserve database media rows, R2 objects and receipts.",
    ],
  };
}
