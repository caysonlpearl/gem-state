import { createClient } from "@supabase/supabase-js";
import { serverEnv } from "./runtime-env.server";
import {
  normalizeOpenWebNinjaProperty,
  normalizeOpenWebNinjaResult,
  type OpenWebNinjaHome,
  type OpenWebNinjaMode,
  type OpenWebNinjaPropertyExtra,
} from "./openwebninja-contract";

// OpenWeb Ninja's free plan allows 100 calls/month. The database reservation
// function keeps a ten-call buffer for manual testing and transient retries.
export const CACHE_MS = 30 * 24 * 60 * 60 * 1000;
const API_BASE = "https://api.openwebninja.com/realtime-zillow-data";

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
        return fetch(url, { ...init, headers, signal: AbortSignal.timeout(8000) });
      },
    },
  });
}

async function cachedCall<T>(
  key: string,
  path: string,
  normalize: (json: unknown) => T,
  options?: { forceRefresh?: boolean; ttlMs?: number },
): Promise<{ ok: true; value: T } | { ok: false; status: "unavailable" | "limited" }> {
  const ttlMs = options?.ttlMs ?? CACHE_MS;
  const apiKey = serverEnv("OPENWEBNINJA_API_KEY");
  const db = cacheDb();
  if (!apiKey || !db) return { ok: false, status: "unavailable" };
  const forceRefresh = options?.forceRefresh === true;
  let previousPayload: T | null = null;
  try {
    if (forceRefresh) {
      const { data: previous } = await db
        .from("openwebninja_cache")
        .select("payload")
        .eq("cache_key", key)
        .maybeSingle();
      previousPayload = (previous?.payload as T | undefined) ?? null;
      await db.from("openwebninja_cache").delete().eq("cache_key", key);
    }
    const { data: reservation, error } = await db.rpc("reserve_openwebninja_call", {
      p_cache_key: key,
    });
    if (error || !reservation)
      return previousPayload
        ? { ok: true, value: previousPayload }
        : { ok: false, status: "unavailable" };
    if (reservation.cached) return { ok: true, value: reservation.payload as T };
    if (!reservation.allowed) {
      const { data: stale } = await db
        .from("openwebninja_cache")
        .select("payload")
        .eq("cache_key", key)
        .maybeSingle();
      if (stale) return { ok: true, value: stale.payload as T };
      if (previousPayload) {
        // A forced refresh removed the saved copy; put it back unchanged.
        await db.from("openwebninja_cache").upsert({
          cache_key: key,
          payload: previousPayload,
          expires_at: new Date(Date.now() + ttlMs).toISOString(),
        });
        return { ok: true, value: previousPayload };
      }
      return { ok: false, status: "limited" };
    }
    const response = await fetch(`${API_BASE}/${path}`, {
      headers: { Accept: "application/json", "x-api-key": apiKey },
      signal: AbortSignal.timeout(15_000),
    });
    if (!response.ok) {
      if (previousPayload) {
        await db.from("openwebninja_cache").upsert({
          cache_key: key,
          payload: previousPayload,
          expires_at: new Date(Date.now() + ttlMs).toISOString(),
        });
        return { ok: true, value: previousPayload };
      }
      return { ok: false, status: response.status === 429 ? "limited" : "unavailable" };
    }
    const value = normalize(await response.json());
    await db.from("openwebninja_cache").upsert({
      cache_key: key,
      payload: value,
      expires_at: new Date(Date.now() + ttlMs).toISOString(),
    });
    return { ok: true, value };
  } catch {
    // Provider errors must not expose request details or the API key.
    return previousPayload
      ? { ok: true, value: previousPayload }
      : { ok: false, status: "unavailable" };
  }
}

export function openWebNinjaConfigured() {
  return Boolean(serverEnv("OPENWEBNINJA_API_KEY"));
}

export type OpenWebNinjaSearchArea = {
  key: string;
  latitude: number;
  longitude: number;
  diameterMiles: number;
};

export async function searchHomes(state: string, city: string, mode: OpenWebNinjaMode) {
  const key = JSON.stringify({ v: 1, kind: "search", state, city: city.toLowerCase(), mode });
  const params = new URLSearchParams({
    location: `${city}, ${state}`,
    home_status: mode === "rent" ? "FOR_RENT" : "FOR_SALE",
    page: "1",
    sort: "NEWEST",
  });
  const result = await cachedCall(key, `search?${params.toString()}`, (payload) =>
    normalizeOpenWebNinjaResult(payload, mode),
  );
  return result.ok ? result.value : { status: result.status, homes: [] };
}

export async function searchHomesArea(
  state: string,
  area: OpenWebNinjaSearchArea,
  mode: OpenWebNinjaMode,
  options?: { forceRefresh?: boolean },
) {
  const key = areaSearchKey(state, area.key, mode);
  const params = new URLSearchParams({
    lat: String(area.latitude),
    long: String(area.longitude),
    diameter: String(area.diameterMiles),
    home_status: mode === "rent" ? "FOR_RENT" : "FOR_SALE",
    page: "1",
    sort: "NEWEST",
  });
  const result = await cachedCall(
    key,
    `search-coordinates?${params.toString()}`,
    (payload) => normalizeOpenWebNinjaResult(payload, mode),
    options,
  );
  return result.ok ? result.value : { status: result.status, homes: [] };
}

/** Full details are fetched once per home and kept for a year; the weekly
 * list refresh is what keeps price and availability current. */
const DETAIL_TTL_MS = 365 * 24 * 60 * 60 * 1000;

export const areaSearchKey = (state: string, area: string, mode: OpenWebNinjaMode) =>
  JSON.stringify({ v: 1, kind: "area-search", state, area, mode });

export const propertyKey = (id: string) => JSON.stringify({ v: 3, kind: "property", id });

export async function propertyDetails(
  id: string,
  sourceUrl?: string | null,
  options?: { cacheOnly?: boolean },
): Promise<
  { ok: true; value: OpenWebNinjaPropertyExtra } | { ok: false; status: "unavailable" | "limited" }
> {
  // v3 invalidates payloads created before rental descriptions were
  // normalized. The provider's zpid lookup is the most reliable detail path
  // for both sale and rental records; keep sourceUrl for the caller contract.
  void sourceUrl;
  const key = propertyKey(id);
  const params = new URLSearchParams({ zpid: id });
  // Details fetched before the v3 key were paid for and are still good;
  // use them instead of spending another call (or showing nothing when the
  // daily budget is used up).
  const db = cacheDb();
  if (db) {
    const { data: rows } = await db
      .from("openwebninja_cache")
      .select("cache_key,payload")
      .in("cache_key", [
        key,
        JSON.stringify({ v: 2, kind: "property", id }),
        JSON.stringify({ v: 1, kind: "property", id }),
      ]);
    const current = (rows ?? []).find((row: { cache_key: string }) => row.cache_key === key);
    const legacy = (rows ?? []).find((row: { cache_key: string }) => row.cache_key !== key);
    const saved = current?.payload ?? legacy?.payload;
    if (saved) return { ok: true, value: saved as OpenWebNinjaPropertyExtra };
  }
  // Visitors never spend calls: details come from the scheduled homes job.
  if (options?.cacheOnly) return { ok: false, status: "limited" };
  return cachedCall(key, `property-details?${params.toString()}`, normalizeOpenWebNinjaProperty, {
    ttlMs: DETAIL_TTL_MS,
  });
}

export async function cachedHome(id: string) {
  const db = cacheDb();
  if (!db) return null;
  const { data } = await db
    .from("openwebninja_cache")
    .select("cache_key,payload")
    // Only the home lists; saved details (kept a year) would crowd them out.
    .like("cache_key", '%search"%')
    .order("expires_at", { ascending: false })
    .limit(100);
  for (const row of data ?? []) {
    let key: { kind?: string } | null = null;
    try {
      key = JSON.parse(String(row.cache_key)) as { kind?: string };
    } catch {
      continue;
    }
    if (key?.kind !== "search" && key?.kind !== "area-search") continue;
    const payload = row.payload as { homes?: OpenWebNinjaHome[] };
    const home = payload.homes?.find((item) => item.id === id);
    if (home) return { home, siblings: payload.homes ?? [] };
  }
  return null;
}
