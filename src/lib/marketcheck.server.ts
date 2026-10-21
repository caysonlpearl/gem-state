/* eslint-disable @typescript-eslint/no-explicit-any -- Supabase's generated client does not include the new cache tables yet. */
import { createClient } from "@supabase/supabase-js";
import { getRequest } from "@tanstack/react-start/server";
import { serverEnv } from "./runtime-env.server.ts";
import {
  classifiedCoordinatesForCity,
  classifiedProviderSearchStates,
  hasClassifiedRadiusCenter,
  isWithinClassifiedRadius,
  usStates,
} from "../config/classifieds.ts";
import { regionOfListing } from "./market-stats.ts";
import type {
  ClassifiedBrowseInput,
  ClassifiedCard,
  ClassifiedDetail,
  ClassifiedVehicle,
} from "./classifieds.functions.ts";
import {
  finalizeMarketCheckListing,
  dedupeMarketCheckImages,
  marketCheckDescription,
  marketCheckImages,
  marketCheckLookupStatus,
  normalizeMarketCheckListing,
  normalizeMarketCheckSearch,
  canonicalMarketCheckId,
  parseMarketCheckId,
  freshMarketCheckInventory,
  marketCheckCachePageKeys,
  type MarketCheckListing,
  type MarketCheckLookupStatus,
  type MarketCheckSourceKind,
} from "./marketcheck-contract.ts";

const API_BASE = "https://api.marketcheck.com/v2";
const CACHE_MS = 7 * 24 * 60 * 60 * 1000;
const PAGE_SIZE = 50;
/**
 * The free plan is 500 calls a month, so searches never go to MarketCheck
 * per filter. Each state has one cached inventory (newest listings first),
 * refreshed weekly, and every Bluebird filter, row and sort runs over it
 * here. Idaho gets the deepest inventory; a radius search checks each state
 * currently included in Bluebird's marketplace, with the same weekly cache.
 */
const BASE_PAGES: Record<MarketCheckSourceKind, number> = { dealer: 6, fsbo: 4 };
const OTHER_STATE_PAGES = 2;
const HOME_STATE = "ID";
const DEFAULT_MONTHLY_LIMIT = 450;
const BOT = /bot|crawl|spider|slurp|preview|lighthouse|headless|monitor|curl|wget|python/i;

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

export class MarketCheckLookupError extends Error {
  readonly status: MarketCheckLookupStatus;
  readonly providerStatus: number | null;

  constructor(status: Exclude<MarketCheckLookupStatus, "not-found">, providerStatus?: number) {
    super(
      status === "limited"
        ? "Vehicle availability is temporarily rate limited. Try again shortly."
        : "Vehicle availability could not be verified right now. Try again shortly.",
    );
    this.name = "MarketCheckLookupError";
    this.status = status;
    this.providerStatus = providerStatus ?? null;
  }
}

export function marketCheckConfigured() {
  return configured();
}

/** A radius can cross borders; a city/state-only search stays in its selected state. */
export function marketCheckStatesForBrowse(data: ClassifiedBrowseInput) {
  return classifiedProviderSearchStates(data);
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

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

/**
 * Cache rows contain normalized provider objects. Re-normalize the raw
 * payload when available so schema fixes also apply to rows written before a
 * deployment (for example, the FSBO dealer-field fix).
 */
function repairCachedListing(
  payload: unknown,
  sourceKind: MarketCheckSourceKind,
): MarketCheckListing | null {
  const record = isRecord(payload) ? payload : {};
  const raw = isRecord(record.raw) ? record.raw : payload;
  const repaired = normalizeMarketCheckListing(raw, sourceKind);
  if (repaired) return repaired;
  if (sourceKind !== "fsbo" || !isRecord(payload)) return null;
  return {
    ...(payload as MarketCheckListing),
    dealer: null,
    sellerType: "Private seller",
  };
}

function repairCachedSearch(payload: unknown, sourceKind: MarketCheckSourceKind) {
  if (!isRecord(payload) || !Array.isArray(payload.listings))
    return normalizeMarketCheckSearch(payload, sourceKind);
  const listings = payload.listings
    .map((listing) => repairCachedListing(listing, sourceKind))
    .filter((listing): listing is MarketCheckListing => Boolean(listing));
  return {
    // A fresh provider response says num_found; a cached one, numFound.
    numFound: Number(payload.numFound ?? payload.num_found ?? listings.length),
    listings,
    raw: isRecord(payload.raw) ? payload.raw : {},
  };
}

function stateCode(value: string | undefined) {
  const found = usStates.find(
    ([code, name]) => code === value || name.toLowerCase() === lower(value),
  );
  return found?.[0];
}

function sourceEndpoint(kind: MarketCheckSourceKind) {
  return kind === "dealer" ? "/search/car/active" : "/search/car/fsbo/active";
}

/** One page of a state's inventory: no filters, newest first. */
function baseParams(state: string, start: number) {
  return new URLSearchParams({
    rows: String(PAGE_SIZE),
    start: String(start),
    country: "us",
    state,
    dedup: "true",
    photo_links: "true",
    sort_by: "last_seen_at",
    sort_order: "desc",
  });
}

function rawHasCleanTitle(listing: MarketCheckListing) {
  return listing.raw.carfax_clean_title === true || listing.raw.carfax_clean_title === 1;
}

/** Bluebird's body styles in MarketCheck's words ("Truck" is "Pickup"). */
const BODY_STYLE_SYNONYMS: Record<string, string[]> = {
  truck: ["pickup", "chassis cab", "truck"],
  van: ["cargo van", "passenger van", "minivan", "van", "car van", "cutaway"],
  suv: ["suv", "crossover"],
  minivan: ["minivan", "mini mpv"],
  car: ["sedan", "coupe", "hatchback", "wagon", "convertible", "targa"],
};

function matchesBodyStyle(selectedStyles: string[], bodyType: string | null) {
  if (!selectedStyles.length) return true;
  const actual = lower(bodyType);
  return selectedStyles.some((style) => (BODY_STYLE_SYNONYMS[style] ?? [style]).includes(actual));
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
  const radiusSearch = hasClassifiedRadiusCenter(data);
  if (state && !radiusSearch && listing.location.state !== state) return false;
  if (data.city && !radiusSearch && lower(listing.location.city) !== lower(data.city)) return false;
  if (data.postalCode && !(listing.location.zip ?? "").startsWith(data.postalCode)) return false;
  const radiusCenter =
    data.latitude != null && data.longitude != null
      ? { latitude: data.latitude, longitude: data.longitude }
      : data.city && data.radiusMiles != null
        ? (() => {
            const point = classifiedCoordinatesForCity(data.city, data.state);
            return point ? { latitude: point[0], longitude: point[1] } : undefined;
          })()
        : undefined;
  if (
    !isWithinClassifiedRadius({
      city: data.city,
      cityState: data.state,
      listingCity: listing.location.city,
      listingState: listing.location.state,
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
  if (!matchesBodyStyle(selected(data.bodyStyle), listing.build.bodyType)) return false;
  if (!equalsAny(selected(data.transmission), listing.build.transmission)) return false;
  if (!equalsAny(selected(data.drivetrain), listing.build.drivetrain)) return false;
  if (
    selected(data.fuelType).length &&
    !selected(data.fuelType).some((fuel) => lower(listing.build.fuelType).includes(fuel))
  )
    return false;
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

type CachedCallResult<T> =
  { ok: true; value: T } | { ok: false; status: MarketCheckLookupStatus; providerStatus?: number };

async function cachedCall<T>(
  key: string,
  endpoint: string,
  normalize: (payload: unknown) => T,
  options?: { forceRefresh?: boolean },
): Promise<CachedCallResult<T>> {
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
  const limit = Number(serverEnv("MARKETCHECK_MONTHLY_CALL_LIMIT") || DEFAULT_MONTHLY_LIMIT);
  const { data: reservation, error: reservationError } = await (db as any).rpc(
    "reserve_marketcheck_call",
    {
      p_cache_key: key,
      p_monthly_limit: Number.isFinite(limit) && limit > 0 ? limit : DEFAULT_MONTHLY_LIMIT,
    },
  );
  if (reservationError || !reservation?.allowed) {
    const { data: stale } = await table.select("payload").eq("cache_key", key).maybeSingle();
    if (stale?.payload) return { ok: true, value: stale.payload as T };
    return {
      ok: false,
      status: reservationError ? "unavailable" : "limited",
    };
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
      if (stale?.payload) return { ok: true, value: stale.payload as T };
      return {
        ok: false,
        status: marketCheckLookupStatus(response.status),
        providerStatus: response.status,
      };
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

async function cachedOnly<T>(key: string): Promise<{ ok: true; value: T } | { ok: false }> {
  const db = cacheDb();
  if (!db) return { ok: false };
  const { data } = await (db as any)
    .from("marketcheck_cache")
    .select("payload")
    .eq("cache_key", key)
    .maybeSingle();
  return data?.payload ? { ok: true, value: data.payload as T } : { ok: false };
}

async function readCachedStateRows(state: string, kind: MarketCheckSourceKind) {
  const db = cacheDb();
  if (!db) return null;
  const pages = state === HOME_STATE ? BASE_PAGES[kind] : OTHER_STATE_PAGES;
  // Read exactly the page offsets this inventory needs. Ordering serialized
  // keys lexicographically before applying a limit can omit page 50 in favor
  // of later offsets (for example, 0, 100, 150, ...), forcing a slow refresh.
  const pageKeys = marketCheckCachePageKeys(state, kind, pages, PAGE_SIZE);
  const { data } = await (db as any)
    .from("marketcheck_cache")
    .select("cache_key,payload,expires_at")
    // Supabase's .in() adds outer quotes but does not escape the quotes
    // inside these JSON keys. Build quoted literals explicitly so PostgREST
    // does not reject the bulk lookup and trigger per-page fallback reads.
    .filter("cache_key", "in", `(${pageKeys.map((key) => JSON.stringify(key)).join(",")})`);
  return (data ?? []) as any[];
}

// Request-local preparation reads only existing cache rows, never the provider.
export function prepareHomeMarketCheckCache() {
  if (!configured()) return undefined;
  return {
    dealer: readCachedStateRows(HOME_STATE, "dealer").catch(() => null),
    fsbo: readCachedStateRows(HOME_STATE, "fsbo").catch(() => null),
  };
}
type PreparedHomeMarketCheckCache = ReturnType<typeof prepareHomeMarketCheckCache>;

async function freshCachedStateInventory(
  state: string, kind: MarketCheckSourceKind, prepared?: Promise<any[] | null>,
) {
  const rows = await (prepared ?? readCachedStateRows(state, kind));
  // Evaluate expiry when consumed, not when preparation started.
  return freshMarketCheckInventory(rows ?? [], state, kind, {
    pages: state === HOME_STATE ? BASE_PAGES[kind] : OTHER_STATE_PAGES,
    pageSize: PAGE_SIZE,
  });
}

async function inventoryPage(
  state: string,
  kind: MarketCheckSourceKind,
  start: number,
  forceRefresh = false,
) {
  const params = baseParams(state, start);
  // v3: v2 pages were cached with a wrong total, which stopped paging at 50.
  const key = JSON.stringify({ v: 3, kind, state, start });
  const result = await cachedCall(
    key,
    `${sourceEndpoint(kind)}?${params.toString()}`,
    (payload) => repairCachedSearch(payload, kind),
    { forceRefresh },
  );
  return result.ok ? result.value : { numFound: 0, listings: [], raw: {} };
}

/** A state's cached inventory for one source (dealer or private seller). */
async function stateInventory(state: string, kind: MarketCheckSourceKind, forceRefresh = false, prepared?: Promise<any[] | null>) {
  if (!forceRefresh) {
    const cached = await freshCachedStateInventory(state, kind, prepared);
    if (cached) return cached;
  }
  const pages = state === HOME_STATE ? BASE_PAGES[kind] : OTHER_STATE_PAGES;
  const all: MarketCheckListing[] = [];
  for (let page = 0; page < pages; page += 1) {
    const result = await inventoryPage(state, kind, page * PAGE_SIZE, forceRefresh);
    // The inventory was requested for this state, so private-seller listings
    // that arrive without one (MarketCheck often leaves it blank) are in it.
    all.push(
      ...result.listings.map((cached) => {
        const listing = finalizeMarketCheckListing(cached);
        return listing.location.state
          ? listing
          : { ...listing, location: { ...listing.location, state } };
      }),
    );
    if (result.listings.length < PAGE_SIZE || all.length >= result.numFound) break;
  }
  // Before the first weekly refresh (or if the month's calls run out), use
  // whatever this source already has cached rather than showing no cars.
  return all.length ? all : cachedListingsOf(kind, state);
}

async function cachedListingsOf(kind: MarketCheckSourceKind, state: string) {
  const db = cacheDb();
  if (!db) return [];
  const { data } = await (db as any)
    .from("marketcheck_cache")
    .select("cache_key,payload")
    .limit(200);
  const listings = new Map<string, MarketCheckListing>();
  for (const row of data ?? []) {
    let cacheKind: string | null = null;
    try {
      cacheKind = JSON.parse(String(row?.cache_key ?? "")).kind ?? null;
    } catch {
      continue;
    }
    if (cacheKind !== kind) continue;
    for (const listing of (row?.payload?.listings ?? []) as MarketCheckListing[]) {
      const found = repairCachedListing(listing, kind);
      const repaired = found ? finalizeMarketCheckListing(found) : null;
      if (repaired && repaired.location.state === state) listings.set(repaired.id, repaired);
    }
  }
  return [...listings.values()];
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
    if (match) return repairCachedListing(match, sourceKind);
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

const PAGE_RAW_KEYS = [
  "interior_color",
  "base_int_color",
  "exterior_color",
  "base_ext_color",
  "carfax_clean_title",
] as const;

function pickRaw(raw: MarketCheckListing["raw"]): MarketCheckListing["raw"] {
  return Object.fromEntries(
    PAGE_RAW_KEYS.filter((key) => raw[key] != null).map((key) => [key, raw[key]!]),
  );
}

export function marketCheckCard(input: MarketCheckListing): ClassifiedCard {
  const listing = finalizeMarketCheckListing(input);
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
    // Only the provider fields the pages read; the full payload stays in the
    // server cache instead of riding along with every card.
    externalVehicle: { ...listing, raw: pickRaw(listing.raw) },
    dealer:
      listing.sourceKind === "dealer" && listing.dealer
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
  options?: { forceRefresh?: boolean; preparedHomeCache?: PreparedHomeMarketCheckCache },
) {
  if (!configured()) return [];
  const inventories = await Promise.all(
    marketCheckStatesForBrowse(data).map((state) =>
      Promise.all([
        stateInventory(state, "dealer", options?.forceRefresh, state === HOME_STATE ? options?.preparedHomeCache?.dealer : undefined),
        stateInventory(state, "fsbo", options?.forceRefresh, state === HOME_STATE ? options?.preparedHomeCache?.fsbo : undefined),
      ]),
    ),
  );
  const dealer = inventories.flatMap(([listings]) => listings);
  const fsbo = inventories.flatMap(([, listings]) => listings);
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
  const canonicalId = canonicalMarketCheckId(listingId);
  const parsed = canonicalId ? parseMarketCheckId(canonicalId) : null;
  if (!parsed || !configured()) return null;
  const key = JSON.stringify({
    v: 1,
    kind: "detail",
    sourceKind: parsed.sourceKind,
    providerId: parsed.providerId,
  });
  // Crawlers see the listing from the cached inventory; only people's visits
  // spend a call on the full details (description).
  const fromBot = BOT.test(getRequest()?.headers.get("user-agent") ?? "");
  const result = fromBot
    ? await cachedOnly<MarketCheckListing | null>(key)
    : await cachedCall(
        key,
        `/listing/${parsed.sourceKind === "dealer" ? "car" : "car/fsbo"}/${encodeURIComponent(parsed.providerId)}`,
        (payload) => normalizeMarketCheckListing(payload, parsed.sourceKind),
      );
  const found =
    result.ok && result.value
      ? result.value
      : await cachedSearchListing(parsed.sourceKind, parsed.providerId);
  if (!found && !fromBot) {
    const providerResult = result as CachedCallResult<MarketCheckListing | null>;
    if (!providerResult.ok && providerResult.status !== "not-found") {
      throw new MarketCheckLookupError(providerResult.status, providerResult.providerStatus);
    }
    // A successful response that cannot be normalized is also an upstream
    // verification failure, rather than proof that the seller removed it.
    if (providerResult.ok) throw new MarketCheckLookupError("unavailable");
  }
  const normalized = found ? finalizeMarketCheckListing(found) : null;
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
  const [dealer, fsbo] = await Promise.all([
    stateInventory(HOME_STATE, "dealer", true),
    stateInventory(HOME_STATE, "fsbo", true),
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
