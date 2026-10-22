/** Never turn an unsuccessful source read into a successful thin/noindex page. */
export function requireReliableIndexing(indexable: boolean, incomplete: boolean) {
  if (!indexable && incomplete) {
    // Rejection is evicted by shortCache and gets the route's temporary error
    // response. A real, successfully read empty catalog still remains noindex.
    throw new Error("Listings are temporarily unavailable. Please try again.");
  }
}
