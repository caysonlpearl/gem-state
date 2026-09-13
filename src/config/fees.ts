/**
 * DISPLAY DEFAULTS ONLY.
 *
 * The authoritative fee schedule lives in the database (`fee_schedules`, added
 * in the catalog phase). The server resolves the applicable schedule row,
 * recomputes every total, and snapshots it immutably onto the order. These
 * values exist so the UI can render an estimate before a server round-trip and
 * must never be treated as final.
 */

export const feeDefaults = {
  currency: "USD",
  buyerFeeBps: 850, // 8.50%
  sellerFeeBps: 950, // 9.50%
  minimumFeeCents: 300,
  shippingEstimateCents: 1200,
  taxEstimateBps: 700,
} as const;

/** Display estimate for Park Shopper jobs; the database recomputes and freezes the final fee. */
export const sourcingFeeDefaults = {
  buyerFeeBps: 800,
  minimumFeeCents: 799,
  recommendedShopperEarningsCents: 1500,
  minimumShopperEarningsCents: 1000,
  maximumShopperEarningsCents: 2500,
} as const;

export const bps = (cents: number, basisPoints: number) =>
  Math.round((cents * basisPoints) / 10_000);

export function estimateSourcingPlatformFeeCents(itemAndShopperCents: number) {
  return Math.max(
    bps(itemAndShopperCents, sourcingFeeDefaults.buyerFeeBps),
    sourcingFeeDefaults.minimumFeeCents,
  );
}

/** Client-side ESTIMATE. The server value always wins. */
export function estimateBuyerTotalCents(merchandiseCents: number) {
  const buyerFee = Math.max(
    bps(merchandiseCents, feeDefaults.buyerFeeBps),
    feeDefaults.minimumFeeCents,
  );
  const shipping = feeDefaults.shippingEstimateCents;
  const tax = bps(merchandiseCents + shipping, feeDefaults.taxEstimateBps);
  return {
    merchandiseCents,
    buyerFeeCents: buyerFee,
    shippingCents: shipping,
    taxCents: tax,
    totalCents: merchandiseCents + buyerFee + shipping + tax,
    isEstimate: true as const,
  };
}

export function formatUsd(cents: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(cents / 100);
}
