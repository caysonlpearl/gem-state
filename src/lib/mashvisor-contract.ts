/**
 * Mashvisor for-sale homes, normalized to only the facts the provider gave.
 * Pure module (no server imports) so tests can load it directly.
 */
export type MashvisorHome = {
  id: string;
  address: string;
  city: string;
  state: string;
  zip: string | null;
  propertyType: string | null;
  priceCents: number;
  beds: number | null;
  baths: number | null;
  sqft: number | null;
  imageUrl: string | null;
  daysOnMarket: number | null;
  latitude: number | null;
  longitude: number | null;
};

export type MashvisorResult = {
  status: "ok" | "unavailable" | "limited";
  homes: MashvisorHome[];
};

export type MashvisorPropertyExtra = {
  url: string | null;
  images: string[];
  yearBuilt: number | null;
  source: string | null;
  propertyType: string | null;
  bedrooms: number | null;
  bathrooms: number | null;
  squareFeet: number | null;
  description: string | null;
  originalListPrice: number | null;
  lastSalePrice: number | null;
  lastSaleDate: string | null;
  priceReducedAt: string | null;
  lotSize: number | null;
  heating: string | null;
  cooling: string | null;
  parking: string | null;
  appliances: string | null;
  exteriorMaterial: string | null;
  specialFeatures: string | null;
  schoolDistrict: string | null;
  hoaFees: string | null;
  schools: string[];
  amenities: string[];
};

const num = (value: unknown) => {
  const n = typeof value === "string" ? Number(value) : value;
  return typeof n === "number" && Number.isFinite(n) ? n : null;
};
const text = (value: unknown) => (typeof value === "string" && value.trim() ? value.trim() : null);
const scalarText = (value: unknown) => {
  if (typeof value === "string" && value.trim()) return value.trim();
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  return null;
};
const httpsImage = (value: unknown) => {
  const url =
    typeof value === "object" && value !== null
      ? (text((value as Record<string, unknown>).url) ??
        text((value as Record<string, unknown>).image_url))
      : text(value);
  if (!url) return null;
  return url.replace(/^http:\/\//i, "https://");
};

export function normalizeMashvisorHome(raw: unknown): MashvisorHome | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const id = num(r["id"]);
  const price = num(r["list_price"]);
  const address = text(r["address"]);
  const city = text(r["city"]);
  const state = text(r["state"])?.toUpperCase() ?? null;
  // No price, address or place means it isn't a listing we can show honestly.
  if (!id || !price || price <= 0 || !address || !city || !state) return null;
  const beds = num(r["beds"]);
  const baths = num(r["baths"]);
  const sqft = num(r["sqft"]);
  return {
    id: String(Math.trunc(id)),
    address,
    city,
    state,
    zip: text(r["zip_code"]) ?? text(r["zip"]),
    propertyType: text(r["type"]),
    priceCents: Math.round(price * 100),
    beds: beds != null && beds > 0 ? beds : null,
    baths: baths != null && baths > 0 ? baths : null,
    sqft: sqft != null && sqft > 0 ? Math.round(sqft) : null,
    imageUrl: httpsImage(r["image_url"]) ?? httpsImage(r["image"]),
    daysOnMarket: num(r["days_on_market"]),
    latitude: num(r["latitude"]),
    longitude: num(r["longitude"]),
  };
}

export function normalizeMashvisorResult(payload: unknown): MashvisorResult {
  const content = (payload as { content?: { properties?: unknown[] } } | null)?.content;
  const list = Array.isArray(content?.properties) ? content.properties : [];
  return {
    status: "ok",
    homes: list.map(normalizeMashvisorHome).filter((home): home is MashvisorHome => !!home),
  };
}

export function normalizeMashvisorProperty(payload: unknown): MashvisorPropertyExtra {
  const c = ((payload as { content?: unknown } | null)?.content ?? {}) as Record<string, unknown>;
  const url = text(c["url"]);
  const extra = Array.isArray(c["extra_images"]) ? c["extra_images"] : [];
  const imageCollection = Array.isArray(c["images"]) ? c["images"] : [];
  const images = [
    httpsImage(c["image"]),
    ...extra.map(httpsImage),
    ...imageCollection.map(httpsImage),
  ].filter((image): image is string => !!image);
  const year = num(c["yearBuilt"] ?? c["year_built"]);
  const listPrice = num(c["originalListPrice"] ?? c["original_list_price"]);
  const lastSale = num(c["lastSalePrice"] ?? c["last_sale_price"]);
  const list = (value: unknown) =>
    typeof value === "string"
      ? value
          .split(/[,;\n]+/)
          .map((item) => item.trim())
          .filter(Boolean)
      : Array.isArray(value)
        ? value
            .map((item) =>
              typeof item === "object" && item
                ? scalarText(
                    (item as Record<string, unknown>).name ??
                      (item as Record<string, unknown>).description,
                  )
                : scalarText(item),
            )
            .filter((item): item is string => !!item)
        : [];
  const schools = Array.isArray(c["schools"]) ? c["schools"] : [];
  const districts = [
    ...new Set(
      schools
        .map((school) =>
          typeof school === "object" && school
            ? scalarText((school as Record<string, unknown>).district)
            : null,
        )
        .filter((item): item is string => !!item),
    ),
  ];
  const parkingSpots = num(c["parkingSpots"] ?? c["parking_spots"]);
  const parkingType = scalarText(c["parkingType"] ?? c["parking_type"]);
  return {
    url: url && /^https:\/\//i.test(url) ? url : null,
    images: Array.from(new Set(images)),
    yearBuilt: year && year > 1700 ? year : null,
    source: text(c["source"]),
    propertyType: scalarText(c["homeType"] ?? c["property_sub_type"] ?? c["property_type"]),
    bedrooms: num(c["beds"]),
    bathrooms: num(c["baths"]),
    squareFeet: num(c["sqft"]),
    description: text(c["description"]),
    originalListPrice: listPrice && listPrice > 0 ? Math.round(listPrice) : null,
    lastSalePrice: lastSale && lastSale > 0 ? Math.round(lastSale) : null,
    lastSaleDate: scalarText(c["lastSaleDate"] ?? c["last_sale_date"]),
    priceReducedAt: scalarText(c["recentReductionDate"] ?? c["recent_reduction_date"]),
    lotSize: num(c["lotSize"] ?? c["lot_size"]),
    heating: scalarText(c["heating_system"] ?? c["heating"]),
    cooling: scalarText(c["cooling_system"] ?? c["cooling"]),
    parking:
      [parkingType, parkingSpots ? `${parkingSpots} spaces` : null].filter(Boolean).join(" · ") ||
      scalarText(c["parking"]),
    appliances: list(c["characteristics"]).join(", ") || scalarText(c["appliances"]),
    exteriorMaterial: scalarText(c["construction_materials"] ?? c["exterior_material"]),
    specialFeatures:
      list(c["detailed_characteristics"]).join(", ") || scalarText(c["architecture_style"]),
    schoolDistrict: districts.join(", ") || null,
    hoaFees: scalarText(c["hoa_dues"] ?? c["hoa_fees"] ?? c["hoaFees"]),
    schools: list(schools),
    amenities: [
      ...new Set([...list(c["characteristics"]), ...list(c["detailed_characteristics"])]),
    ],
  };
}

export const MASHVISOR_ID = /^mashvisor-(\d{1,15})$/;

/**
 * Days on market → an approximate listed date. Without it, "now" would
 * pretend every home was just posted, so fall back to a fixed old date.
 */
export function listedAt(home: MashvisorHome, now = Date.now()) {
  return home.daysOnMarket != null && home.daysOnMarket >= 0
    ? new Date(now - home.daysOnMarket * 86_400_000).toISOString()
    : new Date(0).toISOString();
}

/** Filters Mashvisor data can substantiate on the Homes page. */
const ALLOWED = new Set([
  "q",
  "category",
  "homeTab",
  "homeBedroomsMin",
  "homeBathroomsMin",
  "homeSquareFeetMin",
  "priceMin",
  "priceMax",
  "region",
  "state",
  "city",
  "radiusMiles",
  "latitude",
  "longitude",
  "postalCode",
  "sort",
  "page",
]);

export function canIncludeMashvisorFilters(data: Record<string, unknown>) {
  if (data["category"] !== "other-real-estate") return false;
  // Mashvisor offers for-sale homes only; its rental data is past rentals.
  if (data["homeTab"] && data["homeTab"] !== "buy") return false;
  return Object.entries(data).every(
    ([key, value]) => ALLOWED.has(key) || value == null || value === false || value === "",
  );
}
