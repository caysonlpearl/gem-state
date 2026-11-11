export type ValuationProvider = "vehicles" | "vinaudit" | "marketcheck";
export type ValuationInput = {
  year: number;
  make: string;
  model: string;
  trim: string | null;
  miles: number;
  state: string;
  city: string;
  zip: string | null;
  vin: string | null;
  condition: "new" | "used";
  certified: boolean;
  sellerType: "dealer" | "private";
  dealerType: "franchise" | "independent" | null;
};
export type VehicleEstimate = {
  provider: ValuationProvider;
  estimateCents: number;
  modelErrorPct: number | null;
  updatedAt: string;
  dataThrough: string | null;
};
export type VehiclePriceInsight = VehicleEstimate & {
  comparison: "below" | "near" | "above";
  differenceCents: number;
};

export const valuationProviderNames: Record<ValuationProvider, string> = {
  vehicles: "Vehicles.dev",
  vinaudit: "VinAudit",
  marketcheck: "MarketCheck",
};

/** Point estimate, not a confidence interval or a guarantee about this vehicle. */
export function compareVehiclePrice(
  estimate: VehicleEstimate,
  askingCents: number,
): VehiclePriceInsight {
  const differenceCents = askingCents - estimate.estimateCents;
  const tolerance = Math.max(0.1, (estimate.modelErrorPct ?? 5) / 50);
  return {
    ...estimate,
    differenceCents,
    comparison:
      Math.abs(differenceCents) <= estimate.estimateCents * tolerance
        ? "near"
        : differenceCents < 0
          ? "below"
          : "above",
  };
}

/** Only real public vehicle listings with adequate identity and mileage are eligible. */
export function valuationInput(listing: {
  isMock?: boolean;
  ended?: unknown;
  categorySlug: string | null;
  priceCents: number;
  state: string;
  city: string;
  postalCode?: string | null;
  condition: string;
  dealer?: unknown;
  seller?: { sellerType?: string } | null;
  externalVehicle?: {
    sellerType?: string | null;
    isCertified?: boolean;
    certified?: boolean | null;
  };
  vehicle: {
    year: number | null;
    make: string | null;
    model: string | null;
    trim: string | null;
    mileage: number | null;
    vin: string | null;
    titleStatus: string | null;
  } | null;
}): ValuationInput | null {
  const v = listing.vehicle;
  if (
    listing.isMock ||
    listing.ended ||
    listing.categorySlug !== "cars-trucks" ||
    !v ||
    !Number.isSafeInteger(listing.priceCents) ||
    listing.priceCents <= 0 ||
    !Number.isInteger(v.year) ||
    v.year! < 1981 ||
    v.year! > new Date().getUTCFullYear() + 1 ||
    !v.make?.trim() ||
    !v.model?.trim() ||
    !Number.isInteger(v.mileage) ||
    v.mileage! < 0 ||
    v.mileage! > 1000000 ||
    !/^[A-Z]{2}$/.test(listing.state) ||
    (v.titleStatus && !/^(clean|clear|clean title)$/i.test(v.titleStatus))
  )
    return null;
  const dealer =
    Boolean(listing.dealer) ||
    /dealer/i.test(listing.seller?.sellerType ?? listing.externalVehicle?.sellerType ?? "");
  return {
    year: v.year!,
    make: v.make.trim(),
    model: v.model
      .trim()
      .replace(/\b[A-Z]{5,}\b/g, (word) => word[0] + word.slice(1).toLowerCase()),
    trim: v.trim?.trim() || null,
    miles: v.mileage!,
    state: listing.state,
    city: listing.city,
    zip:
      listing.postalCode && /^\d{5}/.test(listing.postalCode)
        ? listing.postalCode.slice(0, 5)
        : null,
    vin: v.vin && /^[A-HJ-NPR-Z0-9]{17}$/i.test(v.vin) ? v.vin.toUpperCase() : null,
    condition: /^new(?:[_\s-]|$)/i.test(listing.condition) ? "new" : "used",
    certified: listing.externalVehicle?.certified === true,
    sellerType: dealer ? "dealer" : "private",
    dealerType: null,
  };
}
