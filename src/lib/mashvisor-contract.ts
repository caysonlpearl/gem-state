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
};

const num = (value: unknown) => {
  const n = typeof value === "string" ? Number(value) : value;
  return typeof n === "number" && Number.isFinite(n) ? n : null;
};
const text = (value: unknown) =>
  typeof value === "string" && value.trim() ? value.trim() : null;
const httpsImage = (value: unknown) => {
  const url = text(value);
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
  const images = [httpsImage(c["image"]), ...extra.map(httpsImage)].filter(
    (image): image is string => !!image,
  );
  const year = num(c["yearBuilt"]);
  return {
    url: url && /^https:\/\//i.test(url) ? url : null,
    images: Array.from(new Set(images)).slice(0, 20),
    yearBuilt: year && year > 1700 ? year : null,
    source: text(c["source"]),
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
    ([key, value]) =>
      ALLOWED.has(key) || value == null || value === false || value === "",
  );
}
