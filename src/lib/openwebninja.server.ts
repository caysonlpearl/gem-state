import { createClient } from "@supabase/supabase-js";
import { withCatalogReadDeadline } from "./catalog-read-deadline";
import { shortCache, PUBLIC_PAGE_CACHE_MS } from "./short-cache.server";
import { serverEnv } from "./runtime-env.server";
import { normalizeRedfinProperty, normalizeRedfinResult } from "./redfin-contract";
import { homeFeedRegion, type HomeProvider } from "./home-feed-regions";
export type { HomeProvider } from "./home-feed-regions";
import {
  hasCompleteHomeDetails,
  propertyCacheFetchedAt,
  propertyCacheFresh,
  HOME_DETAIL_REFRESH_MS,
  homesFromSavedSearches,
  type SavedHomeSearch,
} from "./openwebninja-cache";
import {
  dedupeImageUrls,
  normalizeOpenWebNinjaProperty,
  normalizeOpenWebNinjaResult,
  type OpenWebNinjaHome,
  type OpenWebNinjaMode,
  type OpenWebNinjaPropertyExtra,
} from "./openwebninja-contract";

// OpenWeb Ninja's free plans have a hard limit of 100 calls/month. The
// database reservation enforces that full allowance per existing subscription.
export const CACHE_MS = 30 * 24 * 60 * 60 * 1000;
export const REGIONAL_SEARCH_CACHE_MS = 8 * 86_400_000;
export type HomeProviderAccount = "primary" | "backup";
type HomeRequestBudget = { accounts: HomeProviderAccount[]; reservedSearches: number };

/** Backup access is opt-in per activated subscription. Keys stay server-side;
 * the shared property cache and IDs do not change when the account changes. */
export function homeProviderAccounts(provider: HomeProvider): HomeProviderAccount[] {
  const accounts: HomeProviderAccount[] = [];
  if (
    serverEnv("OPENWEBNINJA_API_KEY") &&
    (provider !== "redfin" || serverEnv("OPENWEBNINJA_REDFIN_ENABLED") === "true")
  )
    accounts.push("primary");
  const backupProviders = (serverEnv("OPENWEBNINJA_BACKUP_HOME_PROVIDERS") || "")
    .split(",")
    .map((value) => value.trim());
  if (
    serverEnv("OPENWEBNINJA_BACKUP_API_KEY") &&
    serverEnv("OPENWEBNINJA_BACKUP_API_KEY") !== serverEnv("OPENWEBNINJA_API_KEY") &&
    backupProviders.includes(provider)
  )
    accounts.push("backup");
  return accounts;
}
/**
 * Three independent subscriptions own disjoint Idaho regions. Redfin uses
 * its own endpoint schema and property ID namespace.
 */
const API_BASES: Record<HomeProvider, string> = {
  redfin: "https://api.openwebninja.com/real-time-redfin-data",
  zillow: "https://api.openwebninja.com/realtime-zillow-data",
  realestate: "https://api.openwebninja.com/realtime-real-estate-data/zillow",
};

export function cacheDb() {
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
        return fetch(url, { ...init, headers, signal: init?.signal ?? AbortSignal.timeout(8000) });
      },
    },
  });
}

async function cachedCall<T>(
  key: string,
  path: string,
  normalize: (json: unknown) => T,
  options?: {
    forceRefresh?: boolean;
    ttlMs?: number;
    provider?: HomeProvider;
    account?: HomeProviderAccount;
    budget?: HomeRequestBudget;
    allowStale?: boolean;
  },
): Promise<{ ok: true; value: T } | { ok: false; status: "unavailable" | "limited" }> {
  const ttlMs = options?.ttlMs ?? CACHE_MS;
  const provider = options?.provider ?? "zillow";
  const account = options?.account ?? "primary";
  const apiKey = serverEnv(
    account === "backup" ? "OPENWEBNINJA_BACKUP_API_KEY" : "OPENWEBNINJA_API_KEY",
  );
  const db = cacheDb();
  if (!apiKey || !db || !homeProviderAccounts(provider).includes(account))
    return { ok: false, status: "unavailable" };
  const forceRefresh = options?.forceRefresh === true;
  let previousPayload: T | null = null;
  let previousExpiresAt: string | null = null;
  const restorePrevious = async () => {
    if (!previousPayload || !previousExpiresAt) return;
    try {
      await db
        .from("openwebninja_cache")
        .upsert({ cache_key: key, payload: previousPayload, expires_at: previousExpiresAt });
    } catch {
      /* Retain the in-memory fallback if storage is unavailable. */
    }
  };
  try {
    if (forceRefresh) {
      const { data: previous } = await db
        .from("openwebninja_cache")
        .select("payload,expires_at")
        .eq("cache_key", key)
        .maybeSingle();
      previousPayload = (previous?.payload as T | undefined) ?? null;
      previousExpiresAt = previous?.expires_at ?? null;
      await db.from("openwebninja_cache").delete().eq("cache_key", key);
    }
    const { data: reservation, error } = options?.budget
      ? await db.rpc("reserve_openwebninja_home_call", {
          p_cache_key: key,
          p_provider: provider,
          p_account: account,
          p_accounts: options.budget.accounts,
          p_reserved_searches: options.budget.reservedSearches,
        })
      : account === "backup"
        ? await db.rpc("reserve_openwebninja_account_call", {
            p_cache_key: key,
            p_provider: provider,
            p_account: account,
          })
        : provider === "zillow"
          ? await db.rpc("reserve_openwebninja_call", { p_cache_key: key })
          : await db.rpc("reserve_openwebninja_provider_call", {
              p_cache_key: key,
              p_provider: provider,
            });
    if (error || !reservation) {
      await restorePrevious();
      return previousPayload && options?.allowStale !== false
        ? { ok: true, value: previousPayload }
        : { ok: false, status: "unavailable" };
    }
    if (reservation.cached) return { ok: true, value: reservation.payload as T };
    if (!reservation.allowed) {
      await restorePrevious();
      if (options?.allowStale === false) return { ok: false, status: "limited" };
      const { data: stale } = await db
        .from("openwebninja_cache")
        .select("payload")
        .eq("cache_key", key)
        .maybeSingle();
      if (stale) return { ok: true, value: stale.payload as T };
      if (previousPayload) {
        // A forced refresh removed the saved copy; put it back unchanged.
        await restorePrevious();
        return { ok: true, value: previousPayload };
      }
      return { ok: false, status: "limited" };
    }
    const response = await fetch(`${API_BASES[provider]}/${path}`, {
      headers: { Accept: "application/json", "x-api-key": apiKey },
      signal: AbortSignal.timeout(15_000),
    });
    if (!response.ok) {
      await restorePrevious();
      if (previousPayload && options?.allowStale !== false) {
        return { ok: true, value: previousPayload };
      }
      return { ok: false, status: response.status === 429 ? "limited" : "unavailable" };
    }
    const value = normalize(await response.json());
    const saved = await db.from("openwebninja_cache").upsert({
      cache_key: key,
      payload: value,
      expires_at: new Date(Date.now() + ttlMs).toISOString(),
    });
    if (saved.error) {
      await restorePrevious();
      return previousPayload && options?.allowStale !== false
        ? { ok: true, value: previousPayload }
        : { ok: false, status: "unavailable" };
    }
    return { ok: true, value };
  } catch {
    // Provider errors must not expose request details or the API key.
    await restorePrevious();
    return previousPayload && options?.allowStale !== false
      ? { ok: true, value: previousPayload }
      : { ok: false, status: "unavailable" };
  }
}

export function openWebNinjaConfigured(provider?: HomeProvider) {
  return homeProviderAccounts(provider ?? "zillow").length > 0;
}

/** A regional source remains authoritative even while its price feed is
 * unavailable. An expired regional feed must never resurrect older legacy data. */
async function regionalSourceAreas(): Promise<Set<string>> {
  const db = cacheDb();
  if (!db) return new Set();
  return shortCache("openwebninja-regional-source-areas", PUBLIC_PAGE_CACHE_MS, async () => {
    const { data, error } = await withCatalogReadDeadline(
      db
        .from("openwebninja_cache")
        .select("cache_key")
        .like("cache_key", '%"v":3,"kind":"area-search"%')
        .limit(100),
    );
    if (error) throw new Error("Saved regional sources are unavailable.");
    const areas = new Set<string>();
    for (const row of data ?? [])
      try {
        const key = JSON.parse(row.cache_key);
        if (key.v === 3 && key.kind === "area-search" && typeof key.area === "string")
          areas.add(key.area);
      } catch {
        /* Ignore malformed metadata. */
      }
    return areas;
  });
}

/** Public reads never reserve provider calls. Regional inventory also covers
 * cities without a separate paid city search, such as Twin Falls. */
export async function cachedHomes(propertyId?: string): Promise<OpenWebNinjaHome[]> {
  const db = cacheDb();
  if (!db) return [];
  const key = propertyId
    ? `openwebninja-public-searches:${propertyId}`
    : "openwebninja-public-searches";
  const rows = await shortCache(key, PUBLIC_PAGE_CACHE_MS, async () => {
    let query = db
      .from("openwebninja_cache")
      .select("cache_key,payload,expires_at")
      .like("cache_key", '%search"%')
      .gt("expires_at", new Date().toISOString())
      .order("expires_at", { ascending: false })
      .limit(100);
    // A detail needs only feeds that actually contain this property. Keep
    // the same source/expiry gates and newest-copy selection as browse,
    // without transferring every statewide search into a cold worker.
    if (propertyId) query = query.contains("payload", { homes: [{ id: propertyId }] });
    const { data, error } = await withCatalogReadDeadline(query);
    if (error) throw new Error("Saved homes are temporarily unavailable.");
    const saved = (data ?? []) as SavedHomeSearch[];
    homesFromSavedSearches(saved); // Reject malformed payloads before storing a memory hit.
    return saved;
  });
  // Recheck source expiry on every read, including memory hits. A failed
  // load is evicted; a successful empty search replaces the previous rows.
  return homesFromSavedSearches(rows, Date.now(), await regionalSourceAreas());
}

/** Cache-only eligibility shared by browse, related results and sitemaps. */
async function completeHomeCacheEntries(): Promise<
  Map<string, { imageUrl: string; cache_key: string; expires_at: string }>
> {
  const db = cacheDb();
  if (!db) return new Map();
  return shortCache("openwebninja-complete-detail-monthly-v4", PUBLIC_PAGE_CACHE_MS, async () => {
    const { data, error } = await withCatalogReadDeadline(
      db
        .from("openwebninja_cache")
        .select(
          "cache_key,expires_at,images:payload->images,description:payload->description,bedrooms:payload->bedrooms,bathrooms:payload->bathrooms,squareFeet:payload->squareFeet,yearBuilt:payload->yearBuilt",
        )
        .like("cache_key", '%"kind":"property"%')
        .limit(5000),
    );
    if (error) throw new Error("Saved property details are temporarily unavailable.");
    const images = new Map<string, { imageUrl: string; cache_key: string; expires_at: string }>();
    for (const row of data ?? []) {
      if (!hasCompleteHomeDetails(row)) continue;
      try {
        const key = JSON.parse(row.cache_key);
        if (
          key.kind === "property" &&
          typeof key.id === "string" &&
          (!images.has(key.id) ||
            propertyCacheFetchedAt(row) > propertyCacheFetchedAt(images.get(key.id)!))
        )
          images.set(key.id, {
            cache_key: row.cache_key,
            expires_at: row.expires_at,
            imageUrl: dedupeImageUrls(
              (row.images as unknown[]).filter(
                (image): image is string => typeof image === "string",
              ),
            )[0],
          });
      } catch {
        /* Malformed cache keys cannot publish homes. */
      }
    }
    return images;
  });
}

export async function completeHomeThumbnails(): Promise<Map<string, string>> {
  return new Map(
    [...(await completeHomeCacheEntries())]
      .filter(([, row]) => propertyCacheFresh(row))
      .map(([id, row]) => [id, row.imageUrl]),
  );
}
export async function propertyDetailRefreshIds(): Promise<Set<string>> {
  return new Set(
    [...(await completeHomeCacheEntries())]
      .filter(([, row]) => !propertyCacheFresh(row))
      .map(([id]) => id),
  );
}

export async function completeHomeDetailIds(): Promise<Set<string>> {
  return new Set((await completeHomeThumbnails()).keys());
}

export type OpenWebNinjaSearchArea = {
  key: string;
  latitude: number;
  longitude: number;
  diameterMiles: number;
  bounds?: { north: number; south: number; east: number; west: number };
};

export async function searchHomes(state: string, city: string, mode: OpenWebNinjaMode) {
  const region = homeFeedRegion({ city, state, latitude: null, longitude: null });
  if (!region) return { status: "unavailable" as const, homes: [] };
  const result = await searchHomesArea(state, region, mode, { provider: region.provider });
  return {
    ...result,
    homes: result.homes.filter((home) => home.city.toLowerCase() === city.toLowerCase()),
  };
}

export async function searchHomesArea(
  state: string,
  area: OpenWebNinjaSearchArea,
  mode: OpenWebNinjaMode,
  options?: {
    forceRefresh?: boolean;
    provider?: HomeProvider;
    page?: number;
    account?: HomeProviderAccount;
  },
) {
  const provider = options?.provider ?? "zillow";
  if (!openWebNinjaConfigured(provider)) return { status: "unavailable" as const, homes: [] };
  const page = options?.page ?? 1;
  const key = areaSearchKey(state, area.key, mode, provider, page);
  const params = new URLSearchParams({ page: String(page) });
  if (provider === "redfin") {
    params.set("status", mode === "rent" ? "for_rent" : "for_sale");
    params.set("sort", "newest");
    params.set("num_homes", "350");
    params.set("country_code", "US");
  } else {
    params.set("home_status", mode === "rent" ? "FOR_RENT" : "FOR_SALE");
    params.set("sort", "NEWEST");
  }
  let path = "search-coordinates";
  if (area.bounds && provider === "redfin") {
    // Redfin's polygon endpoint returned no North Idaho homes while its
    // coordinate endpoint returned inventory for the same rectangular bounds.
    params.set("ne_lat", String(area.bounds.north));
    params.set("ne_lng", String(area.bounds.east));
    params.set("sw_lat", String(area.bounds.south));
    params.set("sw_lng", String(area.bounds.west));
  } else if (area.bounds) {
    const b = area.bounds;
    params.set(
      "polygon",
      `${b.west} ${b.south},${b.east} ${b.south},${b.east} ${b.north},${b.west} ${b.north}`,
    );
    path = "search-polygon";
  } else if (provider === "redfin") {
    const dy = area.diameterMiles / 138,
      dx = dy / Math.cos((area.latitude * Math.PI) / 180);
    params.set("ne_lat", String(area.latitude + dy));
    params.set("ne_lng", String(area.longitude + dx));
    params.set("sw_lat", String(area.latitude - dy));
    params.set("sw_lng", String(area.longitude - dx));
  } else {
    params.set("lat", String(area.latitude));
    params.set("long", String(area.longitude));
    params.set("diameter", String(area.diameterMiles));
  }
  const result = await cachedCall(
    key,
    `${path}?${params}`,
    (payload) => {
      const normalized =
        provider === "redfin"
          ? normalizeRedfinResult(payload, mode)
          : normalizeOpenWebNinjaResult(payload, mode);
      return {
        ...normalized,
        homes: normalized.homes
          .filter((home) => homeFeedRegion(home)?.key === area.key)
          .map((home) => ({ ...home, provider })),
      };
    },
    { ...options, provider, ttlMs: REGIONAL_SEARCH_CACHE_MS },
  );
  return result.ok ? result.value : { status: result.status, homes: [] };
}

/** Full details are fetched once per home and refreshed monthly; the weekly
 * list refresh is what keeps price and availability current. */
const DETAIL_TTL_MS = HOME_DETAIL_REFRESH_MS;

export const areaSearchKey = (
  state: string,
  area: string,
  mode: OpenWebNinjaMode,
  provider?: HomeProvider,
  page = 1,
) =>
  provider
    ? JSON.stringify({
        v: 3,
        kind: "area-search",
        state,
        area,
        mode,
        provider,
        page,
        ...(provider === "redfin" ? { method: "coordinates", numHomes: 350 } : {}),
      })
    : JSON.stringify({ v: 1, kind: "area-search", state, area, mode });

export const propertyKey = (id: string) => JSON.stringify({ v: 4, kind: "property", id });

export async function propertyDetails(
  id: string,
  sourceUrl?: string | null,
  options?: {
    cacheOnly?: boolean;
    provider?: HomeProvider;
    account?: HomeProviderAccount;
    budget?: HomeRequestBudget;
  },
): Promise<
  { ok: true; value: OpenWebNinjaPropertyExtra } | { ok: false; status: "unavailable" | "limited" }
> {
  // v4 uses monthly freshness; legacy complete records are reused only while
  // still within that same freshness window. Each source retains its own ID.
  void sourceUrl;
  const key = propertyKey(id);
  // Details fetched before the v3 key were paid for and are still good;
  // use them instead of spending another call (or showing nothing when the
  // daily budget is used up).
  const db = cacheDb();
  if (db) {
    const { data: rows, error } = await withCatalogReadDeadline(
      db
        .from("openwebninja_cache")
        .select("cache_key,payload,expires_at")
        // A pattern, not .in(): these JSON keys contain commas, which break
        // PostgREST's in-list and silently match nothing.
        .like("cache_key", `%"kind":"property","id":"${id.replace(/[^0-9A-Za-z_-]/g, "")}"}`),
    );
    if (error) throw new Error("Saved property details are temporarily unavailable.");
    const saved = (rows ?? [])
      .filter((row) => hasCompleteHomeDetails(row.payload) && propertyCacheFresh(row))
      .sort((a, b) => propertyCacheFetchedAt(b) - propertyCacheFetchedAt(a))[0]?.payload;
    if (saved) return { ok: true, value: saved as OpenWebNinjaPropertyExtra };
  }
  // Visitors never spend calls: details come from the scheduled homes job.
  if (options?.cacheOnly) return { ok: false, status: "limited" };
  const provider = options?.provider;
  if (!provider || !openWebNinjaConfigured(provider)) return { ok: false, status: "unavailable" };
  const currentHome = await cachedHome(id);
  if (
    !currentHome ||
    homeFeedRegion(currentHome.home)?.provider !== provider ||
    id.startsWith("redfin-") !== (provider === "redfin")
  )
    return { ok: false, status: "unavailable" };
  const detailParams = new URLSearchParams(
    provider === "redfin" ? { property_id: id.slice("redfin-".length) } : { zpid: id },
  );
  const result = await cachedCall(
    key,
    `property-details?${detailParams.toString()}`,
    (payload) => {
      const value =
        provider === "redfin"
          ? normalizeRedfinProperty(payload)
          : normalizeOpenWebNinjaProperty(payload);
      if (!hasCompleteHomeDetails(value)) throw new Error("Incomplete property response");
      return value;
    },
    {
      ttlMs: DETAIL_TTL_MS,
      allowStale: false,
      provider: options?.provider,
      account: options?.account,
      budget: options?.budget,
    },
  );
  // Failed refreshes may retain an old partial payload. It is still not a
  // completed detail fetch, and must not advance the importer's success count.
  if (result.ok && !hasCompleteHomeDetails(result.value))
    return { ok: false, status: "unavailable" };
  return result;
}

export async function cachedHome(id: string) {
  // Detail visibility and sale/rent mode agree with the current browse cache.
  const homes = await cachedHomes(id);
  const home = homes.find((item) => item.id === id);
  return home
    ? {
        home,
        siblings: homes.filter(
          (item) => item.city === home.city && item.state === home.state && item.mode === home.mode,
        ),
      }
    : null;
}
