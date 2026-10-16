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
  priceHistory: { label: string; amount: number; date: string | null }[];
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

const asRecord = (value: unknown): Record<string, unknown> | null =>
  value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;

const firstValue = (record: Record<string, unknown>, ...keys: string[]) => {
  for (const key of keys) {
    const value = record[key];
    if (value != null && value !== "") return value;
  }
  return null;
};

/** Mashvisor has used a few wrappers/field names across API versions. */
function propertyRecord(payload: unknown): Record<string, unknown> {
  const root = asRecord(payload);
  if (!root) return {};
  const candidates: unknown[] = [
    root,
    root.content,
    root.data,
    root.property,
    root.listing,
    root.result,
    asRecord(root.content)?.property,
    asRecord(root.content)?.listing,
    asRecord(root.content)?.data,
    asRecord(root.data)?.property,
    asRecord(root.data)?.listing,
    asRecord(root.data)?.data,
    asRecord(root.result)?.property,
  ];
  const score = (value: unknown) => {
    const record = asRecord(value);
    if (!record) return -1;
    return [
      "description",
      "property_description",
      "property_type",
      "bedrooms",
      "beds",
      "bathrooms",
      "baths",
      "sqft",
      "square_feet",
      "extra_images",
      "photos",
    ].filter((key) => record[key] != null).length;
  };
  return (candidates.sort((a, b) => score(b) - score(a))[0] as Record<string, unknown>) ?? {};
}

function collectImages(record: Record<string, unknown>) {
  const images: string[] = [];
  const visit = (value: unknown, depth = 0) => {
    if (depth > 4 || value == null) return;
    const image = httpsImage(value);
    if (image && /^https?:\/\//i.test(image)) {
      images.push(image);
      return;
    }
    if (Array.isArray(value)) {
      value.forEach((item) => visit(item, depth + 1));
      return;
    }
    const object = asRecord(value);
    if (!object) return;
    for (const [key, item] of Object.entries(object)) {
      if (/image|photo|picture|media/i.test(key)) visit(item, depth + 1);
    }
  };
  for (const [key, value] of Object.entries(record)) {
    if (/image|photo|picture|media/i.test(key)) visit(value);
  }
  return Array.from(new Set(images));
}

export function normalizeMashvisorHome(raw: unknown): MashvisorHome | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const id = num(firstValue(r, "id", "property_id", "propertyId"));
  const price = num(firstValue(r, "list_price", "listPrice", "price"));
  const address = text(firstValue(r, "address", "street_address"));
  const city = text(firstValue(r, "city", "locality"));
  const state = text(firstValue(r, "state", "state_code"))?.toUpperCase() ?? null;
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
    zip: text(firstValue(r, "zip_code", "zip", "postal_code")),
    propertyType: text(firstValue(r, "type", "property_type", "property_sub_type")),
    priceCents: Math.round(price * 100),
    beds: beds != null && beds > 0 ? beds : num(r["bedrooms"]),
    baths: baths != null && baths > 0 ? baths : num(r["bathrooms"]),
    sqft:
      sqft != null && sqft > 0 ? Math.round(sqft) : num(firstValue(r, "square_feet", "squareFeet")),
    imageUrl: httpsImage(firstValue(r, "image_url", "image", "photo", "thumbnail")),
    daysOnMarket: num(firstValue(r, "days_on_market", "daysOnMarket")),
    latitude: num(r["latitude"]),
    longitude: num(r["longitude"]),
  };
}

export function normalizeMashvisorResult(payload: unknown): MashvisorResult {
  const root = asRecord(payload);
  const content = asRecord(root?.content) ?? asRecord(root?.data) ?? root;
  const list = Array.isArray(content?.properties)
    ? content.properties
    : Array.isArray(content?.listings)
      ? content.listings
      : Array.isArray(content?.results)
        ? content.results
        : [];
  return {
    status: "ok",
    homes: list.map(normalizeMashvisorHome).filter((home): home is MashvisorHome => !!home),
  };
}

export function normalizeMashvisorProperty(payload: unknown): MashvisorPropertyExtra {
  const c = propertyRecord(payload);
  const url = text(firstValue(c, "url", "listing_url", "source_url"));
  const images = collectImages(c);
  const year = num(firstValue(c, "yearBuilt", "year_built", "year_built_in"));
  const listPrice = num(
    firstValue(c, "originalListPrice", "original_list_price", "original_list_price_value"),
  );
  const lastSale = num(
    firstValue(c, "lastSalePrice", "last_sale_price", "last_sold_price", "sale_price"),
  );
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
        : asRecord(value)
          ? Object.values(value as Record<string, unknown>)
              .map((item) => scalarText(item))
              .filter((item): item is string => !!item)
          : [];
  const schools = firstValue(c, "schools", "nearby_schools");
  const schoolList = Array.isArray(schools) ? schools : [];
  const districts = [
    ...new Set(
      schoolList
        .map((school) =>
          typeof school === "object" && school
            ? scalarText((school as Record<string, unknown>).district)
            : null,
        )
        .filter((item): item is string => !!item),
    ),
  ];
  const parkingSpots = num(firstValue(c, "parkingSpots", "parking_spots", "garage_spaces"));
  const parkingType = scalarText(firstValue(c, "parkingType", "parking_type", "garage_type"));
  const rawHistory = firstValue(c, "priceHistory", "price_history", "history", "listing_history");
  const priceHistory = Array.isArray(rawHistory)
    ? rawHistory
        .map((item) => {
          const entry = asRecord(item);
          if (!entry) return null;
          const amount = num(firstValue(entry, "amount", "price", "list_price", "sale_price"));
          if (!amount || amount <= 0) return null;
          return {
            label:
              scalarText(firstValue(entry, "label", "event", "type", "status")) ?? "Price update",
            amount: Math.round(amount),
            date: scalarText(firstValue(entry, "date", "event_date", "created_at")),
          };
        })
        .filter((item): item is { label: string; amount: number; date: string | null } => !!item)
    : [];
  return {
    url: url && /^https:\/\//i.test(url) ? url : null,
    images: Array.from(new Set(images)),
    yearBuilt: year && year > 1700 ? year : null,
    source: text(c["source"]),
    propertyType: scalarText(
      firstValue(c, "homeType", "property_sub_type", "property_type", "type"),
    ),
    bedrooms: num(firstValue(c, "beds", "bedrooms")),
    bathrooms: num(firstValue(c, "baths", "bathrooms")),
    squareFeet: num(firstValue(c, "sqft", "square_feet", "squareFeet", "living_area")),
    description: text(firstValue(c, "description", "property_description", "listing_description")),
    originalListPrice: listPrice && listPrice > 0 ? Math.round(listPrice) : null,
    lastSalePrice: lastSale && lastSale > 0 ? Math.round(lastSale) : null,
    lastSaleDate: scalarText(
      firstValue(c, "lastSaleDate", "last_sale_date", "last_sold_date", "sale_date"),
    ),
    priceReducedAt: scalarText(
      firstValue(c, "recentReductionDate", "recent_reduction_date", "price_reduced_at"),
    ),
    lotSize: num(firstValue(c, "lotSize", "lot_size", "lot_sqft")),
    heating: scalarText(firstValue(c, "heating_system", "heating", "heating_type")),
    cooling: scalarText(firstValue(c, "cooling_system", "cooling", "cooling_type")),
    parking:
      [parkingType, parkingSpots ? `${parkingSpots} spaces` : null].filter(Boolean).join(" · ") ||
      scalarText(firstValue(c, "parking", "parking_description")),
    appliances:
      list(firstValue(c, "characteristics", "amenities", "appliances"))
        .filter((item) => /appliance|washer|dryer|range|dishwasher|refrigerator/i.test(item))
        .join(", ") || scalarText(firstValue(c, "appliances", "appliances_included")),
    exteriorMaterial: scalarText(
      firstValue(c, "construction_materials", "exterior_material", "exterior"),
    ),
    specialFeatures:
      list(firstValue(c, "detailed_characteristics", "special_features", "features")).join(", ") ||
      scalarText(firstValue(c, "architecture_style")),
    schoolDistrict:
      scalarText(firstValue(c, "school_district", "schoolDistrict")) ??
      (districts.join(", ") || null),
    hoaFees: scalarText(firstValue(c, "hoa_dues", "hoa_fees", "hoaFees", "hoa")),
    schools: list(schoolList),
    amenities: [
      ...new Set([
        ...list(firstValue(c, "characteristics", "amenities")),
        ...list(firstValue(c, "detailed_characteristics", "special_features", "features")),
      ]),
    ],
    priceHistory,
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
