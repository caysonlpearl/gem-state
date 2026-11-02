import { withCatalogReadDeadline } from "./catalog-read-deadline.ts";
/* eslint-disable @typescript-eslint/no-explicit-any -- tables added after the generated types */
import { findIdahoPlace, idahoPlaces } from "../config/idaho-places.ts";
import { serverEnv } from "./runtime-env.server.ts";
import { logoImageUrl } from "./employer-logo-match.ts";
import { isIndexablePartnerDetail } from "./partner-seo.ts";
import {
  DIRECTORY_COLUMNS,
  DIRECTORY_ID,
  directoryCard,
  enrichmentFrom,
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

const LOCAL_BUSINESS_BATCH_SIZE = 14;

async function db() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin as any;
}

export function logoFor(row: DirectoryRow) {
  const key = serverEnv("LOGO_DEV_PUBLISHABLE_KEY");
  const domain = websiteDomain(row.enrichment?.website ?? row.website);
  return key && domain ? logoImageUrl(domain, key) : null;
}

/** Saved homepage candidates, sampled by trade in one read. This must not
 * fan out across the network during a hosted background refresh. */
export async function directoryHomeCards(
  trades: string[],
  injectedDb?: any,
): Promise<ClassifiedCard[]> {
  const client = injectedDb ?? (await db());
  const { data, error } = await withCatalogReadDeadline<any>(
    client
      .rpc("homepage_service_previews", { p_trades: [...new Set(trades)], p_per_trade: 8 })
      .select(DIRECTORY_COLUMNS),
  );
  if (error) throw new Error("Saved services could not be read.");
  return ((data ?? []) as DirectoryRow[]).map((row) => directoryCard(row, logoFor(row)));
}

/**
 * One page of directory businesses for a Services search, after `offset`
 * of them. Claimed and recently confirmed businesses come first.
 */
export async function directoryCards(
  data: ClassifiedBrowseInput,
  offset: number,
  limit: number,
  options: { failOnError?: boolean; includeExactCount?: boolean; signal?: AbortSignal } = {},
): Promise<{ cards: ClassifiedCard[]; total: number }> {
  try {
    let query = (await db())
      .from("service_directory")
      .select(DIRECTORY_COLUMNS, options.includeExactCount === false ? {} : { count: "exact" })
      .eq("hidden", false)
      .eq("state", "ID")
      .abortSignal(options.signal ?? AbortSignal.timeout(8000))
      .retry(false);
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
    if (error) {
      if (options.failOnError) throw new Error("Saved services could not be read.");
      return { cards: [], total: 0 };
    }
    return {
      cards:
        limit > 0
          ? ((rows ?? []) as DirectoryRow[]).map((row) => directoryCard(row, logoFor(row)))
          : [],
      total: count ?? 0,
    };
  } catch {
    if (options.failOnError) throw new Error("Saved services could not be read.");
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

/** A directory business as a listing page. Provider calls stay in the scheduler. */
export async function directoryDetail(listingId: string): Promise<ClassifiedDetail | null> {
  if (!DIRECTORY_ID.test(listingId)) return null;
  const client = await db();
  const { data, error } = await client
    .from("service_directory")
    .select(DIRECTORY_COLUMNS)
    .eq("id", listingId)
    .eq("hidden", false)
    .maybeSingle();
  if (error) throw new Error("This business is temporarily unavailable. Please try again.");
  const row = data as DirectoryRow | null;
  if (!row) return null;
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

/** Compact references from saved directory data only. Page batches avoid a
 * database row cap silently dropping towns; no provider/rating API is called. */
export async function directorySeoReferences() {
  const client = await db();
  const rows: {
    id: string;
    title: string;
    city: string;
    state: string;
    createdAt: string;
    verifiedAt: string | null;
    indexable: boolean;
    trade: string;
    trades: string[];
  }[] = [];
  for (let offset = 0; ; offset += 500) {
    const { data, error } = await withCatalogReadDeadline<any>(
      client
        .from("service_directory")
        .select(DIRECTORY_COLUMNS)
        .eq("hidden", false)
        .eq("state", "ID")
        .order("id")
        .range(offset, offset + 499),
    );
    if (error) throw new Error("Directory sitemap is temporarily unavailable.");
    const batch = (data ?? []) as DirectoryRow[];
    for (const row of batch) {
      const card = directoryCard(row);
      rows.push({
        id: card.id,
        title: card.title,
        city: card.city,
        state: card.state,
        createdAt: card.createdAt,
        verifiedAt: card.directory?.verifiedAt ?? null,
        indexable: isIndexablePartnerDetail(card),
        trade: row.trade,
        trades: row.trades,
      });
    }
    if (batch.length < 500) break;
  }
  return rows;
}

/**
 * Rates a whole trade in a town with one Local Business Data search (up to
 * 14 businesses per request): results are matched to directory businesses
 * by phone number and their Google rating, hours and description kept. The raw
 * response is retained in the server-only reservation table so unmatched
 * businesses are not silently discarded. Runs from the scheduled job only.
 */
export async function rateNextTradeCity(): Promise<{
  trade: string;
  city: string;
  rated: number;
} | null> {
  const apiKey = serverEnv("OPENWEBNINJA_LOCAL_BUSINESS_API_KEY");
  if (!apiKey) return null;
  const client = await db();
  const { data: recent } = await client
    .from("service_business_api_reservations")
    .select("request_key")
    .like("request_key", "batch:%")
    .gte("created_at", new Date(Date.now() - 30 * 24 * 3600 * 1000).toISOString());
  const next = nextRatingBatch(
    new Set(((recent ?? []) as { request_key: string }[]).map((row) => row.request_key)),
  );
  if (!next) return null;
  const requestKey = ratingBatchKey(next.trade, next.city);
  const { data: reservation, error } = await client.rpc("reserve_service_business_credits", {
    p_request_key: requestKey,
    p_directory_id: requestKey,
    p_requested_businesses: LOCAL_BUSINESS_BATCH_SIZE,
  });
  if (error || !reservation?.allowed) return null;
  const reservationId = Number(reservation.reservation_id);
  const batchSize = Number(reservation.reserved_businesses) || LOCAL_BUSINESS_BATCH_SIZE;
  const params = new URLSearchParams({
    query: `${TRADE_SEARCH_TERMS[next.trade]} in ${next.city}, ID`,
    limit: String(batchSize),
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
  await client.rpc("settle_service_business_credits", {
    p_reservation_id: reservationId,
    p_actual_businesses: results.length,
    p_response_payload: body,
  });
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
