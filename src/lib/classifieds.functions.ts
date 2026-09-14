import { createServerFn } from "@tanstack/react-start";

import { publicServerClient } from "./supabase-public.server";
import { classifiedCategories } from "@/config/classifieds";

/**
 * Public read layer for individual classified listings.
 *
 * Every classified is one seller listing (`asks` row) with its own private
 * product/variant adapter plus a `classified_listing_details` record. Nothing
 * here pools sellers together: one row in, one listing out. Reads go through
 * the anon publishable client so row-level security decides what is visible —
 * only approved, active, non-demo listings on published products.
 */

export type ClassifiedVehicle = {
  year: number | null;
  make: string | null;
  model: string | null;
  trim: string | null;
  mileage: number | null;
  bodyStyle: string | null;
  transmission: string | null;
  drivetrain: string | null;
  fuelType: string | null;
  exteriorColor: string | null;
  titleStatus: string | null;
  vin: string | null;
};

export type ClassifiedCard = {
  id: string;
  title: string;
  productId: string;
  productSlug: string;
  priceCents: number;
  currency: string;
  city: string;
  state: string;
  region: string;
  categorySlug: string | null;
  categoryName: string | null;
  condition: string;
  fulfillmentMode: string;
  createdAt: string;
  imageUrl: string | null;
  vehicle: ClassifiedVehicle | null;
};

export type ClassifiedDetail = ClassifiedCard & {
  description: string | null;
  postalCode: string | null;
  sellerNote: string | null;
  variantId: string;
  images: { url: string; alt: string }[];
};

export type ClassifiedBrowseResult = {
  listings: ClassifiedCard[];
  total: number;
  page: number;
  pageSize: number;
};

const PAGE_SIZE = 24;
const conditionValues = [
  "new_with_tags",
  "new_without_tags",
  "used_excellent",
  "used_good",
] as const;

const LISTING_SELECT =
  "id, product_id, variant_id, price_cents, currency, item_condition, seller_note, created_at, " +
  "products!inner(id, slug, name, description, status, category_id, categories(slug, name)), " +
  "classified_listing_details!inner(region, city, state, postal_code, fulfillment_mode, vehicle_make, vehicle_model, vehicle_year, vehicle_trim, vehicle_mileage, vehicle_body_style, vehicle_transmission, vehicle_drivetrain, vehicle_fuel_type, vehicle_exterior_color, vehicle_title_status, vin), " +
  "listing_media(storage_path, position)";

/** PostgREST `or=` treats these as structural characters; escape them. */
function escapeFilterValue(value: string) {
  return value.replace(/[\\,.()]/g, "\\$&");
}

function vehicleOf(details: Record<string, unknown>): ClassifiedVehicle | null {
  const make = (details["vehicle_make"] as string | null) ?? null;
  const model = (details["vehicle_model"] as string | null) ?? null;
  const year = (details["vehicle_year"] as number | null) ?? null;
  if (!make && !model && year == null) return null;
  return {
    year,
    make,
    model,
    trim: (details["vehicle_trim"] as string | null) ?? null,
    mileage: (details["vehicle_mileage"] as number | null) ?? null,
    bodyStyle: (details["vehicle_body_style"] as string | null) ?? null,
    transmission: (details["vehicle_transmission"] as string | null) ?? null,
    drivetrain: (details["vehicle_drivetrain"] as string | null) ?? null,
    fuelType: (details["vehicle_fuel_type"] as string | null) ?? null,
    exteriorColor: (details["vehicle_exterior_color"] as string | null) ?? null,
    titleStatus: (details["vehicle_title_status"] as string | null) ?? null,
    vin: (details["vin"] as string | null) ?? null,
  };
}

function sortedMedia(row: Record<string, unknown>): string[] {
  const media = (row["listing_media"] as { storage_path: string; position: number }[] | null) ?? [];
  return [...media]
    .sort((a, b) => Number(a.position ?? 0) - Number(b.position ?? 0))
    .map((item) => item.storage_path);
}

/** Listing photos live in a private bucket, so public pages need signed URLs. */
async function signListingMedia(paths: string[]): Promise<Map<string, string>> {
  const unique = [...new Set(paths)];
  if (unique.length === 0) return new Map();
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data } = await supabaseAdmin.storage
    .from("listing-media")
    .createSignedUrls(unique, 60 * 60);
  return new Map(
    (data ?? [])
      .filter((item) => item.signedUrl)
      .map((item) => [item.path as string, item.signedUrl as string]),
  );
}

function toCard(row: Record<string, unknown>, urlByPath: Map<string, string>): ClassifiedCard {
  const product = row["products"] as {
    id: string;
    slug: string;
    name: string;
    categories: { slug: string; name: string } | null;
  };
  const details = row["classified_listing_details"] as Record<string, unknown>;
  const firstPath = sortedMedia(row)[0];
  return {
    id: row["id"] as string,
    title: product.name,
    productId: product.id,
    productSlug: product.slug,
    priceCents: row["price_cents"] as number,
    currency: (row["currency"] as string) ?? "USD",
    city: details["city"] as string,
    state: ((details["state"] as string | null) ?? "ID").toUpperCase(),
    region: details["region"] as string,
    categorySlug: product.categories?.slug ?? null,
    categoryName: product.categories?.name ?? null,
    condition: row["item_condition"] as string,
    fulfillmentMode: details["fulfillment_mode"] as string,
    createdAt: row["created_at"] as string,
    imageUrl: (firstPath ? (urlByPath.get(firstPath) ?? null) : null) as string | null,
    vehicle: vehicleOf(details),
  };
}

export type ClassifiedBrowseInput = {
  q?: string | undefined;
  category?: string | undefined;
  group?: string | undefined;
  region?: string | undefined;
  state?: string | undefined;
  city?: string | undefined;
  condition?: string | undefined;
  fulfillment?: string | undefined;
  priceMin?: number | undefined;
  priceMax?: number | undefined;
  make?: string | undefined;
  model?: string | undefined;
  yearMin?: number | undefined;
  yearMax?: number | undefined;
  mileageMax?: number | undefined;
  bodyStyle?: string | undefined;
  transmission?: string | undefined;
  drivetrain?: string | undefined;
  fuelType?: string | undefined;
  exteriorColor?: string | undefined;
  titleStatus?: string | undefined;
  sort?: "newest" | "price_low" | "price_high" | "mileage_low" | undefined;
  page?: number | undefined;
};

const text = (value: unknown, max = 80) =>
  typeof value === "string" && value.trim() ? value.trim().slice(0, max) : undefined;
const num = (value: unknown) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
};

export const browseClassifieds = createServerFn({ method: "GET" })
  .inputValidator((input: ClassifiedBrowseInput): ClassifiedBrowseInput => ({
    q: text(input?.q),
    category: text(input?.category, 60),
    group: text(input?.group, 20),
    region: text(input?.region),
    state: text(input?.state, 2)?.toUpperCase(),
    city: text(input?.city),
    condition: conditionValues.includes(input?.condition as never)
      ? (input.condition as (typeof conditionValues)[number])
      : undefined,
    fulfillment: text(input?.fulfillment, 20),
    priceMin: num(input?.priceMin),
    priceMax: num(input?.priceMax),
    make: text(input?.make),
    model: text(input?.model),
    yearMin: num(input?.yearMin),
    yearMax: num(input?.yearMax),
    mileageMax: num(input?.mileageMax),
    bodyStyle: text(input?.bodyStyle, 30),
    transmission: text(input?.transmission, 30),
    drivetrain: text(input?.drivetrain, 20),
    fuelType: text(input?.fuelType, 30),
    exteriorColor: text(input?.exteriorColor, 30),
    titleStatus: text(input?.titleStatus, 30),
    sort: (["newest", "price_low", "price_high", "mileage_low"] as const).includes(
      input?.sort as never,
    )
      ? input.sort
      : "newest",
    page: Math.max(1, Math.min(50, Number(input?.page ?? 1) || 1)),
  }))
  .handler(async ({ data }): Promise<ClassifiedBrowseResult> => {
    const client = publicServerClient();
    const page = data.page ?? 1;
    const empty = { listings: [], total: 0, page, pageSize: PAGE_SIZE };

    let categoryIds: string[] | null = null;
    if (data.category) {
      const { data: category } = await client
        .from("categories")
        .select("id")
        .eq("slug", data.category)
        .maybeSingle();
      if (!category) return empty;
      categoryIds = [category.id];
    } else if (data.group) {
      const slugs = classifiedCategories
        .filter((category) => category.group === data.group)
        .map((category) => category.slug);
      if (slugs.length === 0) return empty;
      const { data: rows } = await client.from("categories").select("id").in("slug", slugs);
      categoryIds = (rows ?? []).map((row) => row.id);
      if (categoryIds.length === 0) return empty;
    }

    let query = client
      .from("asks")
      .select(LISTING_SELECT, { count: "exact" })
      .eq("status", "active")
      .eq("is_demo", false)
      .not("approved_at", "is", null)
      .gt("expires_at", new Date().toISOString())
      .eq("products.status", "published");

    if (categoryIds) query = query.in("products.category_id", categoryIds);
    if (data.q) {
      const q = escapeFilterValue(data.q);
      query = query.or(`name.ilike.%${q}%,description.ilike.%${q}%`, {
        referencedTable: "products",
      });
    }
    if (data.region) query = query.eq("classified_listing_details.region", data.region);
    if (data.state) query = query.eq("classified_listing_details.state", data.state);
    if (data.city) query = query.ilike("classified_listing_details.city", data.city);
    if (data.condition)
      query = query.eq("item_condition", data.condition as (typeof conditionValues)[number]);
    if (data.fulfillment) {
      query =
        data.fulfillment === "both"
          ? query.eq("classified_listing_details.fulfillment_mode", "both")
          : query.in("classified_listing_details.fulfillment_mode", [data.fulfillment, "both"]);
    }
    if (data.priceMin != null) query = query.gte("price_cents", Math.round(data.priceMin * 100));
    if (data.priceMax != null) query = query.lte("price_cents", Math.round(data.priceMax * 100));
    if (data.make) query = query.ilike("classified_listing_details.vehicle_make", data.make);
    if (data.model) query = query.ilike("classified_listing_details.vehicle_model", data.model);
    if (data.yearMin != null)
      query = query.gte("classified_listing_details.vehicle_year", data.yearMin);
    if (data.yearMax != null)
      query = query.lte("classified_listing_details.vehicle_year", data.yearMax);
    if (data.mileageMax != null)
      query = query.lte("classified_listing_details.vehicle_mileage", data.mileageMax);
    if (data.bodyStyle)
      query = query.eq("classified_listing_details.vehicle_body_style", data.bodyStyle);
    if (data.transmission)
      query = query.eq("classified_listing_details.vehicle_transmission", data.transmission);
    if (data.drivetrain)
      query = query.eq("classified_listing_details.vehicle_drivetrain", data.drivetrain);
    if (data.fuelType)
      query = query.eq("classified_listing_details.vehicle_fuel_type", data.fuelType);
    if (data.exteriorColor)
      query = query.eq("classified_listing_details.vehicle_exterior_color", data.exteriorColor);
    if (data.titleStatus)
      query = query.eq("classified_listing_details.vehicle_title_status", data.titleStatus);

    switch (data.sort) {
      case "price_low":
        query = query.order("price_cents", { ascending: true });
        break;
      case "price_high":
        query = query.order("price_cents", { ascending: false });
        break;
      case "mileage_low":
        query = query.order("vehicle_mileage", {
          ascending: true,
          nullsFirst: false,
          referencedTable: "classified_listing_details",
        });
        query = query.order("created_at", { ascending: false });
        break;
      default:
        query = query.order("created_at", { ascending: false });
    }
    // Deterministic tiebreaker so paging never repeats or skips a listing.
    query = query.order("id", { ascending: true });

    const from = (page - 1) * PAGE_SIZE;
    const { data: rows, count, error } = await query.range(from, from + PAGE_SIZE - 1);
    if (error) {
      console.error("browseClassifieds failed", error.message);
      return empty;
    }

    const urlByPath = await signListingMedia(
      (rows ?? []).flatMap((row) =>
        sortedMedia(row as unknown as Record<string, unknown>).slice(0, 1),
      ),
    );
    const listings = (rows ?? []).map((row) =>
      toCard(row as unknown as Record<string, unknown>, urlByPath),
    );
    return { listings, total: count ?? listings.length, page, pageSize: PAGE_SIZE };
  });

export const getClassifiedListing = createServerFn({ method: "GET" })
  .inputValidator((input: { id: string }) => ({ id: String(input.id).slice(0, 64) }))
  .handler(async ({ data }): Promise<ClassifiedDetail | null> => {
    const client = publicServerClient();
    const { data: row, error } = await client
      .from("asks")
      .select(LISTING_SELECT)
      .eq("id", data.id)
      .eq("status", "active")
      .eq("is_demo", false)
      .not("approved_at", "is", null)
      .gt("expires_at", new Date().toISOString())
      .eq("products.status", "published")
      .maybeSingle();

    if (error) console.error("getClassifiedListing failed", error.message);
    if (!row) return null;

    const record = row as unknown as Record<string, unknown>;
    const paths = sortedMedia(record);
    const urlByPath = await signListingMedia(paths);
    const product = record["products"] as { id: string; slug: string; description: string | null };
    const details = record["classified_listing_details"] as Record<string, unknown>;
    const card = toCard(record, urlByPath);

    return {
      ...card,
      description: product.description,
      postalCode: (details["postal_code"] as string | null) ?? null,
      sellerNote: (record["seller_note"] as string | null) ?? null,
      variantId: record["variant_id"] as string,
      images: paths
        .map((path) => urlByPath.get(path))
        .filter((url): url is string => Boolean(url))
        .map((url) => ({ url, alt: card.title })),
    };
  });

export type ClassifiedRelated = { listings: ClassifiedCard[] };

export const getRelatedClassifieds = createServerFn({ method: "GET" })
  .inputValidator((input: { category?: string; region?: string; excludeId: string }) => ({
    category: text(input?.category, 60),
    region: text(input?.region),
    excludeId: String(input?.excludeId ?? "").slice(0, 64),
  }))
  .handler(async ({ data }): Promise<ClassifiedRelated> => {
    if (!data.category) return { listings: [] };
    const result = await browseClassifieds({
      data: { category: data.category, region: data.region, sort: "newest", page: 1 },
    });
    return { listings: result.listings.filter((row) => row.id !== data.excludeId).slice(0, 8) };
  });

export type ClassifiedsHome = {
  totalActive: number;
  categoryCounts: Record<string, number>;
  motors: ClassifiedCard[];
  recent: ClassifiedCard[];
};

export const getClassifiedsHome = createServerFn({ method: "GET" }).handler(
  async (): Promise<ClassifiedsHome> => {
    const client = publicServerClient();
    const nowIso = new Date().toISOString();

    const [{ data: categoryRows }, motors, recent] = await Promise.all([
      client
        .from("asks")
        .select(
          "id, products!inner(status, categories!inner(slug)), classified_listing_details!inner(listing_id)",
        )
        .eq("status", "active")
        .eq("is_demo", false)
        .not("approved_at", "is", null)
        .gt("expires_at", nowIso)
        .eq("products.status", "published")
        .limit(1000),
      browseClassifieds({ data: { group: "motors", sort: "newest", page: 1 } }),
      browseClassifieds({ data: { sort: "newest", page: 1 } }),
    ]);

    const categoryCounts: Record<string, number> = {};
    for (const row of (categoryRows ?? []) as Record<string, unknown>[]) {
      const slug = (row["products"] as { categories: { slug: string } | null })?.categories?.slug;
      if (!slug) continue;
      categoryCounts[slug] = (categoryCounts[slug] ?? 0) + 1;
    }

    return {
      totalActive: (categoryRows ?? []).length,
      categoryCounts,
      motors: motors.listings.slice(0, 8),
      recent: recent.listings.slice(0, 12),
    };
  },
);
