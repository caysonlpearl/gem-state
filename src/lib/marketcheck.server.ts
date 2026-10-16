/* eslint-disable @typescript-eslint/no-explicit-any -- Supabase's generated client does not include the new cache tables yet. */
import { createClient } from "@supabase/supabase-js";
import { serverEnv } from "./runtime-env.server";
import {
  classifiedCoordinatesForCity,
  isWithinClassifiedRadius,
  usStates,
} from "../config/classifieds.ts";
import { regionOfListing } from "./market-stats";
import type {
  ClassifiedBrowseInput,
  ClassifiedCard,
  ClassifiedDetail,
  ClassifiedVehicle,
} from "./classifieds.functions";
import {
  dedupeMarketCheckImages,
  marketCheckDescription,
  marketCheckImages,
  normalizeMarketCheckListing,
  normalizeMarketCheckSearch,
  parseMarketCheckId,
  type MarketCheckListing,
  type MarketCheckSourceKind,
} from "./marketcheck-contract";

const API_BASE = "https://api.marketcheck.com/v2";
const CACHE_MS = 7 * 24 * 60 * 60 * 1000;
const PAGE_SIZE = 50;
const MAX_PAGES = 10;
const DEFAULT_STATES = ["ID", "WA", "OR", "NV", "UT", "WY", "MT"] as const;

function cacheDb() {
  const dbUrl = serverEnv("GEM_STATE_SUPABASE_URL") || serverEnv("SUPABASE_URL");
  const dbKey =
    serverEnv("GEM_STATE_SUPABASE_SERVICE_ROLE_KEY") || serverEnv("SUPABASE_SERVICE_ROLE_KEY");
  if (!dbUrl || !dbKey) return null;
  return createClient(dbUrl, dbKey, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: {
      fetch: (url, init) => {
        const headers = new Headers(init?.headers);
        if (dbKey.startsWith("sb_") && headers.get("Authorization") === `Bearer ${dbKey}`)
          headers.delete("Authorization");
        headers.set("apikey", dbKey);
        return fetch(url, { ...init, headers, signal: AbortSignal.timeout(8000) });
      },
    },
  });
}

function configured() {
  return Boolean(serverEnv("MARKETCHECK_API_KEY"));
}

export function marketCheckConfigured() {
  return configured();
}

const values = (value: string | undefined) =>
  value
    ?.split(/\|{1,2}/)
    .map((item) => item.trim())
    .filter(Boolean) ?? [];

const lower = (value: unknown) =>
  String(value ?? "")
    .trim()
    .toLowerCase();

function stateCode(value: string | undefined) {
  const found = usStates.find(
    ([code, name]) => code === value || name.toLowerCase() === lower(value),
  );
  return found?.[0];
}

function regionalStates(data: ClassifiedBrowseInput) {
  if (data.state) return [stateCode(data.state) ?? data.state.toUpperCase()];
  if (data.city || data.postalCode || data.latitude != null || data.longitude != null)
    return undefined;
  return [...DEFAULT_STATES];
}

function range(min: number | undefined, max: number | undefined) {
  if (min == null && max == null) return undefined;
  return `${min ?? 0}-${max ?? ""}`;
}

function sourceEndpoint(kind: MarketCheckSourceKind) {
  return kind === "dealer" ? "/search/car/active" : "/search/car/fsbo/active";
}

function providerParams(data: ClassifiedBrowseInput, kind: MarketCheckSourceKind, start: number) {
  const params = new URLSearchParams({
    rows: String(PAGE_SIZE),
    start: String(start),
    country: "us",
    dedup: "true",
    photo_links: "true",
  });
  const states = regionalStates(data);
  if (states?.length) params.set("state", states.join(","));
  const cityPoint = data.city ? classifiedCoordinatesForCity(data.city) : undefined;
  const locationPoint =
    data.latitude != null && data.longitude != null
      ? [data.latitude, data.longitude]
      : data.radiusMiles != null && cityPoint
        ? cityPoint
        : undefined;
  if (data.city && !locationPoint) params.set("city", data.city);
  if (data.postalCode) params.set("zip", data.postalCode);
  if (locationPoint) {
    params.set("latitude", String(locationPoint[0]));
    params.set("longitude", String(locationPoint[1]));
    params.set("radius", String(Math.min(500, Math.max(1, data.radiusMiles ?? 25))));
  } else if (data.postalCode && data.radiusMiles != null) {
    params.set("radius", String(Math.min(500, Math.max(1, data.radiusMiles))));
  }
  const setList = (key: string, value: string | undefined) => {
    const items = values(value);
    if (items.length) params.set(key, items.join(","));
  };
  setList("make", data.make);
  setList("model", data.model);
  setList("body_type", data.bodyStyle);
  setList("transmission", data.transmission);
  setList("drivetrain", data.drivetrain);
  setList("fuel_type", data.fuelType);
  setList("exterior_color", data.exteriorColor);
  const yearRange = range(data.yearMin, data.yearMax);
  if (yearRange) params.set("year_range", yearRange);
  const priceRange = range(data.priceMin, data.priceMax);
  if (priceRange) params.set("price_range", priceRange);
  const milesRange = range(undefined, data.mileageMax);
  if (milesRange) params.set("miles_range", milesRange);
  const conditions = values(data.condition);
  if (conditions.length && conditions.every((item) => /^new/i.test(item)))
    params.set("car_type", "new");
  else if (conditions.length && conditions.every((item) => /^used/i.test(item))) {
    params.set(
      "car_type",
      conditions.some((item) => /certified/i.test(item)) ? "certified" : "used",
    );
  }
  if (data.titleStatus === "Clean") params.set("carfax_clean_title", "true");
  if (data.sort === "price_low" || data.sort === "price_high") {
    params.set("sort_by", "price");
    params.set("sort_order", data.sort === "price_low" ? "asc" : "desc");
  } else if (data.sort === "mileage_low") {
    params.set("sort_by", "miles");
    params.set("sort_order", "asc");
  } else {
    params.set("sort_by", "last_seen_at");
    params.set("sort_order", "desc");
  }
  return params;
}

function rawHasCleanTitle(listing: MarketCheckListing) {
  return listing.raw.carfax_clean_title === true || listing.raw.carfax_clean_title === 1;
}

function matchesProviderFilters(listing: MarketCheckListing, data: ClassifiedBrowseInput) {
  if (data.fulfillment) return false;
  if (data.titleStatus && data.titleStatus !== "Clean") return false;
  if (data.titleStatus === "Clean" && !rawHasCleanTitle(listing)) return false;
  const q = lower(data.q);
  if (
    q &&
    !`${listing.heading} ${listing.vin ?? ""} ${listing.dealer?.name ?? ""} ${listing.location.city} ${listing.location.state}`
      .toLowerCase()
      .includes(q)
  )
    return false;
  const state = stateCode(data.state) ?? data.state?.toUpperCase();
  if (state && listing.location.state !== state) return false;
  const radiusSearch = data.radiusMiles != null;
  if (data.city && !radiusSearch && lower(listing.location.city) !== lower(data.city)) return false;
  if (data.postalCode && !(listing.location.zip ?? "").startsWith(data.postalCode)) return false;
  const radiusCenter =
    data.latitude != null && data.longitude != null
      ? { latitude: data.latitude, longitude: data.longitude }
      : data.city && data.radiusMiles != null
        ? (() => {
            const point = classifiedCoordinatesForCity(data.city);
            return point ? { latitude: point[0], longitude: point[1] } : undefined;
          })()
        : undefined;
  if (
    !isWithinClassifiedRadius({
      city: data.city,
      listingCity: listing.location.city,
      latitude: radiusCenter?.latitude,
      longitude: radiusCenter?.longitude,
      radiusMiles: data.radiusMiles,
    })
  )
    return false;
  if (
    data.region &&
    regionOfListing({ city: listing.location.city, state: listing.location.state }) !== data.region
  )
    return false;
  const selected = (value: string | undefined) => values(value).map(lower);
  const equalsAny = (selectedValues: string[], actual: string | null) =>
    selectedValues.length === 0 || selectedValues.includes(lower(actual));
  if (!equalsAny(selected(data.make), listing.build.make)) return false;
  if (!equalsAny(selected(data.model), listing.build.model)) return false;
  if (!equalsAny(selected(data.bodyStyle), listing.build.bodyType)) return false;
  if (!equalsAny(selected(data.transmission), listing.build.transmission)) return false;
  if (!equalsAny(selected(data.drivetrain), listing.build.drivetrain)) return false;
  if (!equalsAny(selected(data.fuelType), listing.build.fuelType)) return false;
  if (
    !equalsAny(
      selected(data.exteriorColor),
      (listing.raw.base_ext_color ?? listing.raw.exterior_color) as string | null,
    )
  )
    return false;
  if (data.yearMin != null && (listing.build.year == null || listing.build.year < data.yearMin))
    return false;
  if (data.yearMax != null && (listing.build.year == null || listing.build.year > data.yearMax))
    return false;
  if (data.mileageMax != null && (listing.miles == null || listing.miles > data.mileageMax))
    return false;
  if (data.priceMin != null && (listing.price == null || listing.price < data.priceMin))
    return false;
  if (data.priceMax != null && (listing.price == null || listing.price > data.priceMax))
    return false;
  if (data.condition) {
    const selectedConditions = selected(data.condition);
    const isNew = lower(listing.inventoryType) === "new";
    const isCertified = listing.certified;
    const matches = selectedConditions.some((condition) =>
      condition.includes("certified") ? isCertified : condition.includes("new") ? isNew : !isNew,
    );
    if (!matches) return false;
  }
  return true;
}

async function cachedCall<T>(
  key: string,
  endpoint: string,
  normalize: (payload: unknown) => T,
  options?: { forceRefresh?: boolean },
): Promise<{ ok: true; value: T } | { ok: false; status: "unavailable" | "limited" }> {
  const apiKey = serverEnv("MARKETCHECK_API_KEY");
  const db = cacheDb();
  if (!apiKey || !db) return { ok: false, status: "unavailable" };
  const table = (db as any).from("marketcheck_cache");
  const now = new Date();
  if (!options?.forceRefresh) {
    const { data } = await table.select("payload,expires_at").eq("cache_key", key).maybeSingle();
    if (data?.payload && data.expires_at && Date.parse(data.expires_at) > now.getTime())
      return { ok: true, value: data.payload as T };
  }
  const limit = Number(serverEnv("MARKETCHECK_MONTHLY_CALL_LIMIT") || 100);
  const { data: reservation, error: reservationError } = await (db as any).rpc(
    "reserve_marketcheck_call",
    { p_cache_key: key, p_monthly_limit: Number.isFinite(limit) && limit > 0 ? limit : 100 },
  );
  if (reservationError || !reservation?.allowed) {
    const { data: stale } = await table.select("payload").eq("cache_key", key).maybeSingle();
    return stale?.payload
      ? { ok: true, value: stale.payload as T }
      : { ok: false, status: "limited" };
  }
  try {
    const response = await fetch(
      `${API_BASE}${endpoint}${endpoint.includes("?") ? "&" : "?"}api_key=${encodeURIComponent(apiKey)}`,
      {
        headers: { Accept: "application/json" },
        signal: AbortSignal.timeout(15_000),
      },
    );
    if (!response.ok) {
      const { data: stale } = await table.select("payload").eq("cache_key", key).maybeSingle();
      return stale?.payload
        ? { ok: true, value: stale.payload as T }
        : { ok: false, status: response.status === 429 ? "limited" : "unavailable" };
    }
    const value = normalize(await response.json());
    await table.upsert({
      cache_key: key,
      payload: value,
      expires_at: new Date(Date.now() + CACHE_MS).toISOString(),
    });
    return { ok: true, value };
  } catch {
    const { data: stale } = await table.select("payload").eq("cache_key", key).maybeSingle();
    return stale?.payload
      ? { ok: true, value: stale.payload as T }
      : { ok: false, status: "unavailable" };
  }
}

async function searchPage(
  data: ClassifiedBrowseInput,
  kind: MarketCheckSourceKind,
  start: number,
  forceRefresh = false,
) {
  const params = providerParams(data, kind, start);
  const key = JSON.stringify({ v: 1, kind, params: [...params.entries()] });
  const result = await cachedCall(
    key,
    `${sourceEndpoint(kind)}?${params.toString()}`,
    (payload) => normalizeMarketCheckSearch(payload, kind),
    { forceRefresh },
  );
  return result.ok ? result.value : { numFound: 0, listings: [], raw: {} };
}

async function searchAll(
  data: ClassifiedBrowseInput,
  kind: MarketCheckSourceKind,
  forceRefresh = false,
) {
  const all: MarketCheckListing[] = [];
  for (let page = 0; page < MAX_PAGES; page += 1) {
    const result = await searchPage(data, kind, page * PAGE_SIZE, forceRefresh);
    all.push(...result.listings);
    if (result.listings.length < PAGE_SIZE || all.length >= result.numFound) break;
  }
  return all;
}

async function cachedSearchListing(
  sourceKind: MarketCheckSourceKind,
  providerId: string,
): Promise<MarketCheckListing | null> {
  const db = cacheDb();
  if (!db) return null;
  const { data } = await (db as any)
    .from("marketcheck_cache")
    .select("cache_key,payload")
    .limit(100);
  for (const row of data ?? []) {
    let cacheKind: string | null = null;
    try {
      cacheKind = JSON.parse(String(row?.cache_key ?? "")).kind ?? null;
    } catch {
      // Ignore legacy or malformed cache keys.
    }
    if (cacheKind !== sourceKind) continue;
    const listings = (row?.payload?.listings ?? []) as MarketCheckListing[];
    const match = listings.find((listing) => listing.providerId === providerId);
    if (match) return match;
  }
  return null;
}

export function canIncludeMarketCheck(data: ClassifiedBrowseInput) {
  if (data.includeAllMocks || data.sellerSlug || data.dealerSlug) return false;
  if (data.category !== "cars-trucks" && data.group !== "motors") return false;
  if (data.group && data.group !== "motors") return false;
  return true;
}

function vehicleOf(listing: MarketCheckListing): ClassifiedVehicle {
  const cleanTitle = rawHasCleanTitle(listing);
  return {
    year: listing.build.year,
    make: listing.build.make,
    model: listing.build.model,
    trim: listing.build.trim,
    mileage: listing.miles,
    bodyStyle: listing.build.bodyType,
    transmission: listing.build.transmission,
    drivetrain: listing.build.drivetrain,
    fuelType: listing.build.fuelType,
    exteriorColor: (listing.raw.exterior_color ?? listing.raw.base_ext_color) as string | null,
    titleStatus: cleanTitle ? "Clean" : null,
    vin: listing.vin ?? listing.alternateVin,
  };
}

export function marketCheckCard(listing: MarketCheckListing): ClassifiedCard {
  const priceCents = listing.price == null ? 0 : Math.round(listing.price * 100);
  const createdAt = listing.lastSeenAt ?? listing.firstSeenAt ?? new Date(0).toISOString();
  return {
    id: listing.id,
    productId: listing.id,
    productSlug: "",
    title: listing.heading,
    priceCents,
    currency: "USD",
    city: listing.location.city,
    state: listing.location.state,
    region: regionOfListing({ city: listing.location.city, state: listing.location.state }) ?? "",
    postalCode: listing.location.zip,
    categorySlug: "cars-trucks",
    categoryName: "Cars & Trucks",
    condition: listing.certified
      ? "used_excellent"
      : listing.inventoryType === "new"
        ? "new_with_tags"
        : "used_good",
    fulfillmentMode: "",
    createdAt,
    isFeatured: false,
    imageUrl: marketCheckImages(listing)[0] ?? null,
    vehicle: vehicleOf(listing),
    externalVehicle: listing,
    dealer: listing.dealer
      ? {
          displayName: listing.dealer.name ?? listing.location.sellerName ?? "Vehicle seller",
          slug: "",
          logoUrl: null,
          city: listing.dealer.city,
          state: listing.dealer.state,
          website: listing.dealer.website,
          address: listing.dealer.street,
          postalCode: listing.dealer.zip,
        }
      : null,
  };
}

export async function marketCheckCards(
  data: ClassifiedBrowseInput,
  options?: { forceRefresh?: boolean },
) {
  if (!configured()) return [];
  const [dealer, fsbo] = await Promise.all([
    searchAll(data, "dealer", options?.forceRefresh),
    searchAll(data, "fsbo", options?.forceRefresh),
  ]);
  const seenIds = new Set<string>();
  const seenVins = new Set<string>();
  return [...dealer, ...fsbo]
    .filter((listing) => {
      if (!matchesProviderFilters(listing, data)) return false;
      const vin = lower(listing.vin ?? listing.alternateVin);
      if (seenIds.has(listing.id) || (vin && seenVins.has(vin))) return false;
      seenIds.add(listing.id);
      if (vin) seenVins.add(vin);
      return true;
    })
    .map(marketCheckCard);
}

export async function marketCheckDetail(listingId: string): Promise<ClassifiedDetail | null> {
  const parsed = parseMarketCheckId(listingId);
  if (!parsed || !configured()) return null;
  const key = JSON.stringify({
    v: 1,
    kind: "detail",
    sourceKind: parsed.sourceKind,
    providerId: parsed.providerId,
  });
  const result = await cachedCall(
    key,
    `/listing/${parsed.sourceKind === "dealer" ? "car" : "car/fsbo"}/${encodeURIComponent(parsed.providerId)}`,
    (payload) => normalizeMarketCheckListing(payload, parsed.sourceKind),
  );
  const normalized =
    result.ok && result.value
      ? result.value
      : await cachedSearchListing(parsed.sourceKind, parsed.providerId);
  if (!normalized) return null;
  const card = marketCheckCard(normalized);
  const images = marketCheckImages(normalized);
  return {
    ...card,
    description: marketCheckDescription(normalized),
    postalCode: normalized.location.zip,
    expiresAt: null,
    sellerNote: null,
    variantId: listingId,
    seller: null,
    images: images.map((url) => ({ url, alt: normalized.heading })),
  };
}

export async function refreshMarketCheckSearches() {
  if (!configured()) return { configured: false, refreshed: 0 };
  const data: ClassifiedBrowseInput = { category: "cars-trucks", sort: "newest" };
  const [dealer, fsbo] = await Promise.all([
    searchAll(data, "dealer", true),
    searchAll(data, "fsbo", true),
  ]);
  return { configured: true, refreshed: dealer.length + fsbo.length };
}

export function marketCheckSourceUrl(listing: ClassifiedDetail | ClassifiedCard) {
  return listing.externalVehicle?.sourceUrl ?? null;
}

export function marketCheckImagesForCard(listing: ClassifiedCard) {
  return listing.externalVehicle
    ? dedupeMarketCheckImages(marketCheckImages(listing.externalVehicle))
    : [];
}
