/**
 * Local service businesses from Foursquare's open places dataset, shown in
 * Services as directory entries until their owners claim them. Pure helpers
 * so the mapping and matching rules can be tested without a database.
 */
import type { ClassifiedBrowseInput, ClassifiedCard } from "./classifieds.functions";

export const DIRECTORY_ID = /^fsq-[0-9a-f]{24}$/;

export type DirectoryRow = {
  id: string;
  name: string;
  trade: string;
  trades: string[];
  address: string | null;
  city: string;
  state: string;
  postcode: string | null;
  latitude: number | null;
  longitude: number | null;
  phone: string | null;
  website: string | null;
  email: string | null;
  facebook_id: string | null;
  instagram: string | null;
  source_refreshed_at: string | null;
  enrichment: DirectoryEnrichment | null;
  enriched_at: string | null;
  claimed_by: string | null;
  imported_at: string;
};

/** What a Local Business Data lookup confirmed or added. */
export type DirectoryEnrichment = {
  rating: number | null;
  reviewCount: number | null;
  hours: { day: string; hours: string }[];
  phone: string | null;
  website: string | null;
  googleUrl: string | null;
  closed: boolean;
  /** The business's own description from its Google profile. */
  summary?: string | null;
  /** Services the business lists on Google ("Water heater installation"...). */
  services?: string[];
};

export const DIRECTORY_COLUMNS =
  "id,name,trade,trades,address,city,state,postcode,latitude,longitude,phone,website,email,facebook_id,instagram,source_refreshed_at,enrichment,enriched_at,claimed_by,imported_at";

// Filters a directory entry can honestly answer. Anything else (price,
// photos, pricing model, seller storefronts...) leaves it out of the results.
const SUPPORTED_KEYS = new Set([
  "category",
  "serviceSubcategory",
  "q",
  "city",
  "state",
  "region",
  "radiusMiles",
  "latitude",
  "longitude",
  "postalCode",
  "sort",
  "page",
  "pageSize",
]);

export function canIncludeDirectory(data: ClassifiedBrowseInput) {
  if (data.category !== "services") return false;
  if (data.sort && data.sort !== "newest") return false;
  return Object.entries(data).every(
    ([key, value]) => SUPPORTED_KEYS.has(key) || value == null || value === false || value === "",
  );
}

/** US numbers as "(208) 949-9680"; anything else as given. */
export function formatPhone(value: string | null | undefined) {
  if (!value) return null;
  const digits = value.replace(/\D/g, "");
  const local = digits.length === 11 && digits.startsWith("1") ? digits.slice(1) : digits;
  return local.length === 10
    ? `(${local.slice(0, 3)}) ${local.slice(3, 6)}-${local.slice(6)}`
    : value.trim();
}

/** The website's own domain, for a logo lookup; none for social pages. */
export function websiteDomain(website: string | null | undefined) {
  if (!website) return null;
  try {
    const host = new URL(/^https?:\/\//i.test(website) ? website : `https://${website}`).hostname
      .toLowerCase()
      .replace(/^www\./, "");
    if (/(^|\.)(facebook|instagram|yelp|google|linktr|square|wix|godaddysites)\./.test(host))
      return null;
    return /^[a-z0-9.-]+\.[a-z]{2,}$/.test(host) ? host : null;
  } catch {
    return null;
  }
}

export function directoryCard(row: DirectoryRow, logoUrl?: string | null): ClassifiedCard {
  const phone = formatPhone(row.enrichment?.phone ?? row.phone);
  return {
    id: row.id,
    productId: row.id,
    productSlug: "",
    title: row.name,
    city: row.city,
    state: row.state,
    region: "",
    postalCode: row.postcode,
    priceCents: 0,
    currency: "USD",
    categorySlug: "services",
    categoryName: "Services",
    condition: "",
    fulfillmentMode: "",
    createdAt: row.imported_at,
    isFeatured: false,
    imageUrl: null,
    vehicle: null,
    service: {
      subcategory: row.trade,
      pricing: "Call for a quote",
      pricingType: "quote",
      serviceArea: `${row.city}, ${row.state}`,
      availability: "Contact for availability",
      serviceSummary: row.enrichment?.summary ?? "",
      offerings: row.enrichment?.services ?? [],
      businessAddress: [row.address, row.city, row.state, row.postcode].filter(Boolean).join(", "),
    },
    directory: {
      source: "Foursquare",
      claimed: Boolean(row.claimed_by),
      logoUrl: logoUrl ?? null,
      phone,
      website: row.enrichment?.website ?? row.website,
      email: row.email,
      trades: row.trades,
      rating: row.enrichment?.rating ?? null,
      reviewCount: row.enrichment?.reviewCount ?? null,
      googleUrl: row.enrichment?.googleUrl ?? null,
      hours: row.enrichment?.hours ?? [],
    },
  } as ClassifiedCard;
}

const digits = (value: unknown) =>
  typeof value === "string" ? value.replace(/\D/g, "").slice(-10) : "";
const nameKey = (value: unknown) =>
  typeof value === "string"
    ? value
        .toLowerCase()
        .replace(/&/g, "and")
        .replace(/[^a-z0-9]+/g, " ")
        .replace(/\b(llc|inc|co|company|corp|the)\b/g, "")
        .trim()
    : "";
const asRecord = (value: unknown): Record<string, unknown> | null =>
  value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
const text = (value: unknown) => (typeof value === "string" && value.trim() ? value.trim() : null);
const num = (value: unknown) =>
  typeof value === "number" && Number.isFinite(value) ? value : null;

/**
 * The search result that is this business: same phone number, or the same
 * name in the same city. A different business is worse than no match.
 */
export function matchBusiness(
  row: Pick<DirectoryRow, "name" | "phone" | "city">,
  results: unknown[],
): Record<string, unknown> | null {
  const phone = digits(row.phone);
  const name = nameKey(row.name);
  const city = row.city.toLowerCase();
  for (const item of results) {
    const result = asRecord(item);
    if (!result) continue;
    if (phone.length === 10 && digits(result.phone_number) === phone) return result;
    const address = String(result.full_address ?? result.address ?? "").toLowerCase();
    if (name && nameKey(result.name) === name && address.includes(city)) return result;
  }
  return null;
}

const DAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

export function enrichmentFrom(result: Record<string, unknown>): DirectoryEnrichment {
  const hoursRecord = asRecord(result.working_hours) ?? {};
  const hours = DAYS.flatMap((day) => {
    const value = hoursRecord[day];
    const list = Array.isArray(value) ? value.filter((v) => typeof v === "string") : [];
    return list.length ? [{ day, hours: list.join(", ") }] : [];
  });
  const status = String(result.business_status ?? "").toUpperCase();
  const website = text(result.website);
  return {
    rating: num(result.rating),
    reviewCount: num(result.review_count),
    hours,
    phone: text(result.phone_number),
    website: website && /^https?:\/\//i.test(website) ? website : null,
    googleUrl:
      text(result.place_link) && /^https:\/\/(www\.)?google\.com\//.test(String(result.place_link))
        ? String(result.place_link)
        : null,
    closed: status === "CLOSED_PERMANENTLY",
    summary: text(asRecord(result.about)?.summary)?.slice(0, 1200) ?? null,
    services: serviceNames(result.business_services ?? result.subtypes),
  };
}

function serviceNames(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const names = value
    .map((item) => (typeof item === "string" ? item : text(asRecord(item)?.name)))
    .filter((name): name is string => Boolean(name && name.trim()))
    .map((name) => name.trim().replace(/^./, (c) => c.toUpperCase()));
  return Array.from(new Set(names)).slice(0, 20);
}
