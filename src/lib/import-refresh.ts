import { canonicalSellerSourceProfile, dieselDepotListingId } from "./seller-claims.ts";

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
    } catch {
      failures.push({
        itemId,
        message: "Request interrupted. Retry this row; completed rows are safe to retry.",
      });
    }
    progress?.(index + 1, unique.length);
  }
  return { results, failures };
}

/** Profiles a refresh may scan: the requested ones minus any whose sync is
 * paused. Callers must apply this before any source page is opened. */
export function scannableProfiles<T extends { sourceProfileUrl: string; syncPaused: boolean }>(
  all: T[],
  profileUrl: string | null,
): { requested: T[]; profiles: T[] } {
  const requested = all.filter((p) => !profileUrl || p.sourceProfileUrl === profileUrl);
  return { requested, profiles: requested.filter((p) => !p.syncPaused) };
}
