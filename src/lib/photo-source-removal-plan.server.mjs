import { createHash } from "node:crypto";
import {
  photoRemovalScopeCandidate,
  photoRemovalScopeFingerprint,
} from "./photo-source-cleanup-review.server.mjs";

const SHA = /^[a-f0-9]{64}$/;
const UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-[1-5][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i;
const digest = (text) => createHash("sha256").update(text).digest("hex");
const leaf = (index, candidate) =>
  digest(JSON.stringify({ kind: "photo-source-removal-leaf", version: 1, index, candidate }));
const parent = (left, right) => digest(`photo-source-removal-node/v1\0${left}${right}`);
const treeRoot = (header, treeSha256) =>
  digest(
    JSON.stringify({
      kind: "photo-source-removal-root",
      version: 1,
      projectRef: header.projectRef,
      runIds: header.runIds,
      notBefore: header.notBefore,
      removalScopeSha256: header.removalScopeSha256,
      totalObjects: header.totalObjects,
      totalBytes: header.totalBytes,
      treeSha256,
    }),
  );

/** Pure local packet preparation. No storage access, credentials, or deletion. */
export function buildPhotoRemovalPlan(review, options, preview = false) {
  if (
    review?.kind !== "photo-source-cleanup-review-only" ||
    review.projectRef !== options.projectRef ||
    !/^[a-z0-9]{20}$/.test(options.projectRef ?? "") ||
    !Array.isArray(options.runIds) ||
    !options.runIds.length ||
    options.runIds.some((id) => !UUID.test(id)) ||
    new Set(options.runIds).size !== options.runIds.length ||
    !Array.isArray(review.candidates) ||
    !review.candidates.length ||
    review.candidates.length > 20000 ||
    (!preview && (review.reviewReady !== true || review.gates?.length !== 0))
  )
    throw new Error("A matching, ready cleanup review is required; preview never enables removal.");
  const candidates = review.candidates.map(photoRemovalScopeCandidate);
  const identities = new Set();
  for (const row of candidates) {
    const identity = `${row.source.bucket}/${row.source.path}`;
    if (identities.has(identity) || !options.runIds.includes(row.migration.runId))
      throw new Error("Removal scope contains duplicate or unapproved copies.");
    identities.add(identity);
  }
  const removalScopeSha256 = photoRemovalScopeFingerprint(candidates, {
    ...options,
    notBefore: review.notBefore,
  });
  if (removalScopeSha256 !== review.removalScopeSha256)
    throw new Error("The removal fingerprint does not match the reviewed copies.");
  const levels = [candidates.map((row, index) => leaf(index, row))];
  while (levels.at(-1).length > 1) {
    const current = levels.at(-1),
      next = [];
    for (let i = 0; i < current.length; i += 2)
      next.push(parent(current[i], current[i + 1] ?? current[i]));
    levels.push(next);
  }
  const header = {
    schemaVersion: 1,
    kind: "photo-source-removal-plan",
    projectRef: options.projectRef,
    runIds: [...options.runIds].sort(),
    notBefore: new Date(review.notBefore).toISOString(),
    removalScopeSha256,
    rootSha256: levels.at(-1)[0],
    totalObjects: candidates.length,
    totalBytes: candidates.reduce((sum, row) => sum + row.source.bytes, 0),
    reviewReady: !preview && review.reviewReady === true,
    sourceCapturedAt: review.capturedAt,
    generatedAt: review.generatedAt,
  };
  header.rootSha256 = treeRoot(header, levels.at(-1)[0]);
  return {
    header,
    entries: candidates.map((candidate, index) => {
      const proof = [];
      let position = index;
      for (const level of levels.slice(0, -1)) {
        const sibling = position % 2 ? position - 1 : position + 1;
        proof.push({
          side: position % 2 ? "left" : "right",
          hash: level[sibling] ?? level[position],
        });
        position = Math.floor(position / 2);
      }
      return { index, candidate, proof };
    }),
  };
}

/** Verify membership of one exact source version in the separately approved packet. */
export function verifyPhotoRemovalProof(header, entry) {
  try {
    if (
      !SHA.test(header.rootSha256 ?? "") ||
      !Number.isSafeInteger(header.totalObjects) ||
      header.totalObjects < 1 ||
      header.totalObjects > 20000 ||
      !Number.isSafeInteger(entry.index) ||
      entry.index < 0 ||
      entry.index >= header.totalObjects ||
      !Array.isArray(entry.proof) ||
      entry.proof.length > 15
    )
      return false;
    const candidate = photoRemovalScopeCandidate(entry.candidate);
    let hash = leaf(entry.index, candidate),
      position = entry.index,
      count = header.totalObjects,
      level = 0;
    while (count > 1) {
      const sibling = entry.proof[level++],
        side = position % 2 ? "left" : "right";
      if (!sibling || sibling.side !== side || !SHA.test(sibling.hash ?? "")) return false;
      if (side === "right" && position + 1 >= count && sibling.hash !== hash) return false;
      hash = side === "left" ? parent(sibling.hash, hash) : parent(hash, sibling.hash);
      position = Math.floor(position / 2);
      count = Math.ceil(count / 2);
    }
    return level === entry.proof.length && treeRoot(header, hash) === header.rootSha256;
  } catch {
    return false;
  }
}

/** Unset/empty/invalid permits always disable deletion; diagnostics remain read-only. */
export function photoRemovalPermitAllowed(raw, header, actorId, now = Date.now()) {
  try {
    const permit = JSON.parse(raw);
    const issued = Date.parse(permit.issuedAt),
      expires = Date.parse(permit.expiresAt);
    const captured = Date.parse(header.sourceCapturedAt),
      generated = Date.parse(header.generatedAt);
    const cutoff = Date.parse(header.notBefore);
    return (
      permit.kind === "photo-source-removal-permit" &&
      header.reviewReady === true &&
      UUID.test(actorId) &&
      permit.actorId === actorId &&
      permit.projectRef === header.projectRef &&
      SHA.test(header.rootSha256) &&
      permit.rootSha256 === header.rootSha256 &&
      SHA.test(header.removalScopeSha256) &&
      permit.removalScopeSha256 === header.removalScopeSha256 &&
      permit.totalObjects === header.totalObjects &&
      permit.totalBytes === header.totalBytes &&
      JSON.stringify(permit.runIds) === JSON.stringify(header.runIds) &&
      permit.notBefore === header.notBefore &&
      permit.reviewCapturedAt === header.sourceCapturedAt &&
      permit.reviewGeneratedAt === header.generatedAt &&
      [issued, expires, captured, generated, cutoff, now].every(Number.isFinite) &&
      captured >= cutoff &&
      generated >= captured &&
      issued >= generated &&
      issued - captured <= 15 * 60000 &&
      expires > issued &&
      expires - issued <= 2 * 3600000 &&
      now >= issued &&
      now < expires &&
      now >= cutoff
    );
  } catch {
    return false;
  }
}
