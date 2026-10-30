/** Savings versus the retailer's own list price; null unless a real discount exists. */
export function retailSavings(listing: {
  priceCents: number;
  externalMerchandise?: { retailPriceCents: number } | null;
}): { retailCents: number; savedCents: number; percent: number } | null {
  const retail = listing.externalMerchandise?.retailPriceCents ?? 0;
  const price = listing.priceCents;
  if (!(price > 0) || !(retail > price)) return null;
  const savedCents = retail - price;
  const percent = Math.floor((savedCents / retail) * 100);
  if (percent < 1) return null;
  return { retailCents: retail, savedCents, percent };
}
