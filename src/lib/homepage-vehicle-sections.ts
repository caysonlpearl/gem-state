type CategorizedListing = { categorySlug: string | null };

/** Keep parts out of homepage rows that are presented as vehicle inventory. */
export function excludeAutoPartsFromVehicleRows<T extends CategorizedListing>(
  listings: readonly T[],
): T[] {
  return listings.filter((listing) => listing.categorySlug !== "auto-parts");
}
