/* eslint-disable @typescript-eslint/no-explicit-any -- provider cache migration */
import type {
  ClassifiedBrowseInput,
  ClassifiedCard,
  ClassifiedDetail,
} from "./classifieds.functions";
import {
  firearmDetails,
  normalizeMerchandise,
  type AffiliateMerchandise,
} from "./avantlink-contract.ts";

const categories = {
  "apparel-accessories": "Apparel & Accessories",
  "outdoor-sporting": "Outdoor & Sporting",
  "tools-equipment": "Tools & Equipment",
  firearms: "Firearms",
};
/** Guns.com's image CDN bot-screens browsers; serve approved photos via Bluebird. */
export const retailerImagePath = (id: string, index: number) =>
  `/api/public/retailer-image/${id}/${index}`;
const firearmFilters = ["firearmListingType", "firearmType", "firearmBrand", "firearmAccessoryType"];
const maxAge = () => new Date(Date.now() - 7 * 86400000).toISOString();
const present = (v: unknown) => v !== undefined && v !== null && v !== false && v !== "";
const bounded = (query: any) =>
  typeof query.abortSignal === "function" ? query.abortSignal(AbortSignal.timeout(8000)) : query;

export function canIncludeMerchandise(data: ClassifiedBrowseInput): boolean {
  if (
    data.sellerSlug ||
    data.dealerSlug ||
    (data.group && data.group !== "classifieds") ||
    (data.category && !(data.category in categories))
  )
    return false;
  // Online retail inventory has no physical location in this feed. In
  // particular ID/UT, radius, and map searches cannot establish a match.
  return !Object.entries(data).some(
    ([key, value]) =>
      present(value) &&
      ((/^(?:home|job|pet|service|firearm)/.test(key) && !firearmFilters.includes(key)) ||
        [
          "state",
          "city",
          "region",
          "postalCode",
          "radiusMiles",
          "latitude",
          "longitude",
          "condition",
          "fulfillment",
          "postedWithin",
          "make",
          "model",
          "yearMin",
          "yearMax",
          "mileageMax",
          "bodyStyle",
          "transmission",
          "drivetrain",
          "fuelType",
          "exteriorColor",
          "titleStatus",
        ].includes(key)),
  );
}

export function merchandiseCard(
  product: AffiliateMerchandise,
  row: { first_seen_at: string; source_refreshed_at: string },
): ClassifiedCard {
  return {
    id: `avantlink-${product.id}`,
    productId: `avantlink-${product.id}`,
    productSlug: "",
    title: product.title,
    priceCents: product.priceCents,
    currency: "USD",
    city: "",
    state: "",
    region: "",
    categorySlug: product.categorySlug,
    categoryName: categories[product.categorySlug],
    condition: "",
    fulfillmentMode: "",
    createdAt: row.first_seen_at,
    isFeatured: false,
    imageUrl: product.images.length ? retailerImagePath(product.id, 0) : null,
    vehicle: null,
    itemDetails: {
      itemType: product.category,
      ...(product.brand ? { brand: product.brand } : {}),
      ...(firearmDetails(product.department, product.category) ?? {}),
    },
    externalMerchandise: {
      source: "Guns.com",
      buyUrl: product.buyUrl,
      sku: product.sku,
      brand: product.brand,
      department: product.department,
      category: product.category,
      subcategory: product.subcategory,
      retailPriceCents: product.retailPriceCents,
      variants: product.variants,
      refreshedAt: row.source_refreshed_at,
    },
  };
}

/** Reads saved rows only. Browsing never triggers a ProductSearch request. */
export async function merchandiseCards(
  data: ClassifiedBrowseInput,
  injectedDb?: any,
  limit = 5000,
): Promise<{ cards: ClassifiedCard[]; limited: boolean }> {
  if (!canIncludeMerchandise(data)) return { cards: [], limited: false };
  const db = injectedDb ?? (await import("@/integrations/supabase/client.server")).supabaseAdmin;
  let query = db
    .from("avantlink_merchandise")
    .select("id,payload,first_seen_at,source_refreshed_at", { count: "exact" })
    .eq("active", true)
    .gte("source_refreshed_at", maxAge());
  if (data.category) query = query.eq("category_slug", data.category);
  if (data.priceMin != null) query = query.gte("price_cents", Math.round(data.priceMin * 100));
  if (data.priceMax != null) query = query.lte("price_cents", Math.round(data.priceMax * 100));
  if (data.q) query = query.ilike("title", `%${data.q.replace(/[\\%_]/g, "\\$&")}%`);
  query =
    data.sort === "price_low" || data.sort === "price_high"
      ? query.order("price_cents", { ascending: data.sort === "price_low" })
      : query.order("first_seen_at", { ascending: false });
  query = query.order("id", { ascending: true });
  const rows: any[] = [];
  let count = 0;
  const ceiling = Math.max(1, Math.min(5000, limit));
  // Supabase applies a response-row cap even when a larger range is asked
  // for. Explicit pages keep merchandise beyond the first 1,000 reachable.
  for (let offset = 0; offset < ceiling; offset += 500) {
    const size = Math.min(500, ceiling - offset);
    const result = await bounded(query.range(offset, offset + size - 1));
    if (result.error) return { cards: [], limited: false };
    count = result.count ?? count;
    rows.push(...(result.data ?? []));
    if ((result.data?.length ?? 0) < size) break;
  }
  const cards: ClassifiedCard[] = [];
  for (const row of rows ?? []) {
    const p = normalizeMerchandise(row.payload?.raw);
    if (!p || (data.hasPhotos && !p.images.length)) continue;
    if (data.itemDetailKey && data.itemDetailValue) {
      const actual = ({ itemType: p.category, brand: p.brand } as Record<string, string>)[
        data.itemDetailKey
      ];
      if (!actual || !data.itemDetailValue.split(/\|{1,2}/).includes(actual)) continue;
    }
    const card = merchandiseCard(p, row);
    const details = card.itemDetails as Record<string, string | undefined>;
    if (
      (
        [
          [data.firearmListingType, "listingType"],
          [data.firearmType, "firearmType"],
          [data.firearmBrand, "brand"],
          [data.firearmAccessoryType, "accessoryType"],
        ] as const
      ).some(([filter, key]) => filter && details[key]?.toLowerCase() !== filter.toLowerCase())
    )
      continue;
    cards.push(card);
  }
  const { data: reports, error: reportsError } = await bounded(
    db
      .from("partner_job_reports")
      .select("listing_id")
      .eq("status", "reviewed")
      .like("listing_id", "avantlink-%"),
  );
  // A failed moderation read must not make removed products reappear.
  if (reportsError) return { cards: [], limited: false };
  const removed = new Set((reports ?? []).map((r: any) => r.listing_id));
  return {
    cards: cards.filter((card) => !removed.has(card.id)),
    limited: (count ?? 0) > (rows?.length ?? 0),
  };
}

export async function merchandiseHomeCards(): Promise<ClassifiedCard[]> {
  const results = await Promise.all(
    Object.keys(categories).map((category) => merchandiseCards({ category }, undefined, 8)),
  );
  return results.flatMap((result) => result.cards);
}

export async function merchandiseDetail(
  listingId: string,
  injectedDb?: any,
): Promise<ClassifiedDetail | null> {
  const id = /^avantlink-(\d{1,20})$/.exec(listingId)?.[1];
  if (!id) return null;
  const db = injectedDb ?? (await import("@/integrations/supabase/client.server")).supabaseAdmin;
  const [{ data: row, error }, { data: removed, error: reportError }] = await Promise.all([
    bounded(
      db
        .from("avantlink_merchandise")
        .select("payload,first_seen_at,source_refreshed_at")
        .eq("id", id)
        .eq("active", true)
        .gte("source_refreshed_at", maxAge())
        .maybeSingle(),
    ),
    bounded(
      db
        .from("partner_job_reports")
        .select("id")
        .eq("listing_id", listingId)
        .eq("status", "reviewed")
        .limit(1),
    ),
  ]);
  // A transient read failure is not evidence that an item was removed.
  // Let the shared query retry and retain its last good data on refetch.
  if (error || reportError)
    throw new Error("Could not load this retailer offer. Please try again.");
  if (!row || removed?.length) return null;
  const p = normalizeMerchandise(row.payload?.raw);
  if (!p || p.id !== id) return null;
  return {
    ...merchandiseCard(p, row),
    description: p.description || p.shortDescription || null,
    postalCode: null,
    expiresAt: null,
    sellerNote: null,
    variantId: "",
    seller: null,
    listingNumber: p.sku,
    images: p.images.map((_, index) => ({ url: retailerImagePath(p.id, index), alt: p.title })),
  };
}
