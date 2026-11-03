import {
  buildPhotoSourceCleanupReview,
  photoRemovalScopeCandidate,
} from "./photo-source-cleanup-review.server.mjs";
import { probePhotoSourceCleanupTargets } from "./photo-source-cleanup-probe.server.mjs";
import {
  photoRemovalPermitAllowed,
  verifyPhotoRemovalProof,
} from "./photo-source-removal-plan.server.mjs";

const keyOf = (row) => `${row.bucket}/${row.path}`;
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const retainedScope = (entry, current) =>
  photoRemovalScopeCandidate({
    ...entry.candidate,
    source: {
      ...entry.candidate.source,
      etag: current.receipt?.sourceEtag,
      updatedAt: current.receipt?.sourceUpdatedAt,
    },
    receipt: current.receipt,
    references: current.references,
  });

/**
 * Only the injected Supabase Storage remove operation can delete anything.
 * Every R2 operation is a HEAD comparison. No account setting or media row is changed.
 */
export async function processPhotoSourceRemoval(input, deps) {
  const { header, mode } = input;
  const entries = input.entries?.map((entry) => ({
    ...entry,
    candidate: photoRemovalScopeCandidate(entry.candidate),
  }));
  const now = deps.now ?? (() => new Date());
  if (
    !header ||
    header.projectRef !== deps.projectRef ||
    !["check", "remove"].includes(mode) ||
    !Array.isArray(entries) ||
    !entries.length ||
    entries.length > 8 ||
    new Set(entries.map((e) => e.index)).size !== entries.length ||
    new Set(entries.map((e) => keyOf(e.candidate.source))).size !== entries.length ||
    entries.some((entry) => !verifyPhotoRemovalProof(header, entry))
  )
    throw new Error("Removal batch does not match the reviewed scope.");
  const permitted = photoRemovalPermitAllowed(deps.permit, header, deps.actorId, now().getTime());
  if (mode === "remove" && !permitted)
    throw new Error("Removal is not enabled for this exact review.");
  const targets = entries.map((e) => ({
    bucket: e.candidate.source.bucket,
    path: e.candidate.source.path,
  }));
  const controls = await deps.controls();
  if (
    controls.projectRef !== deps.projectRef ||
    controls.readMode !== "r2" ||
    controls.uploadMode !== "r2" ||
    controls.copyPermitDisabled !== true ||
    controls.sourceFallbackUntil !== header.notBefore
  )
    throw new Error("Current photo controls do not allow source cleanup.");

  function currentRows(snapshot) {
    if (
      snapshot?.projectRef !== deps.projectRef ||
      !same([...snapshot.scopeRunIds].sort(), header.runIds) ||
      !Array.isArray(snapshot.retainedRecords) ||
      snapshot.retainedRecords.length !== entries.length
    )
      throw new Error("Current cleanup evidence does not match the requested scope.");
    const rows = new Map(snapshot.retainedRecords.map((row) => [keyOf(row.target), row]));
    if (rows.size !== entries.length || targets.some((t) => !rows.has(keyOf(t))))
      throw new Error("Current cleanup evidence is incomplete.");
    return rows;
  }
  async function heads(snapshot, scope = targets) {
    const rows = currentRows(snapshot);
    return probePhotoSourceCleanupTargets(
      { projectRef: deps.projectRef, targets: scope },
      {
        projectRef: deps.projectRef,
        receipts: async () =>
          [...rows.values()]
            .filter(
              (row) => row.receipt && scope.some((target) => keyOf(target) === keyOf(row.target)),
            )
            .map((row) => row.receipt),
        matches: deps.matches,
        now,
      },
    );
  }
  function assess(snapshot, probes) {
    const rows = currentRows(snapshot);
    const present = new Set(snapshot.objects.map((row) => keyOf(row.source)));
    const review = buildPhotoSourceCleanupReview(
      {
        ...snapshot,
        controls,
        targetChecks: probes.checks.filter((check) => present.has(keyOf(check))),
      },
      {
        projectRef: deps.projectRef,
        runIds: header.runIds,
        notBefore: header.notBefore,
      },
      now(),
    );
    const candidates = new Map(review.candidates.map((row) => [keyOf(row.source), row]));
    const checked = new Map(probes.checks.map((check) => [keyOf(check), check]));
    const results = entries.map((entry) => {
      const key = keyOf(entry.candidate.source),
        row = rows.get(key),
        probe = checked.get(key);
      let reason = null;
      try {
        if (
          !row ||
          row.pendingOperations.length ||
          !same(retainedScope(entry, row), entry.candidate)
        )
          reason = "retained-records-changed";
        else if (
          probe?.original?.matched !== true ||
          (entry.candidate.receipt.thumbnail && probe.thumbnail?.matched !== true)
        )
          reason = "r2-unverified";
        else if (
          present.has(key) &&
          (!candidates.has(key) ||
            !same(photoRemovalScopeCandidate(candidates.get(key)), entry.candidate))
        )
          reason = "source-or-approval-changed";
      } catch {
        reason = "current-evidence-invalid";
      }
      return {
        index: entry.index,
        status: reason ? "blocked" : present.has(key) ? "checked" : "already-absent",
        reason,
      };
    });
    const gates = review.gates.filter((gate) => gate !== "no-review-candidates");
    if (!header.reviewReady) gates.push("final-reviewed-plan-required");
    if (results.some((row) => row.status === "blocked")) gates.push("batch-evidence-changed");
    return { results, gates: [...new Set(gates)] };
  }

  const first = await deps.snapshot(targets);
  const beforeChecks = await heads(first);
  const currentChecks = new Map(beforeChecks.checks.map((check) => [keyOf(check), check]));
  const observed = assess(first, beforeChecks);
  if (mode === "check" || observed.gates.length)
    return {
      status: observed.gates.length ? "blocked" : "checked",
      ...observed,
      removalEnabled: permitted,
      controls,
      removed: 0,
    };

  const pending = entries.filter(
    (entry) => observed.results.find((row) => row.index === entry.index)?.status === "checked",
  );
  let uncertain = false;
  const operationGates = [];
  const attempted = new Set();
  const acknowledged = new Set();
  for (const bucket of ["listing-media", "ask-evidence"]) {
    let group = pending.filter((e) => e.candidate.source.bucket === bucket);
    if (!group.length) continue;
    // Each bucket is a separate Storage API operation: the previous bucket's
    // response must never stand between this check and this removal.
    try {
      let snapshot = await deps.snapshot(targets);
      if (attempted.size) {
        const refreshed = await heads(
          snapshot,
          group.map((entry) => entry.candidate.source),
        );
        refreshed.checks.forEach((check) => currentChecks.set(keyOf(check), check));
        snapshot = await deps.snapshot(targets);
      }
      const immediate = assess(snapshot, { checks: [...currentChecks.values()] });
      if (immediate.gates.length) {
        operationGates.push(...immediate.gates);
        break;
      }
      group = group.filter(
        (entry) => immediate.results.find((row) => row.index === entry.index)?.status === "checked",
      );
      if (!group.length) continue;
    } catch {
      uncertain = true;
      operationGates.push("current-source-recheck-unavailable");
      break;
    }
    if (!photoRemovalPermitAllowed(deps.permit, header, deps.actorId, now().getTime())) {
      uncertain = true;
      operationGates.push("removal-permit-expired");
      break;
    }
    group.forEach((e) => attempted.add(e.index));
    try {
      await deps.remove(
        bucket,
        group.map((e) => e.candidate.source.path),
      );
      group.forEach((e) => acknowledged.add(e.index));
    } catch {
      uncertain = true;
      break;
    }
  }
  if (!attempted.size && operationGates.length)
    return {
      status: "blocked",
      gates: [...new Set(operationGates)],
      results: entries.map((entry) => ({
        index: entry.index,
        status: "not-attempted",
        reason: "source-recheck-required",
      })),
      removalEnabled: permitted,
      controls,
      removed: 0,
    };
  let final;
  try {
    const after = await deps.snapshot(targets);
    final = assess(after, await heads(after));
  } catch {
    return {
      status: "indeterminate",
      gates: ["post-removal-verification-unavailable"],
      results: entries.map((e) => ({
        index: e.index,
        status: attempted.has(e.index) ? "indeterminate" : "not-attempted",
        reason: "reconcile-before-resuming",
      })),
      removalEnabled: permitted,
      controls,
      removed: 0,
    };
  }
  const results = final.results.map((row) => {
    if (row.status === "already-absent" && acknowledged.has(row.index))
      return { ...row, status: "removed" };
    if (row.status === "already-absent" && attempted.has(row.index))
      return {
        ...row,
        status: "absent-after-attempt",
        reason: "storage-acknowledgment-unavailable",
      };
    if (attempted.has(row.index) && row.status !== "already-absent")
      return { ...row, status: "indeterminate", reason: "removal-not-verified" };
    return row;
  });
  const stopped =
    uncertain ||
    operationGates.length ||
    final.gates.length ||
    results.some((r) => !["removed", "already-absent"].includes(r.status));
  return {
    status: stopped ? "indeterminate" : "complete",
    gates: [...new Set([...operationGates, ...final.gates])],
    results,
    removalEnabled: permitted,
    controls,
    removed: results.filter((row) => row.status === "removed").length,
  };
}
