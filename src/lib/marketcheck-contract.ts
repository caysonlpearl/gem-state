export type MarketCheckSourceKind = "dealer" | "fsbo";

export type MarketCheckJsonValue =
  | string
  | number
  | boolean
  | null
  | MarketCheckJsonValue[]
  | { [key: string]: MarketCheckJsonValue };

export const MARKETCHECK_ID = /^marketcheck-(dealer|fsbo)-[A-Za-z0-9._:-]+$/;

export type MarketCheckMedia = {
  photoLinks: string[];
  photoLinksCached: string[];
};

export type MarketCheckLocation = {
  sellerName: string | null;
  street: string | null;
  city: string;
  state: string;
  zip: string | null;
  latitude: number | null;
  longitude: number | null;
};

export type MarketCheckBuild = {
  year: number | null;
  make: string | null;
  model: string | null;
  trim: string | null;
  version: string | null;
  bodyType: string | null;
  vehicleType: string | null;
  transmission: string | null;
  drivetrain: string | null;
  fuelType: string | null;
  engine: string | null;
  engineSize: number | null;
  engineBlock: string | null;
  cylinders: number | null;
  doors: number | null;
  madeIn: string | null;
  overallHeight: string | null;
  overallLength: string | null;
  overallWidth: string | null;
  seating: string | null;
  highwayMpg: number | null;
  cityMpg: number | null;
  powertrainType: string | null;
};

export type MarketCheckDealer = {
  id: number | null;
  name: string | null;
  dealerType: string | null;
  dealershipGroupName: string | null;
  website: string | null;
  street: string | null;
  city: string | null;
  state: string | null;
  country: string | null;
  zip: string | null;
  phone: string | null;
  email: string | null;
};

export type MarketCheckFinance = {
  loanTerm: number | null;
  loanApr: number | null;
  downPayment: number | null;
  downPaymentPercentage: number | null;
  estimatedMonthlyPayment: number | null;
};

export type MarketCheckLease = {
  term: number | null;
  downPayment: number | null;
  estimatedMonthlyPayment: number | null;
};

export type MarketCheckExtra = {
  options: string[];
  features: string[];
  highValueFeatures: string[];
  optionsPackages: string[];
  sellerComments: string | null;
};

export type MarketCheckPriceHistory = {
  label: string;
  amount: number | null;
  date: string | null;
};

export type MarketCheckListing = {
  id: string;
  sourceKind: MarketCheckSourceKind;
  providerId: string;
  vin: string | null;
  alternateVin: string | null;
  heading: string;
  price: number | null;
  msrp: number | null;
  fees: number | null;
  priceIncludesFees: boolean | null;
  referencePrice: number | null;
  referencePriceDate: string | null;
  referenceMiles: number | null;
  priceChangePercent: number | null;
  miles: number | null;
  dom: number | null;
  dom180: number | null;
  domActive: number | null;
  dosActive: number | null;
  sellerType: string | null;
  inventoryType: string | null;
  certified: boolean;
  stockNumber: string | null;
  inTransit: boolean | null;
  vehicleStatus: string | null;
  availabilityStatus: string | null;
  source: string | null;
  sourceUrl: string | null;
  dataSource: string | null;
  firstSeenAt: string | null;
  lastSeenAt: string | null;
  location: MarketCheckLocation;
  media: MarketCheckMedia;
  build: MarketCheckBuild;
  dealer: MarketCheckDealer | null;
  finance: MarketCheckFinance | null;
  lease: MarketCheckLease | null;
  extra: MarketCheckExtra;
  priceHistory: MarketCheckPriceHistory[];
  raw: { [key: string]: MarketCheckJsonValue };
};

export type MarketCheckSearchResponse = {
  numFound: number;
  listings: MarketCheckListing[];
  raw: Record<string, unknown>;
};

const asRecord = (value: unknown): Record<string, unknown> =>
  value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};

const text = (value: unknown): string | null => {
  if (typeof value !== "string" && typeof value !== "number") return null;
  const result = String(value).trim();
  return result ? result : null;
};

const number = (value: unknown): number | null => {
  const result = typeof value === "number" ? value : Number(value);
  return Number.isFinite(result) ? result : null;
};

const boolean = (value: unknown): boolean | null =>
  typeof value === "boolean"
    ? value
    : value === 1 || value === "1"
      ? true
      : value === 0 || value === "0"
        ? false
        : null;

function arrayOfText(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.map(text).filter((item): item is string => Boolean(item)))];
}

function dateOf(value: unknown): string | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    const milliseconds = value < 10_000_000_000 ? value * 1000 : value;
    const date = new Date(milliseconds);
    return Number.isNaN(date.getTime()) ? null : date.toISOString();
  }
  const valueText = text(value);
  if (!valueText) return null;
  const date = new Date(valueText);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function urlOf(value: unknown): string | null {
  const valueText = text(value);
  if (!valueText) return null;
  try {
    const url = new URL(valueText.startsWith("http") ? valueText : `https://${valueText}`);
    url.protocol = "https:";
    return url.toString();
  } catch {
    return null;
  }
}

/** Provider photo arrays often contain the same image at several query sizes. */
export function dedupeMarketCheckImages(values: unknown[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const value of values) {
    const url = urlOf(value);
    if (!url) continue;
    let key = url;
    try {
      const parsed = new URL(url);
      parsed.search = "";
      parsed.hash = "";
      key = parsed.toString();
    } catch {
      // urlOf already validated the value; retain the normalized URL as key.
    }
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(url);
  }
  return result;
}

function buildOf(raw: Record<string, unknown>): MarketCheckBuild {
  const build = asRecord(raw.build);
  return {
    year: number(build.year ?? raw.year),
    make: text(build.make ?? raw.make),
    model: text(build.model ?? raw.model),
    trim: text(build.trim ?? raw.trim),
    version: text(build.version ?? raw.version),
    bodyType: text(build.body_type ?? raw.body_type),
    vehicleType: text(build.vehicle_type ?? raw.vehicle_type),
    transmission: text(build.transmission ?? raw.transmission),
    drivetrain: text(build.drivetrain ?? raw.drivetrain),
    fuelType: text(build.fuel_type ?? raw.fuel_type),
    engine: text(build.engine ?? raw.engine),
    engineSize: number(build.engine_size ?? raw.engine_size),
    engineBlock: text(build.engine_block ?? raw.engine_block),
    cylinders: number(build.cylinders ?? raw.cylinders),
    doors: number(build.doors ?? raw.doors),
    madeIn: text(build.made_in ?? raw.made_in),
    overallHeight: text(build.overall_height ?? raw.overall_height),
    overallLength: text(build.overall_length ?? raw.overall_length),
    overallWidth: text(build.overall_width ?? raw.overall_width),
    seating: text(build.std_seating ?? build.seating_capacity ?? raw.seating_capacity),
    highwayMpg: number(build.highway_mpg ?? raw.highway_mpg),
    cityMpg: number(build.city_mpg ?? raw.city_mpg),
    powertrainType: text(build.powertrain_type ?? raw.powertrain_type),
  };
}

function dealerOf(raw: Record<string, unknown>): MarketCheckDealer | null {
  const dealer = asRecord(raw.dealer);
  const enhanced = asRecord(raw.mc_dealership);
  const value = Object.keys(dealer).length ? dealer : enhanced;
  if (!Object.keys(value).length) return null;
  return {
    id: number(value.id ?? value.mc_dealer_id),
    name: text(value.name),
    dealerType: text(value.dealer_type),
    dealershipGroupName: text(value.dealership_group_name ?? value.mc_dealership_group_name),
    website: urlOf(value.website),
    street: text(value.street),
    city: text(value.city),
    state: text(value.state)?.toUpperCase() ?? null,
    country: text(value.country),
    zip: text(value.zip),
    phone: text(value.phone),
    email: text(value.seller_email),
  };
}

function locationOf(
  raw: Record<string, unknown>,
  dealer: MarketCheckDealer | null,
): MarketCheckLocation {
  const location = asRecord(raw.car_location);
  const city = text(location.city ?? raw.city ?? dealer?.city) ?? "";
  const state = (text(location.state ?? raw.state ?? dealer?.state) ?? "").toUpperCase();
  return {
    sellerName: text(location.seller_name ?? raw.seller_name ?? dealer?.name),
    street: text(location.street ?? dealer?.street),
    city,
    state,
    zip: text(location.zip ?? raw.zip ?? dealer?.zip),
    latitude: number(location.latitude ?? raw.latitude),
    longitude: number(location.longitude ?? raw.longitude),
  };
}

/**
 * MarketCheck's cached-image links carry our API key in the query string.
 * Anything sent to a browser must never include one, so those links are
 * dropped and the original photo links (dealer site, Craigslist) are used.
 */
function withoutApiKeys(urls: string[]) {
  return urls.filter((url) => !/[?&]api_key=/i.test(url));
}

function mediaOf(raw: Record<string, unknown>): MarketCheckMedia {
  const media = asRecord(raw.media);
  const photoLinks = withoutApiKeys(
    dedupeMarketCheckImages(Array.isArray(media.photo_links) ? media.photo_links : []),
  );
  const photoLinksCached = withoutApiKeys(
    dedupeMarketCheckImages(
      Array.isArray(media.photo_links_cached) ? media.photo_links_cached : [],
    ),
  );
  return { photoLinks, photoLinksCached };
}

/**
 * Makes a listing safe and complete for pages, including ones cached before
 * these rules existed: no key-bearing photo links, and a private seller's
 * city and state, which MarketCheck puts in its dealer-shaped block.
 */
export function finalizeMarketCheckListing(listing: MarketCheckListing): MarketCheckListing {
  const media = {
    photoLinks: withoutApiKeys(listing.media.photoLinks),
    photoLinksCached: withoutApiKeys(listing.media.photoLinksCached),
  };
  let location = listing.location;
  if (!location.city || !location.state || location.latitude == null) {
    const place = dealerOf(asRecord(listing.raw));
    const rawDealer = asRecord(asRecord(listing.raw).dealer);
    const rawEnhanced = asRecord(asRecord(listing.raw).mc_dealership);
    location = {
      ...location,
      city: location.city || place?.city || "",
      state: location.state || place?.state || "",
      zip: location.zip ?? place?.zip ?? null,
      latitude: location.latitude ?? number(rawDealer.latitude ?? rawEnhanced.latitude),
      longitude: location.longitude ?? number(rawDealer.longitude ?? rawEnhanced.longitude),
    };
  }
  return { ...listing, media, location };
}

function financeOf(raw: Record<string, unknown>): MarketCheckFinance | null {
  const finance = asRecord(raw.financing_options);
  if (!Object.keys(finance).length) return null;
  return {
    loanTerm: number(finance.loan_term),
    loanApr: number(finance.loan_apr),
    downPayment: number(finance.down_payment),
    downPaymentPercentage: number(finance.down_payment_percentage),
    estimatedMonthlyPayment: number(finance.estimated_monthly_payment),
  };
}

function leaseOf(raw: Record<string, unknown>): MarketCheckLease | null {
  const lease = asRecord(raw.leasing_options);
  if (!Object.keys(lease).length) return null;
  return {
    term: number(lease.lease_term ?? lease.term),
    downPayment: number(lease.down_payment),
    estimatedMonthlyPayment: number(lease.estimated_monthly_payment),
  };
}

function priceHistoryOf(raw: Record<string, unknown>): MarketCheckPriceHistory[] {
  const history = Array.isArray(raw.price_history)
    ? raw.price_history
    : Array.isArray(raw.pricing_history)
      ? raw.pricing_history
      : [];
  return history
    .map((item) => {
      const row = asRecord(item);
      return {
        label: text(row.event ?? row.label ?? row.type) ?? "Price update",
        amount: number(row.price ?? row.amount),
        date: dateOf(row.date ?? row.timestamp ?? row.created_at),
      };
    })
    .filter((item) => item.amount != null || item.date != null);
}

export function marketCheckListingId(sourceKind: MarketCheckSourceKind, providerId: string) {
  return `marketcheck-${sourceKind}-${providerId}`;
}

export function parseMarketCheckId(
  id: string,
): { sourceKind: MarketCheckSourceKind; providerId: string } | null {
  const match = id.match(/^marketcheck-(dealer|fsbo)-(.+)$/);
  if (!match) return null;
  return { sourceKind: match[1] as MarketCheckSourceKind, providerId: match[2] };
}

export function normalizeMarketCheckListing(
  payload: unknown,
  sourceKind: MarketCheckSourceKind,
): MarketCheckListing | null {
  const raw = asRecord(payload);
  const providerId = text(raw.id);
  if (!providerId) return null;
  // FSBO responses can still carry a dealer-shaped object from the provider's
  // shared schema. It must not turn a private-party listing into a hybrid
  // "private seller · dealer inventory" card.
  const dealer = sourceKind === "dealer" ? dealerOf(raw) : null;
  // A private seller's city still comes from that block.
  const location = locationOf(raw, dealer ?? dealerOf(raw));
  const build = buildOf(raw);
  const heading =
    cleanHeading(text(raw.heading)) ??
    ([build.year, build.make, build.model, build.trim].filter(Boolean).join(" ") ||
      "Vehicle listing");
  const firstSeenAt = dateOf(
    raw.first_seen_at_date ?? raw.first_seen_at ?? raw.scraped_at_date ?? raw.scraped_at,
  );
  const lastSeenAt = dateOf(raw.last_seen_at_date ?? raw.last_seen_at);
  const extraRaw = asRecord(raw.extra);
  const rawComments = text(extraRaw.seller_comments ?? raw.seller_comments ?? raw.description);
  return {
    id: marketCheckListingId(sourceKind, providerId),
    sourceKind,
    providerId,
    vin: text(raw.vin),
    alternateVin: text(raw.alternate_vin),
    heading,
    price: number(raw.price ?? raw.buy_now_price),
    msrp: number(raw.msrp),
    fees: number(raw.fees),
    priceIncludesFees: boolean(raw.price_includes_fees),
    referencePrice: number(raw.ref_price),
    referencePriceDate: dateOf(raw.ref_price_dt),
    referenceMiles: number(raw.ref_miles),
    priceChangePercent: number(raw.price_change_percent),
    miles: number(raw.miles),
    dom: number(raw.dom),
    dom180: number(raw.dom_180),
    domActive: number(raw.dom_active),
    dosActive: number(raw.dos_active),
    sellerType: sourceKind === "fsbo" ? "Private seller" : (text(raw.seller_type) ?? "Dealer"),
    inventoryType: text(raw.inventory_type),
    certified: raw.is_certified === 1 || raw.is_certified === true,
    stockNumber: text(raw.stock_no),
    inTransit: boolean(raw.in_transit),
    vehicleStatus: text(raw.vehicle_status),
    availabilityStatus: text(raw.availability_status),
    source: text(raw.source),
    sourceUrl: urlOf(raw.vdp_url),
    dataSource: text(raw.data_source),
    firstSeenAt,
    lastSeenAt,
    location,
    media: mediaOf(raw),
    build,
    dealer,
    finance: financeOf(raw),
    lease: leaseOf(raw),
    extra: {
      options: arrayOfText(extraRaw.options ?? raw.options),
      features: arrayOfText(extraRaw.features ?? raw.features),
      highValueFeatures: arrayOfText(extraRaw.high_value_features ?? raw.high_value_features),
      optionsPackages: arrayOfText(extraRaw.options_packages ?? raw.options_packages),
      sellerComments: rawComments,
    },
    priceHistory: priceHistoryOf(raw),
    raw: raw as { [key: string]: MarketCheckJsonValue },
  };
}

export function normalizeMarketCheckSearch(
  payload: unknown,
  sourceKind: MarketCheckSourceKind,
): MarketCheckSearchResponse {
  const raw = asRecord(payload);
  const listings = (Array.isArray(raw.listings) ? raw.listings : [])
    .map((item) => normalizeMarketCheckListing(item, sourceKind))
    .filter((item): item is MarketCheckListing => Boolean(item));
  return { numFound: number(raw.num_found) ?? listings.length, listings, raw };
}

export function marketCheckImages(listing: MarketCheckListing): string[] {
  // MarketCheck exposes the same gallery twice: once through its cached image
  // host and once through the original photo links. Prefer the cached gallery
  // when it exists so the detail page does not render the same photo twice
  // under two different hosts or resize URLs. Fall back to the original links
  // only when the cached gallery is absent.
  // Cached links that carry the API key are never used.
  const cached = withoutApiKeys(listing.media.photoLinksCached);
  return withoutApiKeys(
    dedupeMarketCheckImages(cached.length > 0 ? cached : listing.media.photoLinks),
  );
}

export function marketCheckDescription(listing: MarketCheckListing): string | null {
  return cleanDescription(listing.extra.sellerComments);
}

/** Private-seller headings often trail separators ("2013 Kia Optima SX |"). */
export function cleanHeading(value: string | null): string | null {
  const cleaned = value
    ?.replace(/^[\s|•·–—-]+|[\s|•·–—-]+$/g, "")
    .replace(/\s{2,}/g, " ")
    .trim();
  return cleaned || null;
}

/** Drops classifieds-site boilerplate that rides along in scraped seller text. */
export function cleanDescription(value: string | null): string | null {
  const cleaned = value
    ?.replace(/QR Code Link to This Post/gi, "")
    .replace(/show contact info/gi, "")
    .replace(/do NOT contact me with unsolicited services or offers/gi, "")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  return cleaned || null;
}
