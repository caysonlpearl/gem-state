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
  drivetrain?: string | null;
  fuel?: string | null;
  transmission?: string | null;
  bodyStyle?: string | null;
  color?: string | null;
  baseMsrp?: number | null;
};
export type VehicleEstimate = {
  provider: ValuationProvider;
  estimateCents: number;
  modelErrorPct: number | null;
  updatedAt: string;
  dataThrough: string | null;
  providerInputs?: string[];
  unconfirmedInputs?: string[];
};
export type VehiclePriceInsight = VehicleEstimate & {
  comparison: "below" | "near" | "above";
  differenceCents: number;
  askingCents: number;
  tolerancePct: number;
  pointerPercent: number;
  vehicleDetails?: ValuationInput;
  providerInputs?: string[];
  unconfirmedInputs?: string[];
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
  // Bluebird’s chosen comparison band; not a provider confidence interval.
  const tolerance = 0.05;
  return {
    ...estimate,
    differenceCents,
    askingCents,
    tolerancePct: tolerance * 100,
    // Each colored third is a comparison band, not a statistical confidence range.
    // Red (above) -> amber (near) -> green (below), as the user reads left to right.
    pointerPercent: Math.max(
      3,
      Math.min(97, 50 - (differenceCents / estimate.estimateCents / tolerance) * (100 / 6)),
    ),
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
  vehiclePricing?: { msrpCents?: number | null };
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
    drivetrain?: string | null;
    fuelType?: string | null;
    transmission?: string | null;
    bodyStyle?: string | null;
    exteriorColor?: string | null;
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
    model: canonicalValuationModel(v.model),
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
    certified:
      listing.externalVehicle?.certified === true || listing.externalVehicle?.isCertified === true,
    sellerType: dealer ? "dealer" : "private",
    dealerType: null,
    drivetrain: normalizedFeature(v.drivetrain, [
      [/all[ -]?wheel|\bawd\b/i, "awd"],
      [/four[ -]?wheel|4wd|4x4/i, "4wd"],
      [/front[ -]?wheel|\bfwd\b/i, "fwd"],
      [/rear[ -]?wheel|\brwd\b/i, "rwd"],
    ]),
    fuel: normalizedFeature(v.fuelType, [
      [/plug.?in.*hybrid/i, "plug-in hybrid"],
      [/hybrid/i, "hybrid"],
      [/electric/i, "electric"],
      [/diesel/i, "diesel"],
      [/gasoline|petrol|gas\b/i, "gasoline"],
    ]),
    transmission: normalizedFeature(v.transmission, [
      [/cvt|continuously variable/i, "cvt"],
      [/automatic|auto\b/i, "automatic"],
      [/manual/i, "manual"],
    ]),
    bodyStyle: normalizedFeature(v.bodyStyle, [
      [/sport utility|suv|crossover/i, "suv"],
      [/pickup|truck/i, "pickup"],
      [/hatchback/i, "hatchback"],
      [/sedan/i, "sedan"],
      [/coupe/i, "coupe"],
      [/wagon/i, "wagon"],
      [/convertible/i, "convertible"],
      [/van/i, "van"],
    ]),
    color: normalizedFeature(v.exteriorColor, [
      [/black/i, "black"],
      [/white/i, "white"],
      [/gray|grey/i, "gray"],
      [/silver/i, "silver"],
      [/blue/i, "blue"],
      [/red/i, "red"],
      [/green/i, "green"],
      [/brown/i, "brown"],
      [/beige|tan/i, "beige"],
      [/yellow/i, "yellow"],
      [/orange/i, "orange"],
      [/purple/i, "purple"],
      [/gold/i, "gold"],
    ]),
    baseMsrp:
      listing.vehiclePricing?.msrpCents && listing.vehiclePricing.msrpCents > 0
        ? Math.round(listing.vehiclePricing.msrpCents / 100)
        : null,
  };
}

function normalizedFeature(value: string | null | undefined, choices: [RegExp, string][]) {
  if (!value) return null;
  return choices.find(([pattern]) => pattern.test(value))?.[1] ?? null;
}

/** Preserve model codes while correcting the all-caps words common in dealer feeds. */
export function canonicalValuationModel(value: string) {
  const codes = new Set([
    "PHEV",
    "MHEV",
    "WRX",
    "BRZ",
    "GTI",
    "GTO",
    "GTS",
    "GT",
    "SL",
    "SLK",
    "SLC",
    "AMG",
    "ATS",
    "CTS",
    "DTS",
    "SRX",
    "XTS",
    "XT",
    "RX",
    "ES",
    "LS",
    "IS",
    "NX",
    "GX",
    "LX",
    "UX",
  ]);
  return value
    .trim()
    .replace(/\b[A-Z]{4,}\b/g, (word) =>
      codes.has(word) ? word : word[0] + word.slice(1).toLowerCase(),
    );
}
