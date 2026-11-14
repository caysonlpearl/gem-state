/* eslint-disable @typescript-eslint/no-explicit-any -- owner-scoped PostgREST projections */
import { mobileSavedPartnerSource } from "./mobile-account-contract.ts";
import type { WatchedVariant } from "./community.functions";
import type { ClassifiedCard } from "./classifieds.functions";
import { mobileListingAllowed } from "./mobile-contract.ts";
const unavailable = () => new Error("Could not load saved listings. Please retry.");
/** Reject partial reads instead of presenting a database row cap as an empty/full saved list. */
async function pages(build: () => any, key: string, signal: AbortSignal) {
  const rows: any[] = [],
    seen = new Set<string>();
  let expected: number | undefined;
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
      (expected !== undefined && expected !== r.count)
    )
      throw unavailable();
    expected = r.count;
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
/** Same saved-variation model as the website, with optional permanent app catalog scope.
 * Only public aggregate/listing fields are read after the owned watchlist lookup. */
export async function loadAccountWatchlist(
  member: any,
  publicClient: any,
  ownerId: string,
  options: { mobile?: boolean; signal?: AbortSignal } = {},
): Promise<WatchedVariant[]> {
  const signal = options.signal
    ? AbortSignal.any([options.signal, AbortSignal.timeout(8000)])
    : AbortSignal.timeout(8000);
  try {
    const rows = await pages(
      () =>
        member
          .from("watchlist")
          .select(
            "user_id,variant_id,created_at,product_variants!inner(id,size,color,edition,products!inner(slug,name,description,categories(name,slug)))",
            { count: "exact" },
          )
          .eq("user_id", ownerId),
      "variant_id",
      signal,
    );
    if (
      rows.some(
        (r) =>
          r.user_id !== ownerId ||
          !r.product_variants?.products ||
          typeof r.product_variants.products.name !== "string" ||
          !Number.isFinite(Date.parse(r.created_at)),
      )
    )
      throw unavailable();
    const allowed = rows.filter(
      (r) =>
        !options.mobile ||
        mobileListingAllowed({
          categorySlug: r.product_variants.products.categories?.slug,
          title: r.product_variants.products.name,
          description: r.product_variants.products.description,
        }),
    );
    const markets = new Map<string, any>(),
      listings = new Map<string, string>(),
      sightings = new Map<string, number>();
    for (let offset = 0; offset < allowed.length; offset += 100) {
      const ids = allowed.slice(offset, offset + 100).map((r) => r.variant_id),
        expected = new Set(ids);
      const results = await Promise.allSettled([
        pages(
          () =>
            publicClient
              .from("variant_market_summary")
              .select(
                "variant_id,lowest_ask_cents,highest_bid_cents,active_ask_count,active_bid_count",
                { count: "exact" },
              )
              .in("variant_id", ids),
          "variant_id",
          signal,
        ),
        pages(
          () =>
            publicClient
              .from("variant_sightings_public")
              .select("sighting_id,variant_id", { count: "exact" })
              .in("variant_id", ids),
          "sighting_id",
          signal,
        ),
        pages(
          () =>
            publicClient
              .from("asks")
              .select("id,variant_id,products!inner(status)", { count: "exact" })
              .in("variant_id", ids)
              .eq("status", "active")
              .eq("is_demo", false)
              .not("approved_at", "is", null)
              .gt("expires_at", new Date().toISOString())
              .eq("products.status", "published"),
          "id",
          signal,
        ),
      ]);
      if (results.some((r) => r.status === "rejected")) throw unavailable();
      const [marketRows, sightingRows, listingRows] = results.map((r) => {
        if (r.status !== "fulfilled") throw unavailable();
        return r.value;
      });
      for (const row of [...marketRows, ...sightingRows, ...listingRows])
        if (!expected.has(row.variant_id)) throw unavailable();
      for (const row of marketRows) {
        if (
          ![row.active_ask_count ?? 0, row.active_bid_count ?? 0].every(
            (v) => Number.isSafeInteger(v) && v >= 0,
          ) ||
          ![row.lowest_ask_cents, row.highest_bid_cents].every(
            (v) => v === null || (Number.isSafeInteger(v) && v >= 0),
          )
        )
          throw unavailable();
        markets.set(row.variant_id, row);
      }
      for (const row of sightingRows)
        sightings.set(row.variant_id, (sightings.get(row.variant_id) ?? 0) + 1);
      for (const row of listingRows)
        if (!listings.has(row.variant_id)) listings.set(row.variant_id, row.id);
    }
    return allowed
      .map((r) => {
        const v = r.product_variants,
          p = v.products,
          m = markets.get(r.variant_id);
        return {
          variantId: r.variant_id,
          listingId: listings.get(r.variant_id) ?? null,
          productSlug: p.slug,
          productName: p.name,
          categoryName: p.categories?.name ?? null,
          variantLabel: [v.size, v.color, v.edition].filter(Boolean).join(" · ") || "One variation",
          createdAt: r.created_at,
          lowestAskCents: m?.lowest_ask_cents ?? null,
          highestBidCents: m?.highest_bid_cents ?? null,
          activeAskCount: Number(m?.active_ask_count ?? 0),
          activeBidCount: Number(m?.active_bid_count ?? 0),
          sightingCount: sightings.get(r.variant_id) ?? 0,
        };
      })
      .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
  } catch {
    throw unavailable();
  }
}
export async function loadMobileSavedAccount(member: any, publicClient: any, ownerId: string) {
  const signal = AbortSignal.timeout(8000);
  const partner = async (
    table: "saved_partner_jobs" | "saved_partner_homes" | "saved_partner_vehicles",
  ) => {
    const rows = await pages(
      () =>
        member
          .from(table)
          .select("user_id,listing_id,created_at,snapshot", { count: "exact" })
          .eq("user_id", ownerId),
      "listing_id",
      signal,
    );
    if (
      rows.some(
        (r) =>
          r.user_id !== ownerId ||
          r.snapshot?.id !== r.listing_id ||
          !Number.isFinite(Date.parse(r.created_at)),
      )
    )
      throw unavailable();
    return rows
      .sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at))
      .map((r) => r.snapshot as ClassifiedCard)
      .filter((c) => mobileSavedPartnerSource(c.id) === table && mobileListingAllowed(c));
  };
  try {
    const results = await Promise.allSettled([
      loadAccountWatchlist(member, publicClient, ownerId, { mobile: true, signal }),
      partner("saved_partner_jobs"),
      partner("saved_partner_homes"),
      partner("saved_partner_vehicles"),
    ]);
    if (results.some((r) => r.status === "rejected")) throw unavailable();
    const [watched, jobs, homes, vehicles] = results.map((r) => {
      if (r.status !== "fulfilled") throw unavailable();
      return r.value;
    });
    return {
      ownerId,
      watched: watched as WatchedVariant[],
      jobs: jobs as ClassifiedCard[],
      homes: homes as ClassifiedCard[],
      vehicles: vehicles as ClassifiedCard[],
    };
  } catch {
    throw unavailable();
  }
}
/** Privacy-only removal is idempotent, including unavailable/sold items; no listing lookup or expanded consent is needed. */
export async function removeAccountSavedVariants(
  client: any,
  ownerId: string,
  variantIds: readonly string[],
) {
  const ids = [...new Set(variantIds)];
  if (
    !ids.length ||
    ids.length > 100 ||
    ids.some((id) => !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id))
  )
    throw unavailable();
  try {
    const signal = AbortSignal.timeout(8000);
    const r = await client
      .from("watchlist")
      .delete()
      .eq("user_id", ownerId)
      .in("variant_id", ids)
      .abortSignal(signal)
      .retry(false);
    signal.throwIfAborted();
    if (r.error !== null) throw unavailable();
    return { removed: true };
  } catch {
    throw new Error("Could not remove saved listings. Please retry.");
  }
}
/** Owned partner snapshots remain removable after their public listing disappears. */
export async function removeAccountSavedPartner(client: any, ownerId: string, listingId: string) {
  const table = mobileSavedPartnerSource(listingId);
  if (!table) throw new Error("Could not remove saved listing. Please retry.");
  try {
    const signal = AbortSignal.timeout(8000);
    const r = await client
      .from(table)
      .delete()
      .eq("user_id", ownerId)
      .eq("listing_id", listingId)
      .abortSignal(signal)
      .retry(false);
    signal.throwIfAborted();
    if (r.error !== null) throw unavailable();
    return { removed: true };
  } catch {
    throw new Error("Could not remove saved listing. Please retry.");
  }
}
