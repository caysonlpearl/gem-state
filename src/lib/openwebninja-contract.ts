/**
 * Normalized OpenWeb Ninja Real-Time Zillow data.
 *
 * The provider wraps search results in { data: [...] } and property details in
 * { data: {...} }. Keep this module pure so the response mapping can be tested
 * without a server, API key, or database connection.
 */
export type OpenWebNinjaMode = "buy" | "rent";

export type OpenWebNinjaHome = {
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
  mode: OpenWebNinjaMode;
  sourceUrl: string | null;
  isFeatured: boolean;
  openHouse: string | null;
  zestimate: number | null;
  rentZestimate: number | null;
};

export type OpenWebNinjaTaxHistory = {
  date: string | null;
  amount: number | null;
  value: number | null;
};

export type OpenWebNinjaPropertyExtra = {
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
  lotSizeUnit: string | null;
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
  taxHistory: OpenWebNinjaTaxHistory[];
  zestimate: number | null;
  rentZestimate: number | null;
  openHouse: string | null;
};

const asRecord = (value: unknown): Record<string, unknown> | null =>
  value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;

const num = (value: unknown) => {
  const n = typeof value === "string" ? Number(value.replace(/[$,]/g, "")) : value;
  return typeof n === "number" && Number.isFinite(n) ? n : null;
};

const text = (value: unknown) => (typeof value === "string" && value.trim() ? value.trim() : null);

const scalarText = (value: unknown) => {
  if (typeof value === "string" && value.trim()) return value.trim();
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  if (typeof value === "boolean") return value ? "Yes" : "No";
  return null;
};

const firstValue = (record: Record<string, unknown>, ...keys: string[]) => {
  for (const key of keys) {
    const value = record[key];
    if (value != null && value !== "") return value;
  }
  return null;
};

const httpsImage = (value: unknown) => {
  const record = asRecord(value);
  const url = record
    ? text(firstValue(record, "url", "image_url", "imageUrl", "src", "uri", "href"))
    : text(value);
  if (!url || !/^https?:\/\//i.test(url)) return null;
  return url.replace(/^http:\/\//i, "https://");
};

/** Keep one gallery entry per provider photo, even when a cached payload has
 * already been normalized and contains several Zillow URL variants. */
export function dedupeImageUrls(urls: string[]) {
  const seen = new Set<string>();
  return urls.filter((url) => {
    const zillowPhoto = url.match(/photos\.zillowstatic\.com\/fp\/([0-9a-f]{32})/i);
    const key = zillowPhoto ? `zillow:${zillowPhoto[1]}` : url;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

const normalizeDate = (value: unknown) => {
  const direct = text(value);
  if (direct && /^\d{4}-\d{2}-\d{2}/.test(direct)) return direct.slice(0, 10);
  const timestamp = num(value);
  if (timestamp == null) return direct;
  if (timestamp >= 1_900 && timestamp <= 2_100) return `${Math.round(timestamp)}-01-01`;
  const date = new Date(timestamp < 10_000_000_000 ? timestamp * 1000 : timestamp);
  return Number.isNaN(date.getTime()) ? null : date.toISOString().slice(0, 10);
};

function detailRecord(payload: unknown): Record<string, unknown> {
  const root = asRecord(payload);
  if (!root) return {};
  const candidates: unknown[] = [
    root.data,
    root.content,
    root.property,
    root.listing,
    asRecord(root.data)?.property,
    asRecord(root.data)?.listing,
    asRecord(root.content)?.property,
    asRecord(root.content)?.listing,
    root,
  ];
  const score = (candidate: unknown) => {
    const record = asRecord(candidate);
    if (!record) return -1;
    return [
      "responsivePhotos",
      "description",
      "resoFacts",
      "priceHistory",
      "bedrooms",
      "bathrooms",
      "livingArea",
    ].filter((key) => record[key] != null).length;
  };
  return (candidates.sort((a, b) => score(b) - score(a))[0] as Record<string, unknown>) ?? {};
}

function searchRows(payload: unknown) {
  const root = asRecord(payload);
  if (Array.isArray(payload)) return payload;
  for (const value of [root?.data, root?.properties, root?.listings, root?.results]) {
    if (Array.isArray(value)) return value;
  }
  return [];
}

function addressParts(record: Record<string, unknown>) {
  const nested = asRecord(record.address);
  return {
    address:
      text(firstValue(record, "streetAddress", "address", "fullAddress")) ??
      text(nested && firstValue(nested, "streetAddress", "address")),
    city: text(firstValue(record, "city", "locality")) ?? text(nested && nested.city),
    state: text(firstValue(record, "state", "stateCode")) ?? text(nested && nested.state),
    zip:
      text(firstValue(record, "zipcode", "zipCode", "postalCode", "zip")) ??
      text(nested && firstValue(nested, "zipcode", "zipCode", "postalCode")),
  };
}

function detailUrl(record: Record<string, unknown>) {
  const direct = text(firstValue(record, "detailUrl", "url", "hdpUrl", "listingUrl"));
  if (!direct) return null;
  if (/^https?:\/\//i.test(direct)) return direct;
  return `https://www.zillow.com${direct.startsWith("/") ? "" : "/"}${direct}`;
}

function imageList(record: Record<string, unknown>) {
  const urls: string[] = [];
  const visit = (value: unknown, depth = 0) => {
    if (depth > 5 || value == null) return;
    const image = httpsImage(value);
    if (image) {
      urls.push(image);
      return;
    }
    if (Array.isArray(value)) {
      value.forEach((item) => visit(item, depth + 1));
      return;
    }
    const object = asRecord(value);
    if (!object) return;
    for (const [key, item] of Object.entries(object)) {
      if (depth > 0 || /photo|image|picture|media|mixedSources|source/i.test(key)) {
        visit(item, depth + 1);
      }
    }
  };
  for (const [key, value] of Object.entries(record)) {
    if (/photo|image|picture|media/i.test(key)) visit(value);
  }
  return dedupeImageUrls(urls);
}

function list(value: unknown): string[] {
  if (typeof value === "string") {
    return value
      .split(/[,;\n|]+/)
      .map((item) => item.trim())
      .filter(Boolean);
  }
  if (Array.isArray(value)) {
    return value
      .flatMap((item) => {
        const object = asRecord(item);
        return object
          ? [scalarText(firstValue(object, "name", "value", "description", "factValue"))]
          : [scalarText(item)];
      })
      .filter((item): item is string => !!item);
  }
  const object = asRecord(value);
  return object
    ? Object.values(object)
        .map((item) => scalarText(item))
        .filter((item): item is string => !!item)
    : [];
}

function cents(value: unknown) {
  const amount = num(value);
  return amount != null && amount > 0 ? Math.round(amount * 100) : null;
}

function propertyType(value: unknown) {
  const label = scalarText(value);
  if (!label) return null;
  return label
    .replace(/_/g, " ")
    .toLowerCase()
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

export function normalizeOpenWebNinjaHome(
  raw: unknown,
  mode: OpenWebNinjaMode,
): OpenWebNinjaHome | null {
  const record = asRecord(raw);
  if (!record) return null;
  const parts = addressParts(record);
  const id = scalarText(firstValue(record, "zpid", "id", "propertyId"));
  const price = cents(firstValue(record, "price", "listPrice", "list_price"));
  const city = parts.city;
  const state = parts.state?.toUpperCase() ?? null;
  if (!id || !price || !parts.address || !city || !state) return null;
  return {
    id,
    address: parts.address,
    city,
    state,
    zip: parts.zip,
    propertyType: propertyType(
      firstValue(record, "homeType", "propertyTypeDimension", "property_type"),
    ),
    priceCents: price,
    beds: num(firstValue(record, "bedrooms", "beds")),
    baths: num(firstValue(record, "bathrooms", "baths")),
    sqft: num(firstValue(record, "livingArea", "livingAreaValue", "squareFeet", "sqft")),
    imageUrl: httpsImage(firstValue(record, "imgSrc", "imageUrl", "image_url", "photo")),
    daysOnMarket: num(firstValue(record, "daysOnZillow", "daysOnMarket", "days_on_market")),
    latitude: num(record.latitude),
    longitude: num(record.longitude),
    mode,
    sourceUrl: detailUrl(record),
    isFeatured: record.isFeatured === true || record.isShowcaseListing === true,
    openHouse: text(firstValue(record, "openHouse", "open_house")),
    zestimate: num(record.zestimate),
    rentZestimate: num(record.rentZestimate),
  };
}

export function normalizeOpenWebNinjaResult(payload: unknown, mode: OpenWebNinjaMode) {
  return {
    status: "ok" as const,
    homes: searchRows(payload)
      .map((item) => normalizeOpenWebNinjaHome(item, mode))
      .filter((home): home is OpenWebNinjaHome => !!home),
  };
}

export function normalizeOpenWebNinjaProperty(payload: unknown): OpenWebNinjaPropertyExtra {
  const record = detailRecord(payload);
  const facts = asRecord(record.resoFacts) ?? {};
  const history = firstValue(record, "priceHistory", "price_history", "listingHistory");
  const taxHistory = firstValue(record, "taxHistory", "tax_history");
  const schools = firstValue(record, "schools", "nearbySchools");
  const schoolRows = Array.isArray(schools) ? schools : [];
  const schoolDistricts = schoolRows
    .map((item) => {
      const school = asRecord(item);
      return school ? scalarText(firstValue(school, "district", "districtName")) : null;
    })
    .filter((item): item is string => !!item);
  const amenities = [
    ...list(firstValue(facts, "interiorFeatures", "appliances", "amenities")),
    ...list(
      firstValue(facts, "lotFeatures", "parkingFeatures", "poolFeatures", "fireplaceFeatures"),
    ),
    ...list(firstValue(record, "amenities", "characteristics", "features")),
  ];
  const priceHistory = Array.isArray(history)
    ? history
        .map((item) => {
          const row = asRecord(item);
          const amount = num(row && firstValue(row, "price", "amount", "listPrice", "salePrice"));
          if (!row || amount == null || amount <= 0) return null;
          return {
            label:
              scalarText(firstValue(row, "event", "label", "type", "status")) ?? "Price update",
            amount: Math.round(amount),
            date: normalizeDate(firstValue(row, "date", "time", "eventDate", "createdAt")),
          };
        })
        .filter((item): item is { label: string; amount: number; date: string | null } => !!item)
    : [];
  const normalizedTaxHistory = Array.isArray(taxHistory)
    ? taxHistory
        .map((item) => {
          const row = asRecord(item);
          if (!row) return null;
          return {
            date: normalizeDate(firstValue(row, "date", "time", "year")),
            amount: num(firstValue(row, "taxPaid", "amount", "tax")),
            value: num(firstValue(row, "value", "assessedValue", "taxAssessedValue")),
          };
        })
        .filter((item): item is OpenWebNinjaTaxHistory => !!item)
    : [];
  const listPrice = num(firstValue(record, "originalListPrice", "original_list_price"));
  const lastSale = num(firstValue(record, "lastSoldPrice", "lastSalePrice", "last_sold_price"));
  const rawLot = num(firstValue(record, "lotSize", "lot_size", "lotAreaValue"));
  const lotUnit = scalarText(firstValue(record, "lotAreaUnit", "lotAreaUnits"));
  const lotSize = rawLot != null && /acre/i.test(lotUnit ?? "") ? rawLot * 43_560 : rawLot;
  const parking = [
    ...list(firstValue(facts, "parkingFeatures")),
    num(firstValue(facts, "parkingCapacity", "garageParkingCapacity", "openParkingCapacity"))
      ? `${num(firstValue(facts, "parkingCapacity", "garageParkingCapacity", "openParkingCapacity"))} spaces`
      : null,
  ]
    .filter(Boolean)
    .join(" · ");
  const url = detailUrl(record);
  return {
    url,
    images: imageList(record),
    yearBuilt: num(firstValue(record, "yearBuilt", "year_built", "yearBuiltValue")),
    source: scalarText(firstValue(record, "listingDataSource", "source", "brokerName")),
    propertyType: propertyType(
      firstValue(record, "homeType", "propertyTypeDimension", "property_type"),
    ),
    bedrooms: num(firstValue(record, "bedrooms", "beds")),
    bathrooms: num(firstValue(record, "bathrooms", "baths")),
    squareFeet: num(firstValue(record, "livingArea", "livingAreaValue", "squareFeet", "sqft")),
    description: text(
      firstValue(record, "description", "propertyDescription", "listingDescription"),
    ),
    originalListPrice: listPrice && listPrice > 0 ? Math.round(listPrice) : null,
    lastSalePrice: lastSale && lastSale > 0 ? Math.round(lastSale) : null,
    lastSaleDate: normalizeDate(
      firstValue(record, "lastSoldDate", "lastSaleDate", "last_sold_date"),
    ),
    priceReducedAt: normalizeDate(
      firstValue(record, "datePriceChanged", "priceReducedAt", "price_reduced_at"),
    ),
    lotSize,
    lotSizeUnit: lotUnit,
    heating:
      list(firstValue(facts, "heating")).join(", ") || scalarText(firstValue(record, "heating")),
    cooling:
      list(firstValue(facts, "cooling")).join(", ") || scalarText(firstValue(record, "cooling")),
    parking: parking || scalarText(firstValue(record, "parking", "parkingDescription")),
    appliances: list(firstValue(facts, "appliances", "appliancesIncluded")).join(", ") || null,
    exteriorMaterial:
      list(firstValue(facts, "constructionMaterials", "exteriorFeatures", "roofType")).join(", ") ||
      scalarText(firstValue(record, "exteriorMaterial", "constructionMaterials", "exterior")),
    specialFeatures:
      [
        ...list(
          firstValue(facts, "interiorFeatures", "lotFeatures", "poolFeatures", "fireplaceFeatures"),
        ),
        ...list(firstValue(record, "specialFeatures", "features")),
      ].join(", ") || null,
    schoolDistrict:
      scalarText(firstValue(facts, "highSchoolDistrict", "schoolDistrict")) ??
      (schoolDistricts.length ? Array.from(new Set(schoolDistricts)).join(", ") : null),
    hoaFees:
      scalarText(firstValue(facts, "associationFee", "associationFee2", "hoaFee", "hoaFees")) ??
      scalarText(firstValue(record, "hoaFees", "hoa")),
    schools: list(schools),
    amenities: Array.from(new Set(amenities.filter(Boolean))),
    priceHistory,
    taxHistory: normalizedTaxHistory,
    zestimate: num(record.zestimate),
    rentZestimate: num(record.rentZestimate),
    openHouse: text(firstValue(record, "openHouse", "open_house")),
  };
}

export const OPENWEBNINJA_ID = /^openwebninja-\d{1,20}$/;

export function listedAt(home: OpenWebNinjaHome, now = Date.now()) {
  return home.daysOnMarket != null && home.daysOnMarket >= 0
    ? new Date(now - home.daysOnMarket * 86_400_000).toISOString()
    : new Date(0).toISOString();
}
