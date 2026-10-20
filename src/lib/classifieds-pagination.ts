export const CLASSIFIEDS_PAGE_SIZE = 24;
// Searches ranked or filtered in memory use one fixed native working set.
// Page numbers may slice this set, but must never increase the database read.
export const CLASSIFIEDS_MERGE_READ_LIMIT = 5_000;

/** Shared by URL parsing and the server; never silently substitute another results page. */
export function normalizeBrowsePage(value: unknown): number {
  const page = typeof value === "number" || typeof value === "string" ? Number(value) : NaN;
  return Number.isSafeInteger(page) &&
    page >= 1 &&
    Number.isSafeInteger(page * CLASSIFIEDS_PAGE_SIZE - 1)
    ? page
    : 1;
}

export function assertNextBrowsePage(
  currentPage: number,
  pageSize: number,
  next: { page: number; pageSize: number },
): void {
  if (next.page !== currentPage + 1 || next.pageSize !== pageSize) {
    throw new Error("Browse response did not return the requested next page");
  }
}

/** Keep the original cards when records move between pages during a browse session. */
export function appendBrowseListings<T extends { id: string }>(
  firstPage: readonly T[],
  appended: readonly T[],
  incoming: readonly T[],
): T[] {
  const seen = new Set([...firstPage, ...appended].map((listing) => listing.id));
  return [
    ...appended,
    ...incoming.filter((listing) => {
      if (seen.has(listing.id)) return false;
      seen.add(listing.id);
      return true;
    }),
  ];
}
