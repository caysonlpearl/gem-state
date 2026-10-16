/* eslint-disable @typescript-eslint/no-explicit-any -- tables added after the generated types */
import { findIdahoPlace, idahoPlaces } from "../config/idaho-places.ts";
import { serverEnv } from "./runtime-env.server";
import { logoImageUrl } from "./employer-logo-match.ts";
import {
  DIRECTORY_COLUMNS,
  DIRECTORY_ID,
  directoryCard,
  enrichmentFrom,
  matchBusiness,
  nextRatingBatch,
  phoneDigits,
  ratingBatchKey,
  TRADE_SEARCH_TERMS,
  websiteDomain,
  type DirectoryRow,
} from "./service-directory-contract.ts";
import type {
  ClassifiedBrowseInput,
  ClassifiedCard,
  ClassifiedDetail,
} from "./classifieds.functions";

const ENRICH_AFTER_MS = 90 * 24 * 3600 * 1000;

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
    // The directory only covers Idaho.
    if (data.state && !/^(id|idaho)$/i.test(data.state)) return { cards: [], total: 0 };
    // A distance search centers on the chosen map point, or the chosen city.
    const place = data.city ? findIdahoPlace(data.city) : undefined;
    const center =
      data.latitude != null && data.longitude != null
        ? { latitude: data.latitude, longitude: data.longitude }
        : place
          ? { latitude: place[2], longitude: place[3] }
          : null;
    const q = data.q?.replace(/[%_,()]/g, " ").trim();
    if (center && data.radiusMiles != null && !data.region && !data.postalCode) {
      return nearbyCards(center, data.radiusMiles, data.serviceSubcategory, q, offset, limit);
    }
    if (data.city) {
      query = query.ilike("city", data.city.replace(/[%_]/g, ""));
    }
    if (data.region) {
      const cities = idahoPlaces.filter((place) => place[1] === data.region).map((p) => p[0]);
      query = query.in("city", cities.length ? cities : ["-"]);
    }
    if (data.postalCode) query = query.eq("postcode", data.postalCode);
    if (data.serviceSubcategory) query = query.contains("trades", [data.serviceSubcategory]);
    if (q) query = query.or(`name.ilike.%${q}%,trade.ilike.%${q}%`);
    query = query
      .order("claimed_at", { ascending: false, nullsFirst: false })
      .order("priority", { ascending: true })
      // The most-reviewed businesses on Google first: a fair proxy for the
      // pros people actually use.
      .order("enrichment->reviewCount", { ascending: false, nullsFirst: false })
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

/** Directory businesses within a true distance of a point, one page at a time. */
async function nearbyCards(
  center: { latitude: number; longitude: number },
  miles: number,
  trade: string | undefined,
  q: string | undefined,
  offset: number,
  limit: number,
): Promise<{ cards: ClassifiedCard[]; total: number }> {
  const client = await db();
  const { data: hits, error } = await client.rpc("service_directory_nearby", {
    p_lat: center.latitude,
    p_lon: center.longitude,
    p_miles: miles,
    p_trade: trade ?? null,
    p_q: q || null,
    p_offset: offset,
    p_limit: Math.max(limit, 1),
  });
  if (error) return { cards: [], total: 0 };
  const page = (hits ?? []) as { id: string; total: number }[];
  const total = Number(page[0]?.total ?? 0);
  const ids = limit > 0 ? page.map((hit) => hit.id) : [];
  if (!ids.length) return { cards: [], total };
  const { data: rows } = await client
    .from("service_directory")
    .select(DIRECTORY_COLUMNS)
    .in("id", ids);
  const byId = new Map(((rows ?? []) as DirectoryRow[]).map((row) => [row.id, row]));
  return {
    cards: ids.flatMap((id) => {
      const row = byId.get(id);
      return row ? [directoryCard(row, logoFor(row))] : [];
    }),
    total,
  };
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

/**
 * Rates a whole trade in a town with one Local Business Data search (up to
 * 50 businesses per request): results are matched to directory businesses
 * by phone number and their Google rating, hours and description kept.
 * Runs from the scheduled job, one batch per run, inside the same database
 * budget as page lookups.
 */
export async function rateNextTradeCity(): Promise<{
  trade: string;
  city: string;
  rated: number;
} | null> {
  const apiKey = serverEnv("OPENWEBNINJA_API_KEY");
  if (!apiKey) return null;
  const client = await db();
  const { data: recent } = await client
    .from("service_enrichment_requests")
    .select("directory_id")
    .like("directory_id", "batch:%")
    .gte("created_at", new Date(Date.now() - 30 * 24 * 3600 * 1000).toISOString());
  const next = nextRatingBatch(
    new Set(((recent ?? []) as { directory_id: string }[]).map((row) => row.directory_id)),
  );
  if (!next) return null;
  // Leave a few of the day's 20 lookups for pages people open.
  const { count: today } = await client
    .from("service_enrichment_requests")
    .select("id", { count: "exact", head: true })
    .gte("created_at", new Date(Date.now() - 24 * 3600 * 1000).toISOString());
  if ((today ?? 0) >= 14) return null;
  const { data: allowed, error } = await client.rpc("reserve_service_enrichment", {
    p_directory_id: ratingBatchKey(next.trade, next.city),
  });
  if (error || !allowed) return null;
  const params = new URLSearchParams({
    query: `${TRADE_SEARCH_TERMS[next.trade]} in ${next.city}, ID`,
    limit: "50",
    region: "us",
    language: "en",
  });
  const response = await fetch(
    `https://api.openwebninja.com/local-business-data/search?${params.toString()}`,
    {
      headers: { Accept: "application/json", "x-api-key": apiKey },
      signal: AbortSignal.timeout(20000),
    },
  );
  if (!response.ok) return { ...next, rated: 0 };
  const body = (await response.json()) as { data?: unknown };
  const results = (Array.isArray(body.data) ? body.data : []) as Record<string, unknown>[];
  const byPhone = new Map(
    results
      .map((result) => [phoneDigits(result.phone_number), result] as const)
      .filter(([digits]) => digits.length === 10),
  );
  if (!byPhone.size) return { ...next, rated: 0 };
  const { data: rows } = await client
    .from("service_directory")
    .select("id, phone_digits")
    .in("phone_digits", [...byPhone.keys()]);
  const now = new Date().toISOString();
  let rated = 0;
  for (const row of (rows ?? []) as { id: string; phone_digits: string }[]) {
    const result = byPhone.get(row.phone_digits);
    if (!result) continue;
    const enrichment = enrichmentFrom(result);
    await client
      .from("service_directory")
      .update({
        enrichment,
        enriched_at: now,
        updated_at: now,
        ...(enrichment.closed ? { hidden: true } : {}),
      })
      .eq("id", row.id);
    rated += 1;
  }
  return { ...next, rated };
}
