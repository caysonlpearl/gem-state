/* eslint-disable @typescript-eslint/no-explicit-any -- tables added after the generated types */
import { idahoPlaces } from "../config/idaho-places.ts";
import { serverEnv } from "./runtime-env.server";
import { logoImageUrl } from "./employer-logo-match.ts";
import {
  DIRECTORY_COLUMNS,
  DIRECTORY_ID,
  directoryCard,
  enrichmentFrom,
  matchBusiness,
  websiteDomain,
  type DirectoryRow,
} from "./service-directory-contract.ts";
import type {
  ClassifiedBrowseInput,
  ClassifiedCard,
  ClassifiedDetail,
} from "./classifieds.functions";

const ENRICH_AFTER_MS = 90 * 24 * 3600 * 1000;
const MILES_PER_DEGREE_LAT = 69;

async function db() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin as any;
}

function logoFor(row: DirectoryRow) {
  const key = serverEnv("LOGO_DEV_PUBLISHABLE_KEY");
  const domain = websiteDomain(row.enrichment?.website ?? row.website);
  return key && domain ? logoImageUrl(domain, key) : null;
}

/**
 * One page of directory businesses for a Services search, after `offset`
 * of them. Claimed and recently confirmed businesses come first.
 */
export async function directoryCards(
  data: ClassifiedBrowseInput,
  offset: number,
  limit: number,
): Promise<{ cards: ClassifiedCard[]; total: number }> {
  try {
    let query = (await db())
      .from("service_directory")
      .select(DIRECTORY_COLUMNS, { count: "exact" })
      .eq("hidden", false)
      .eq("state", "ID");
    if (data.latitude != null && data.longitude != null && data.radiusMiles != null) {
      const dLat = data.radiusMiles / MILES_PER_DEGREE_LAT;
      const dLon = dLat / Math.max(0.2, Math.cos((data.latitude * Math.PI) / 180));
      query = query
        .gte("latitude", data.latitude - dLat)
        .lte("latitude", data.latitude + dLat)
        .gte("longitude", data.longitude - dLon)
        .lte("longitude", data.longitude + dLon);
    } else if (data.city) {
      query = query.ilike("city", data.city.replace(/[%_]/g, ""));
    }
    if (data.region) {
      const cities = idahoPlaces.filter((place) => place[1] === data.region).map((p) => p[0]);
      query = query.in("city", cities.length ? cities : ["-"]);
    }
    if (data.postalCode) query = query.eq("postcode", data.postalCode);
    if (data.serviceSubcategory) query = query.contains("trades", [data.serviceSubcategory]);
    const q = data.q?.replace(/[%_,()]/g, " ").trim();
    if (q) query = query.or(`name.ilike.%${q}%,trade.ilike.%${q}%`);
    query = query
      .order("claimed_at", { ascending: false, nullsFirst: false })
      .order("priority", { ascending: true })
      .order("source_refreshed_at", { ascending: false, nullsFirst: false })
      .order("name", { ascending: true });
    const {
      data: rows,
      count,
      error,
    } = limit > 0 ? await query.range(offset, offset + limit - 1) : await query.limit(1);
    if (error) return { cards: [], total: 0 };
    return {
      cards:
        limit > 0
          ? ((rows ?? []) as DirectoryRow[]).map((row) => directoryCard(row, logoFor(row)))
          : [],
      total: count ?? 0,
    };
  } catch {
    return { cards: [], total: 0 };
  }
}

/** A directory business as a listing page, with hours and rating looked up when stale. */
export async function directoryDetail(listingId: string): Promise<ClassifiedDetail | null> {
  if (!DIRECTORY_ID.test(listingId)) return null;
  const client = await db();
  const { data } = await client
    .from("service_directory")
    .select(DIRECTORY_COLUMNS)
    .eq("id", listingId)
    .eq("hidden", false)
    .maybeSingle();
  let row = data as DirectoryRow | null;
  if (!row) return null;
  const stale = !row.enriched_at || Date.now() - Date.parse(row.enriched_at) > ENRICH_AFTER_MS;
  if (stale) {
    const enriched = await enrich(row).catch(() => null);
    if (enriched === "closed") return null;
    if (enriched) row = enriched;
  }
  const card = directoryCard(row, logoFor(row));
  return {
    ...card,
    listingNumber: row.id.slice(4, 12).toUpperCase(),
    description: null,
    expiresAt: null,
    sellerNote: null,
    variantId: row.id,
    seller: null,
    images: [],
  } as unknown as ClassifiedDetail;
}

/**
 * Looks the business up once through OpenWeb Ninja's Local Business Data API
 * (500 requests a month, budgeted in the database) and keeps what matched:
 * hours, Google rating and a confirmed phone and website. A business Google
 * lists as permanently closed is hidden.
 */
async function enrich(row: DirectoryRow): Promise<DirectoryRow | "closed" | null> {
  const apiKey = serverEnv("OPENWEBNINJA_API_KEY");
  if (!apiKey) return null;
  const client = await db();
  const { data: allowed, error } = await client.rpc("reserve_service_enrichment", {
    p_directory_id: row.id,
  });
  if (error || !allowed) return null;
  const params = new URLSearchParams({
    query: `${row.name} ${row.city}, ${row.state}`,
    limit: "3",
    region: "us",
    language: "en",
  });
  if (row.latitude != null && row.longitude != null) {
    params.set("lat", String(row.latitude));
    params.set("lng", String(row.longitude));
  }
  const response = await fetch(
    `https://api.openwebninja.com/local-business-data/search?${params.toString()}`,
    {
      headers: { Accept: "application/json", "x-api-key": apiKey },
      signal: AbortSignal.timeout(6000),
    },
  );
  if (!response.ok) return null;
  const body = (await response.json()) as { data?: unknown };
  const match = matchBusiness(row, Array.isArray(body.data) ? body.data : []);
  const now = new Date().toISOString();
  // No match is still an answer: don't ask again for 90 days.
  const enrichment = match ? enrichmentFrom(match) : null;
  const update = {
    enrichment,
    enriched_at: now,
    updated_at: now,
    ...(enrichment?.closed ? { hidden: true } : {}),
  };
  await client.from("service_directory").update(update).eq("id", row.id);
  if (enrichment?.closed) return "closed";
  return { ...row, enrichment, enriched_at: now };
}

/** How many businesses each trade has, for the Services category lists. */
export async function directoryTradeCounts(): Promise<Record<string, number>> {
  try {
    const { data, error } = await (await db()).rpc("service_directory_trade_counts");
    if (error) return {};
    return Object.fromEntries(
      ((data ?? []) as { trade: string; n: number }[]).map((row) => [row.trade, Number(row.n)]),
    );
  } catch {
    return {};
  }
}
