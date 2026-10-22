/** Broad place pages introduce the marketplace, not one provider's latest batch.
 * Round-robin the already fetched review sample by category. No extra provider
 * reads, synthetic inventory, or changes to browse/category ranking are needed.
 * Within each category preserve the input order; category order follows the
 * first occurrence in that sample so no category receives a fixed promotion.
 */
export function selectPlaceListingCards<T extends { id: string; categorySlug?: string | null }>(
  listings: readonly T[],
  limit: number,
): T[] {
  if (!Number.isSafeInteger(limit) || limit <= 0) return [];

  const seen = new Set<string>();
  const categories = new Map<string, T[]>();
  for (const listing of listings) {
    if (seen.has(listing.id)) continue;
    seen.add(listing.id);
    const key = listing.categorySlug || "";
    const bucket = categories.get(key);
    if (bucket) bucket.push(listing);
    else categories.set(key, [listing]);
  }

  const selected: T[] = [];
  for (let index = 0; selected.length < limit; index += 1) {
    let found = false;
    for (const bucket of categories.values()) {
      const listing = bucket[index];
      if (!listing) continue;
      selected.push(listing);
      found = true;
      if (selected.length === limit) break;
    }
    if (!found) break;
  }
  return selected;
}
