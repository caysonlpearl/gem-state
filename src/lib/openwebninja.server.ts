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
const CACHE_MS = 30 * 24 * 60 * 60 * 1000;
const API_BASE = "https://api.openwebninja.com/realtime-zillow-data";

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

async function cachedCall<T>(
  key: string,
  path: string,
  normalize: (json: unknown) => T,
): Promise<{ ok: true; value: T } | { ok: false; status: "unavailable" | "limited" }> {
  const apiKey = serverEnv("OPENWEBNINJA_API_KEY");
  const db = cacheDb();
  if (!apiKey || !db) return { ok: false, status: "unavailable" };
  try {
    const { data: reservation, error } = await db.rpc("reserve_openwebninja_call", {
      p_cache_key: key,
    });
    if (error || !reservation) return { ok: false, status: "unavailable" };
    if (reservation.cached) return { ok: true, value: reservation.payload as T };
    if (!reservation.allowed) {
      const { data: stale } = await db
        .from("openwebninja_cache")
        .select("payload")
        .eq("cache_key", key)
        .maybeSingle();
      return stale ? { ok: true, value: stale.payload as T } : { ok: false, status: "limited" };
    }
    const response = await fetch(`${API_BASE}/${path}`, {
      headers: { Accept: "application/json", "x-api-key": apiKey },
      signal: AbortSignal.timeout(15_000),
    });
    if (!response.ok)
      return { ok: false, status: response.status === 429 ? "limited" : "unavailable" };
    const value = normalize(await response.json());
    await db.from("openwebninja_cache").upsert({
      cache_key: key,
      payload: value,
      expires_at: new Date(Date.now() + CACHE_MS).toISOString(),
    });
    return { ok: true, value };
  } catch {
    // Provider errors must not expose request details or the API key.
    return { ok: false, status: "unavailable" };
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
) {
  const key = JSON.stringify({ v: 1, kind: "area-search", state, area: area.key, mode });
  const params = new URLSearchParams({
    lat: String(area.latitude),
    long: String(area.longitude),
    diameter: String(area.diameterMiles),
    home_status: mode === "rent" ? "FOR_RENT" : "FOR_SALE",
    page: "1",
    sort: "NEWEST",
  });
  const result = await cachedCall(key, `search-coordinates?${params.toString()}`, (payload) =>
    normalizeOpenWebNinjaResult(payload, mode),
  );
  return result.ok ? result.value : { status: result.status, homes: [] };
}

export async function propertyDetails(
  id: string,
  sourceUrl?: string | null,
): Promise<
  { ok: true; value: OpenWebNinjaPropertyExtra } | { ok: false; status: "unavailable" | "limited" }
> {
  // v3 invalidates payloads created before rental descriptions were
  // normalized. The provider's zpid lookup is the most reliable detail path
  // for both sale and rental records; keep sourceUrl for the caller contract.
  void sourceUrl;
  const key = JSON.stringify({ v: 3, kind: "property", id });
  const params = new URLSearchParams({ zpid: id });
  return cachedCall(key, `property-details?${params.toString()}`, normalizeOpenWebNinjaProperty);
}

export async function cachedHome(id: string) {
  const db = cacheDb();
  if (!db) return null;
  const { data } = await db
    .from("openwebninja_cache")
    .select("cache_key,payload")
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
