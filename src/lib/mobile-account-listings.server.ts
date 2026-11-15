/* eslint-disable @typescript-eslint/no-explicit-any -- closed, owner-scoped database projections */
import { MobileApiError } from "./mobile-api.ts";
import { mobileListingAllowed, mobileMediaUrl } from "./mobile-contract.ts";
import { accountListingModel } from "./account-listing-model.ts";
import type { MyListing } from "./market.functions";
export type ListingMetric = "views" | "impressions" | "leads" | "offers";
export type MobileAccountListings = {
  ownerId: string;
  listings: MyListing[];
  sellerExists: boolean;
  unavailableMetrics: ListingMetric[];
};
const unavailable = () =>
  new MobileApiError(
    503,
    "owned_listings_unavailable",
    "Your listings could not be loaded. Please retry.",
  );
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
async function pages(build: () => any, key: string, signal: AbortSignal) {
  const rows: any[] = [],
    seen = new Set<string>();
  let total: number | undefined;
  for (let offset = 0; offset < 5000; offset += 500) {
    signal.throwIfAborted();
    const r = await build()
      .order(key)
      .range(offset, offset + 499)
      .abortSignal(signal)
      .retry(false);
    signal.throwIfAborted();
    if (
      r.error !== null ||
      !Array.isArray(r.data) ||
      !Number.isSafeInteger(r.count) ||
      r.count < 0 ||
      r.count > 5000 ||
      (total !== undefined && r.count !== total)
    )
      throw unavailable();
    total = r.count;
    for (const row of r.data) {
      if (!row || typeof row[key] !== "string" || !row[key] || seen.has(row[key]))
        throw unavailable();
      seen.add(row[key]);
      rows.push(row);
    }
    if (rows.length > r.count) throw unavailable();
    if (rows.length === r.count) return rows;
    if (r.data.length !== 500) throw unavailable();
  }
  throw unavailable();
}
/** Core metadata is complete; optional metrics have an explicit unavailable state.
 * No reservation maintenance, buyer/payout reads, provider requests or photo signing. */
export async function loadMobileAccountListings(
  client: any,
  ownerId: string,
): Promise<MobileAccountListings> {
  if (!uuid.test(ownerId)) throw unavailable();
  const controller = new AbortController(),
    signal = AbortSignal.any([controller.signal, AbortSignal.timeout(8000)]);
  try {
    const [all, profile] = await Promise.all([
      pages(
        () =>
          client
            .from("asks")
            .select(
              "id,seller_id,variant_id,price_cents,currency,status,approved_at,expires_at,created_at,sold_at,is_demo,products!inner(slug,name,description,status,categories!inner(slug)),product_variants(size,color,edition)",
              { count: "exact" },
            )
            .eq("seller_id", ownerId)
            .eq("is_demo", false),
        "id",
        signal,
      ),
      client
        .from("seller_profiles")
        .select("user_id")
        .eq("user_id", ownerId)
        .abortSignal(signal)
        .retry(false)
        .maybeSingle(),
    ]);
    if (
      profile.error !== null ||
      profile.data === undefined ||
      (profile.data !== null && profile.data.user_id !== ownerId)
    )
      throw unavailable();
    if (all.some((r) => r.seller_id !== ownerId || r.is_demo !== false)) throw unavailable();
    const rows = all.filter((r) =>
      mobileListingAllowed({
        categorySlug: r.products?.categories?.slug,
        title: r.products?.name,
        description: r.products?.description,
      }),
    );
    if (
      rows.some(
        (r) =>
          !uuid.test(r.id) ||
          !uuid.test(r.variant_id) ||
          typeof r.products?.name !== "string" ||
          !Number.isSafeInteger(r.price_cents) ||
          r.price_cents < 0 ||
          typeof r.currency !== "string" ||
          typeof r.status !== "string" ||
          !Number.isFinite(Date.parse(r.created_at)) ||
          !Number.isFinite(Date.parse(r.expires_at)),
      )
    )
      throw unavailable();
    const ids = rows.map((r) => r.id),
      variants = [...new Set(rows.map((r) => r.variant_id))];
    const batch = async (
      table: string,
      fields: string,
      key: string,
      targets: string[],
      owner = false,
    ) => {
      const out: any[] = [];
      for (let start = 0; start < targets.length; start += 100) {
        const group = targets.slice(start, start + 100),
          allowed = new Set(group);
        const found = await pages(
          () => {
            let q = client.from(table).select(fields, { count: "exact" }).in(key, group);
            if (owner) q = q.eq("seller_id", ownerId);
            return q;
          },
          table === "classified_listing_metrics"
            ? "listing_id"
            : table === "variant_market_summary"
              ? "variant_id"
              : "id",
          signal,
        );
        if (
          found.some((r) => !allowed.has(r[key]) || (owner && r.seller_id !== ownerId)) ||
          out.length + found.length > 5000
        )
          throw unavailable();
        out.push(...found);
      }
      return out;
    };
    const results = await Promise.allSettled([
      batch("classified_listing_metrics", "listing_id,impressions,views", "listing_id", ids),
      (async () => [
        ...(await batch("conversations", "id,listing_id,seller_id", "listing_id", ids, true)),
        ...(await batch("listing_inquiries", "id,listing_id,seller_id", "listing_id", ids, true)),
      ])(),
      batch("variant_market_summary", "variant_id,active_bid_count", "variant_id", variants),
    ]);
    const good = (i: number) =>
      results[i].status === "fulfilled"
        ? (results[i] as PromiseFulfilledResult<any[]>).value
        : null;
    let metrics = good(0),
      offers = good(2);
    const leads = good(1);
    const count = (n: unknown) =>
      (typeof n === "number" || (typeof n === "string" && /^\d+$/.test(n))) &&
      Number.isSafeInteger(Number(n)) &&
      Number(n) >= 0;
    if (metrics?.some((r) => !count(r.views) || !count(r.impressions))) metrics = null;
    if (offers?.some((r) => !count(r.active_bid_count))) offers = null;
    const byMetrics = new Map((metrics ?? []).map((r) => [r.listing_id, r])),
      byOffers = new Map((offers ?? []).map((r) => [r.variant_id, r])),
      byLeads = new Map<string, number>();
    for (const r of leads ?? []) byLeads.set(r.listing_id, (byLeads.get(r.listing_id) ?? 0) + 1);
    return {
      ownerId,
      sellerExists: profile.data !== null,
      unavailableMetrics: [
        ...(!metrics ? (["views", "impressions"] as const) : []),
        ...(!leads ? (["leads"] as const) : []),
        ...(!offers ? (["offers"] as const) : []),
      ],
      listings: rows.map((r) =>
        accountListingModel(r, {
          soldAt: r.sold_at ?? undefined,
          metrics: byMetrics.get(r.id),
          leadCount: byLeads.get(r.id),
          summary: byOffers.get(r.variant_id),
        }),
      ),
    };
  } catch {
    controller.abort();
    throw unavailable();
  }
}
/** Only a visible owned row requests a thumbnail. No raw path leaves the API. */
export async function loadMobileOwnedThumbnail(
  client: any,
  ownerId: string,
  listingId: string,
  sign: (paths: string[]) => Promise<Map<string, string>>,
) {
  if (!uuid.test(ownerId) || !uuid.test(listingId)) throw unavailable();
  const signal = AbortSignal.timeout(8000);
  try {
    const r = await client
      .from("asks")
      .select(
        "id,seller_id,is_demo,products!inner(name,description,categories!inner(slug)),listing_media(storage_path,position)",
      )
      .eq("id", listingId)
      .eq("seller_id", ownerId)
      .eq("is_demo", false)
      .order("position", { referencedTable: "listing_media" })
      .order("id", { referencedTable: "listing_media" })
      .limit(1, { referencedTable: "listing_media" })
      .abortSignal(signal)
      .retry(false)
      .maybeSingle();
    signal.throwIfAborted();
    if (r.error !== null || r.data === undefined) throw unavailable();
    const row = r.data;
    if (
      !row ||
      row.id !== listingId ||
      row.seller_id !== ownerId ||
      row.is_demo !== false ||
      !mobileListingAllowed({
        categorySlug: row.products?.categories?.slug,
        title: row.products?.name,
        description: row.products?.description,
      })
    )
      throw new MobileApiError(
        404,
        "listing_unavailable",
        "This listing is unavailable in the app.",
      );
    if (!Array.isArray(row.listing_media) || row.listing_media.length > 1) throw unavailable();
    const path = row.listing_media[0]?.storage_path;
    if (path === undefined) return { url: null };
    if (typeof path !== "string" || !path) throw unavailable();
    const urls = await sign([path]);
    signal.throwIfAborted();
    const url = mobileMediaUrl(urls.get(path));
    if (!url) throw unavailable();
    return { url };
  } catch (e) {
    if (e instanceof MobileApiError) throw e;
    throw unavailable();
  }
}
