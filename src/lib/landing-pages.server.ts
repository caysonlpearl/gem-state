import {
  MAKE_PAGE_MIN_LISTINGS,
  MODEL_PAGE_MIN_LISTINGS,
  PLACE_PAGE_MIN_LISTINGS,
  canonicalMake,
  canonicalModel,
  categoryPagePath,
  placePath,
  vehiclePagePath,
} from "@/lib/place-pages";
import { idahoCities, isWithinClassifiedCityRadius } from "@/config/classifieds";
import { isReleaseQaListing } from "@/lib/classifieds.functions";
import { isIndexablePlaceInventory, isSeoTestListing, matchesSeoPlace } from "@/lib/seo-policy";
import { listingPath } from "@/lib/listing-url";
import { regionOfListing } from "@/lib/market-stats";
import { seoCollections, collectionMatches, collectionAvailableIn } from "./seo-collections";

/**
 * Which landing pages (city, region, category, make and model) each live
 * listing counts toward, and which pages have enough listings to be offered
 * to search engines. Shared by the sitemap and the IndexNow pings.
 */

export type LiveListingRow = {
  id: string;
  seller_id: string;
  dealer_id?: string | null;
  created_at: string;
  updated_at: string;
  products: { name: string; categories: { slug: string } | null } | null;
  classified_listing_details: ListingPlace | ListingPlace[] | null;
};

type ListingPlace = {
  city: string | null;
  region: string | null;
  state: string | null;
  vehicle_make: string | null;
  vehicle_model: string | null;
  home_mode?: string | null;
  home_property_type?: string | null;
  service_subcategory?: string | null;
  job_employment_type?: string | null;
};

/**
 * Tallies live listings per landing page. A page only enters the sitemap
 * once it passes the same inventory gate the page itself checks (enough
 * listings, one of them recent); counts use the same state and city-radius scope as the rendered page.
 */
export class PageTally {
  private pages = new Map<
    string,
    { count: number; minimum: number; newest: string; lastmod: string }
  >();

  add(path: string, createdAt: string, updatedAt: string, minimum = PLACE_PAGE_MIN_LISTINGS) {
    const current = this.pages.get(path);
    this.pages.set(path, {
      minimum,
      count: (current?.count ?? 0) + 1,
      newest: current && current.newest > createdAt ? current.newest : createdAt,
      lastmod: current && current.lastmod > updatedAt ? current.lastmod : updatedAt,
    });
  }

  passing() {
    return Array.from(this.pages.entries()).filter(([, info]) =>
      isIndexablePlaceInventory(info.count, info.newest, Date.now(), info.minimum),
    );
  }
}

/** Live listings under the same visibility rules as the public browse pages. */
export async function fetchLiveListings(admin: any): Promise<LiveListingRow[] | null> {
  const rows: LiveListingRow[] = [];
  for (let offset = 0; ; offset += 500) {
    const { data, error } = await admin
      .from("asks")
      .select(
        "id, seller_id, dealer_id, created_at, updated_at, products!inner(name, status, categories!inner(slug)), classified_listing_details!inner(listing_id, city, region, state, vehicle_make, vehicle_model, home_mode, home_property_type, service_subcategory, job_employment_type)",
      )
      .eq("status", "active")
      .eq("is_demo", false)
      .not("approved_at", "is", null)
      .gt("expires_at", new Date().toISOString())
      .eq("products.status", "published")
      .order("id", { ascending: true })
      .range(offset, offset + 499);
    if (error) return null;
    const batch = (data ?? []) as LiveListingRow[];
    rows.push(
      ...batch.filter(
        (row) =>
          !isReleaseQaListing(row as unknown as Record<string, unknown>) &&
          !isSeoTestListing(row.products?.name ?? ""),
      ),
    );
    if (batch.length < 500) break;
  }
  return rows.sort((a, b) => b.updated_at.localeCompare(a.updated_at));
}

/** The landing pages one listing appears on, with each page's listing minimum. */
export function landingPathsFor(
  categorySlug: string | null | undefined,
  details: ListingPlace | null | undefined,
): { path: string; minimum: number }[] {
  const paths: { path: string; minimum: number }[] = [];
  const add = (path: string, minimum = PLACE_PAGE_MIN_LISTINGS) => paths.push({ path, minimum });
  const geography = {
    city: details?.city ?? "",
    region: details?.region ?? "",
    state: details?.state ?? "",
  };
  if (!matchesSeoPlace(null, geography, isWithinClassifiedCityRadius)) return paths;
  // Same region the landing pages use: saved, else the city's.
  const region = details ? regionOfListing(details) : undefined;
  if (categorySlug) add(categoryPagePath(categorySlug));
  for (const city of idahoCities) {
    if (!matchesSeoPlace({ kind: "city", name: city }, geography, isWithinClassifiedCityRadius))
      continue;
    add(placePath(city));
    if (categorySlug) add(placePath(city, categorySlug));
  }
  if (region) add(placePath(region));
  if (region && categorySlug) add(placePath(region, categorySlug));
  const make = categorySlug === "cars-trucks" ? canonicalMake(details?.vehicle_make) : null;
  const model = make ? canonicalModel(make, details?.vehicle_model) : null;
  if (make) add(vehiclePagePath(make), MAKE_PAGE_MIN_LISTINGS);
  if (make && model) add(vehiclePagePath(make, model), MODEL_PAGE_MIN_LISTINGS);
  const collections = seoCollections.filter((collection) =>
    collectionMatches(collection, {
      categorySlug,
      home: { mode: details?.home_mode, propertyType: details?.home_property_type },
      service: { subcategory: details?.service_subcategory },
      job: { employmentType: details?.job_employment_type },
    }),
  );
  for (const collection of collections) {
    add(categoryPagePath(collection.slug));
    for (const city of idahoCities) {
      if (
        collectionAvailableIn(collection, city) &&
        matchesSeoPlace({ kind: "city", name: city }, geography, isWithinClassifiedCityRadius)
      )
        add(placePath(city, collection.slug));
    }
  }
  return paths;
}

export function tallyLandingPages(listings: LiveListingRow[]) {
  const pages = new PageTally();
  for (const row of listings) {
    const details = Array.isArray(row.classified_listing_details)
      ? row.classified_listing_details[0]
      : row.classified_listing_details;
    for (const { path, minimum } of landingPathsFor(row.products?.categories?.slug, details)) {
      pages.add(path, row.created_at, row.updated_at, minimum);
    }
  }
  return pages;
}

/**
 * Tells Bing (IndexNow) that a listing changed: its own page, plus the
 * landing pages it appears on that have enough listings to be indexed. Runs
 * after a listing is approved, taken down or marked sold; never blocks it.
 */
export async function pingListingChange(askId: string) {
  try {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const admin = supabaseAdmin as any;
    const { data: row } = await admin
      .from("asks")
      .select(
        "id, products(name, categories(slug)), classified_listing_details(city, region, state, vehicle_make, vehicle_model)",
      )
      .eq("id", askId)
      .maybeSingle();
    if (!row) return;
    if (isSeoTestListing(row.products?.name ?? "")) return;
    const details = Array.isArray(row.classified_listing_details)
      ? row.classified_listing_details[0]
      : row.classified_listing_details;
    const live = await fetchLiveListings(admin);
    const passing = new Set(
      live
        ? tallyLandingPages(live)
            .passing()
            .map(([path]) => path)
        : [],
    );
    const paths = [
      listingPath({ id: row.id, title: row.products?.name ?? "", city: details?.city }),
      ...landingPathsFor(row.products?.categories?.slug, details)
        .map(({ path }) => path)
        .filter((path) => passing.has(path)),
    ];
    const { pingIndexNow } = await import("./indexnow.server");
    await pingIndexNow(paths);
  } catch (error) {
    console.warn("IndexNow listing ping skipped", error);
  }
}

