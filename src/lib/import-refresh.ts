import { canonicalSellerSourceProfile, dieselDepotListingId } from "./seller-claims.ts";

/** Require source-status fixes and rate-limit stops before running refresh. */
export function supportsSafeSellerRefresh(value: unknown): boolean {
  if (typeof value !== "string" || !/^\d+\.\d+\.\d+$/.test(value)) return false;
  const [major, minor, patch] = value.split(".").map(Number);
  return major > 1 || (major === 1 && (minor > 5 || (minor === 5 && patch >= 9)));
}

/** Stable source identity; tracking, slugs and dealer titles are not identity. */
export function canonicalImportSource(profile: string, value: string): string {
  const seller = canonicalSellerSourceProfile(profile);
  const url = new URL(value);
  if (url.protocol !== "https:" || url.username || url.password || url.port)
    throw new Error("Unsupported listing URL.");
  const host = url.hostname.toLowerCase();
  let id: string | undefined;
  if (
    seller.includes("facebook.com") &&
    ["facebook.com", "www.facebook.com", "m.facebook.com"].includes(host)
  ) {
    id = url.pathname.match(/^\/marketplace\/item\/(\d+)\/?$/)?.[1];
    if (id) return `https://www.facebook.com/marketplace/item/${id}/`;
  }
  if (seller.includes("classifieds.ksl.com") && host === "classifieds.ksl.com") {
    id = url.pathname.match(/^\/listing\/(\d+)\/?$/)?.[1];
    if (id) return `https://classifieds.ksl.com/listing/${id}`;
  }
  if (seller.includes("vinted.com") && ["vinted.com", "www.vinted.com"].includes(host)) {
    id = url.pathname.match(/^\/items\/(\d+)(?:-[^/]*)?\/?$/)?.[1];
    if (id) return `https://www.vinted.com/items/${id}`;
  }
  if (seller.includes("whatnot.com") && ["whatnot.com", "www.whatnot.com"].includes(host)) {
    id = url.pathname.match(/^\/listing\/([^/]+)\/?$/)?.[1];
    if (id) return `https://www.whatnot.com/listing/${id}`;
  }
  if (seller === "https://www.diesel-depot.com/inventory/") {
    const dealerId = dieselDepotListingId(value);
    if (dealerId) return `https://www.diesel-depot.com/inventory/?/listing/for-sale/${dealerId}`;
  }
  throw new Error("Unsupported listing URL for this seller's source.");
}

export type ScanEvidence = {
  complete: boolean;
  termination: "count" | "end" | "incomplete";
  challenged: boolean;
  unreadable: number;
};

export function mayInferScanAbsence(scan: ScanEvidence): boolean {
  return (
    scan.complete === true &&
    !scan.challenged &&
    scan.unreadable === 0 &&
    (scan.termination === "count" || scan.termination === "end")
  );
}

/** Applying a removal keeps the import record for source deduplication. It is
 * not a live listing, and must not be queued for removal again on every scan. */
export function isSettledImportRemoval(row: {
  status: string;
  listing_id?: string | null;
  listing?: { status: string } | null;
  last_applied_snapshot?: { status?: string } | null;
}): boolean {
  return (
    row.status === "possibly_removed" &&
    !!row.listing_id &&
    row.listing?.status === "cancelled" &&
    row.last_applied_snapshot?.status === "cancelled"
  );
}

/** Review-queue state does not determine visibility of an existing listing. */
export function countImportedSellerListings(
  rows: Array<{
    source_profile_url: string;
    status: string;
    listing_id?: string | null;
    listing?: { status: string } | null;
    last_applied_snapshot?: { status?: string } | null;
  }>,
) {
  const counts = new Map<string, { open: number; published: number; offline: number }>();
  for (const row of rows) {
    if (row.status === "discarded" && !row.listing_id) continue;
    const entry = counts.get(row.source_profile_url) ?? { open: 0, published: 0, offline: 0 };
    if (row.listing_id && row.listing?.status !== "active") entry.offline++;
    if (row.listing?.status === "active") entry.published++;
    if (
      ["draft", "needs_update", "possibly_removed"].includes(row.status) &&
      !isSettledImportRemoval(row)
    )
      entry.open++;
    counts.set(row.source_profile_url, entry);
  }
  return counts;
}

/** Count-based paging continues even if PostgREST returns fewer than requested. */
export async function readAllImportPages<T>(
  fetchPage: (offset: number, size: number) => Promise<{ rows: T[]; total: number }>,
  size = 100,
): Promise<T[]> {
  const rows: T[] = [];
  for (;;) {
    const page = await fetchPage(rows.length, size);
    rows.push(...page.rows);
    if (rows.length >= page.total) return rows;
    if (!page.rows.length)
      throw new Error("Import queue changed or could not be fully loaded. Retry.");
  }
}

/** Each row is its own bounded invocation; ambiguous failures remain selected. */
export async function runImportRows<T>(
  ids: string[],
  apply: (id: string) => Promise<T>,
  progress?: (done: number, total: number) => void,
): Promise<{ results: T[]; failures: { itemId: string; message: string }[] }> {
  const unique = [...new Set(ids)];
  const results: T[] = [];
  const failures: { itemId: string; message: string }[] = [];
  for (const [index, itemId] of unique.entries()) {
    try {
      results.push(await apply(itemId));
    } catch (error) {
      failures.push({
        itemId,
        message:
          error instanceof Error && error.message && !/fetch|network|abort/i.test(error.message)
            ? error.message.slice(0, 500)
            : "Request interrupted. Retry this row; completed rows are safe to retry.",
      });
    }
    progress?.(index + 1, unique.length);
  }
  return { results, failures };
}

/** Profiles a refresh may scan: the requested ones minus any whose sync is
 * paused. Callers must apply this before any source page is opened. */
export function scannableProfiles<
  T extends { sourceProfileUrl: string; syncPaused: boolean; archivedAt?: string | null },
>(all: T[], profileUrl: string | null): { requested: T[]; profiles: T[] } {
  const requested = all.filter((p) => !profileUrl || p.sourceProfileUrl === profileUrl);
  return { requested, profiles: requested.filter((p) => !p.syncPaused && !p.archivedAt) };
}

/** Allowlisted diagnostics only. Never reflect provider messages or row values. */
export const STAGING_FAILURE_LABELS: Record<string, string> = {
  invalid_row: "Invalid listing fields; re-read this detail page",
  unsupported_source: "Listing URL does not match this source",
  photo_download_failed: "Photo download failed; re-read photos and retry",
  database_conflict: "Conflicting record; retry after reviewing the queue",
  database_permission: "Staging permission denied; check importer access",
  database_constraint: "Listing failed a data constraint; review fields and retry",
  database_unavailable: "Staging service unavailable; retry",
  staging_write_failed: "Staging write failed; retry this row",
  request_interrupted: "Request interrupted; retry these rows safely",
  finalization_failed: "Scan finalization failed; retry Refresh; unseen rows were not confirmed",
};

export type StagingFailure = { rowIndex: number; reason: string };

export function stagingFailureCode(error: unknown, phase: "photo" | "write"): string {
  if (phase === "photo") return "photo_download_failed";
  const code =
    typeof error === "object" && error !== null && "code" in error ? String(error.code) : "";
  if (code === "23505") return "database_conflict";
  if (code === "42501") return "database_permission";
  if (["23502", "23503", "23514", "22P02"].includes(code)) return "database_constraint";
  if (["57014", "53300", "PGRST000", "PGRST001", "PGRST002"].includes(code))
    return "database_unavailable";
  return "staging_write_failed";
}

/** Row numbers are local to a report, not seller IDs or source URLs. */
export function sanitizeStagingFailures(
  value: unknown,
  rows: number,
  offset = 0,
): StagingFailure[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<number>();
  return value.flatMap((raw) => {
    if (
      !raw ||
      !Number.isInteger(raw.rowIndex) ||
      raw.rowIndex < 0 ||
      raw.rowIndex >= rows ||
      seen.has(raw.rowIndex)
    )
      return [];
    seen.add(raw.rowIndex);
    const reason = Object.hasOwn(STAGING_FAILURE_LABELS, raw.reason)
      ? raw.reason
      : "staging_write_failed";
    return [{ rowIndex: raw.rowIndex + offset, reason }];
  });
}
