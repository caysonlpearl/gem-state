/** An absent dealer asking price is an inquiry, never a free vehicle. */
export function dealerContactPriceLabel(listing: { id?: string; priceCents: number }) {
  return listing.id?.startsWith("dealerfeed-") && listing.priceCents <= 0
    ? "Contact For Price"
    : null;
}

/** Only approved business profiles have a public Bluebird dealership slug. */
export function hasApprovedDealer(listing: { dealer?: { slug?: string } | null }) {
  return Boolean(listing.dealer?.slug);
}

export function vehiclePriceComparison(listing: {
  priceCents: number;
  vehiclePricing?: { msrpCents?: number | null; referencePriceCents?: number | null };
  externalVehicle?: { sourceKind?: string; msrp?: number | null; referencePrice?: number | null };
}) {
  const msrp = listing.vehiclePricing?.msrpCents ?? (listing.externalVehicle?.msrp ?? 0) * 100;
  const previous =
    listing.vehiclePricing?.referencePriceCents ??
    (listing.externalVehicle?.referencePrice ?? 0) * 100;
  const comparison =
    msrp > 0
      ? { cents: Math.round(msrp), label: "MSRP" }
      : { cents: Math.round(previous), label: "Previous price" };
  return Number.isFinite(comparison.cents) &&
    listing.priceCents > 0 &&
    comparison.cents > listing.priceCents
    ? { ...comparison, savingsCents: comparison.cents - listing.priceCents }
    : null;
}

export const DEALER_PAGE_SIZE = 24;
export function dealerInventoryPage<T>(items: T[], requestedPage = 1) {
  const pageCount = Math.max(1, Math.ceil(items.length / DEALER_PAGE_SIZE));
  const page = Math.min(pageCount, Math.max(1, Math.floor(Number(requestedPage) || 1)));
  return {
    listings: items.slice((page - 1) * DEALER_PAGE_SIZE, page * DEALER_PAGE_SIZE),
    listingCount: items.length,
    page,
    pageCount,
    pageSize: DEALER_PAGE_SIZE,
  };
}
