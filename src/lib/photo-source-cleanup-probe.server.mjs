import { normalizeCleanupTarget } from "./photo-source-cleanup-review.server.mjs";

const keyOf = (row) => `${row.bucket}/${row.path}`;
const SHA = /^[a-f0-9]{64}$/;
const descriptor = (value, prefix) =>
  value &&
  SHA.test(value.sha256 ?? "") &&
  new RegExp(`^${prefix}/v1/[a-f0-9]{64}/${value.sha256}$`).test(value.key ?? "") &&
  Number.isSafeInteger(value.bytes) &&
  value.bytes > 0 &&
  value.bytes <= (prefix === "thumbnail" ? 524288 : 52428800);

export function cleanupCopyPermitDisabled(raw) {
  if (typeof raw !== "string") return false;
  if (!raw.trim()) return true;
  try {
    const value = JSON.parse(raw);
    return (
      value != null &&
      !Array.isArray(value) &&
      typeof value === "object" &&
      Object.keys(value).length === 0
    );
  } catch {
    return false;
  }
}

/** Current receipt lookup plus bounded HEAD comparisons only; never copies or downloads bodies. */
export async function probePhotoSourceCleanupTargets(input, deps) {
  if (
    !/^[a-z0-9]{20}$/.test(input?.projectRef ?? "") ||
    input.projectRef !== deps.projectRef ||
    !Array.isArray(input.targets) ||
    input.targets.length < 1 ||
    input.targets.length > 16
  )
    throw new Error("Invalid cleanup probe scope.");
  const targets = [
    ...new Map(
      input.targets.map((value) => {
        const target = normalizeCleanupTarget(value);
        return [keyOf(target), target];
      }),
    ).values(),
  ];
  const rows = await deps.receipts(targets);
  if (!Array.isArray(rows)) throw new Error("Photo receipts are unavailable.");
  const receipts = new Map();
  for (const row of rows) {
    const key = keyOf(normalizeCleanupTarget(row));
    if (receipts.has(key)) throw new Error("Conflicting photo receipts.");
    receipts.set(key, row);
  }
  const now = deps.now ?? (() => new Date());
  const checks = new Array(targets.length);
  let next = 0;
  async function head(bucket, expected) {
    try {
      return {
        ...expected,
        matched:
          (await deps.matches(bucket, expected.key, expected.bytes, expected.sha256)) === true,
      };
    } catch {
      return { ...expected, matched: false, unavailable: true };
    }
  }
  await Promise.all(
    Array.from({ length: Math.min(8, targets.length) }, async () => {
      for (;;) {
        const index = next++;
        if (index >= targets.length) return;
        const target = targets[index],
          receipt = receipts.get(keyOf(target));
        if (
          !descriptor(receipt, "original") ||
          (target.bucket === "listing-media" && !descriptor(receipt.thumbnail, "thumbnail")) ||
          (receipt.thumbnail != null && !descriptor(receipt.thumbnail, "thumbnail"))
        ) {
          checks[index] = {
            ...target,
            checkedAt: now().toISOString(),
            original: null,
            thumbnail: null,
            error: receipt ? "receipt-invalid" : "receipt-missing",
          };
          continue;
        }
        const original = await head(target.bucket, {
          key: receipt.key,
          bytes: receipt.bytes,
          sha256: receipt.sha256,
        });
        const thumbnail =
          receipt.thumbnail == null ? null : await head(target.bucket, receipt.thumbnail);
        checks[index] = { ...target, checkedAt: now().toISOString(), original, thumbnail };
      }
    }),
  );
  return {
    checks,
    verified: checks.filter(
      (row) =>
        row.original?.matched === true &&
        (row.thumbnail == null ? row.bucket !== "listing-media" : row.thumbnail.matched === true),
    ).length,
  };
}
