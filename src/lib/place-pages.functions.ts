import { createServerFn } from "@tanstack/react-start";

import { brand } from "@/config/brand";
import { classifiedCategories, idahoCities } from "@/config/classifieds";
import { browseClassifieds, type ClassifiedCard } from "@/lib/classifieds.functions";
import {
  PLACE_PAGE_FRESH_DAYS,
  PLACE_PAGE_MIN_LISTINGS,
  categoryFromUrlSlug,
  categoryPagePath,
  categoryPhrase,
  placeFromSlug,
  placePath,
  type ResolvedPlace,
} from "@/lib/place-pages";

export type PlacePageLink = { label: string; path: string; count: number };

export type PlacePageData = {
  heading: string;
  title: string;
  description: string;
  lead: string;
  listings: ClassifiedCard[];
  total: number;
  indexable: boolean;
  relatedCategories: PlacePageLink[];
  relatedPlaces: PlacePageLink[];
  relatedPlacesHeading: string;
  browseSearch: Record<string, string | number>;
  breadcrumbs: { label: string; path: string }[];
};

// Enough to compute honest stats for a local page without paging forever.
const MAX_PAGES = 8;
const SHOWN_LISTINGS = 24;
const FOR_SALE_EXCEPTIONS = new Set(["jobs", "services", "other-real-estate", "pets"]);
const NO_PRICE_STATS = new Set(["jobs", "services"]);

type Filters = {
  category?: string;
  city?: string;
  region?: string;
  state?: string;
  radiusMiles?: number;
};

function filtersFor(place: ResolvedPlace | null, categorySlug: string | null): Filters {
  const location: Filters = !place
    ? { state: "ID" }
    : place.kind === "city"
      ? { city: place.name, state: "ID", radiusMiles: 25 }
      : { region: place.name };
  return categorySlug ? { ...location, category: categorySlug } : location;
}

async function fetchListings(filters: Filters) {
  const listings: ClassifiedCard[] = [];
  let total = 0;
  for (let page = 1; page <= MAX_PAGES; page += 1) {
    const result = await browseClassifieds({ data: { ...filters, sort: "newest", page } });
    total = result.total;
    listings.push(...result.listings);
    if (page * result.pageSize >= result.total || result.listings.length === 0) break;
  }
  return { listings, total };
}

function countBy<T>(items: T[], key: (item: T) => string | null | undefined) {
  const counts = new Map<string, number>();
  for (const item of items) {
    const value = key(item);
    if (value) counts.set(value, (counts.get(value) ?? 0) + 1);
  }
  return counts;
}

const wholeDollars = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 0,
});

function median(values: number[]) {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid]! : Math.round((sorted[mid - 1]! + sorted[mid]!) / 2);
}

function whereText(place: ResolvedPlace | null) {
  if (!place) return "across Idaho";
  if (place.kind === "city") return `in and around ${place.name}`;
  return `in ${place.name.endsWith("Valley") ? "the " : ""}${place.name}`;
}

function placeLabel(place: ResolvedPlace) {
  return place.kind === "city"
    ? `${place.name}, Idaho`
    : `${place.name.endsWith("Valley") ? "the " : ""}${place.name}`;
}

export const getPlacePage = createServerFn({ method: "GET" })
  .validator((input: { place?: string; category?: string }) => ({
    place: String(input?.place ?? "").slice(0, 60),
    category: String(input?.category ?? "").slice(0, 60),
  }))
  .handler(async ({ data }): Promise<PlacePageData | null> => {
    const { shortCache, PUBLIC_PAGE_CACHE_MS } = await import("./short-cache.server");
    return shortCache(
      `place-page:${data.place}:${data.category}`,
      PUBLIC_PAGE_CACHE_MS,
      async () => {
        // One slug segment can be a place or a category (/idaho/boise,
        // /idaho/trailers); two are always place then category.
        let place: ResolvedPlace | null = null;
        let category: ReturnType<typeof categoryFromUrlSlug> = null;
        if (data.place && data.category) {
          place = placeFromSlug(data.place);
          category = categoryFromUrlSlug(data.category);
          if (!place || !category) return null;
        } else if (data.place) {
          place = placeFromSlug(data.place);
          if (!place) {
            category = categoryFromUrlSlug(data.place);
            if (!category) return null;
          }
        } else {
          return null;
        }

        const main = await fetchListings(filtersFor(place, category?.slug ?? null));
        const phrase = category ? categoryPhrase(category.slug, category.name) : null;
        const where = whereText(place);

        // Related links: other categories for this place, other cities for this
        // category. Each count comes from the same live listings.
        const placeWide = place && category ? await fetchListings(filtersFor(place, null)) : main;
        const categoryWide = category
          ? place
            ? await fetchListings(filtersFor(null, category.slug))
            : main
          : await fetchListings(filtersFor(null, null));

        const categoryCounts = countBy(placeWide.listings, (listing) => listing.categorySlug);
        const relatedCategories: PlacePageLink[] = classifiedCategories
          .filter((option) => option.slug !== category?.slug && categoryCounts.has(option.slug))
          .map((option) => ({
            label: categoryPhrase(option.slug, option.name).heading,
            path: place ? placePath(place.name, option.slug) : categoryPagePath(option.slug),
            count: categoryCounts.get(option.slug) ?? 0,
          }))
          .sort((a, b) => b.count - a.count)
          .slice(0, 12);

        const cityCounts = countBy(categoryWide.listings, (listing) =>
          idahoCities.find((city) => city === listing.city),
        );
        const relatedPlaces: PlacePageLink[] = Array.from(cityCounts.entries())
          .filter(([city]) => !(place?.kind === "city" && place.name === city))
          .map(([city, count]) => ({
            label: city,
            path: placePath(city, category?.slug),
            count,
          }))
          .sort((a, b) => b.count - a.count)
          .slice(0, 10);

        const prices = main.listings
          .map((listing) => listing.priceCents)
          .filter((cents) => cents > 0);
        const showPrice = category && !NO_PRICE_STATS.has(category.slug) && prices.length >= 3;
        const newest = main.listings.reduce(
          (latest, listing) => (listing.createdAt > latest ? listing.createdAt : latest),
          "",
        );
        const fresh =
          Boolean(newest) && Date.now() - Date.parse(newest) < PLACE_PAGE_FRESH_DAYS * 86_400_000;
        const indexable = main.total >= PLACE_PAGE_MIN_LISTINGS && fresh;

        let heading: string;
        if (place && phrase && category) {
          heading = FOR_SALE_EXCEPTIONS.has(category.slug)
            ? `${phrase.heading} in ${placeLabel(place)}`
            : `${phrase.heading} for sale in ${placeLabel(place)}`;
        } else if (place) {
          heading = `${place.kind === "city" ? `${place.name}, Idaho` : place.name} classifieds`;
        } else {
          heading = FOR_SALE_EXCEPTIONS.has(category!.slug)
            ? `${phrase!.heading} in Idaho`
            : `${phrase!.heading} for sale in Idaho`;
        }

        // Answer first, from the live numbers, so the page states the fact a
        // searcher (or an assistant) came for.
        const noun = phrase ? `listings for ${phrase.noun}` : "listings";
        const lead =
          main.total === 0
            ? `No ${noun} ${where} right now. New ones show up here as soon as they're posted.`
            : `There ${main.total === 1 ? "is" : "are"} ${main.total} ${
                main.total === 1 ? noun.replace("listings", "listing") : noun
              } ${where} right now${
                showPrice
                  ? `, with a median asking price of ${wholeDollars.format(median(prices) / 100)}`
                  : ""
              }.`;

        const breadcrumbs: { label: string; path: string }[] = [
          { label: "Idaho", path: "/browse" },
        ];
        if (place) breadcrumbs.push({ label: place.name, path: placePath(place.name) });
        if (category && place)
          breadcrumbs.push({ label: phrase!.heading, path: placePath(place.name, category.slug) });
        if (category && !place)
          breadcrumbs.push({ label: phrase!.heading, path: categoryPagePath(category.slug) });

        const browseSearch: Record<string, string | number> = {
          ...(category ? { category: category.slug } : { allCategories: "true" }),
          ...(place?.kind === "city" ? { city: place.name, state: "ID", radiusMiles: 25 } : {}),
          ...(place?.kind === "region" ? { region: place.name } : {}),
          ...(!place ? { state: "ID" } : {}),
        };

        return {
          heading,
          title: `${heading} — ${brand.name}`,
          description: `${lead} Contact local sellers directly on ${brand.name}.`,
          lead,
          listings: main.listings.slice(0, SHOWN_LISTINGS),
          total: main.total,
          indexable,
          relatedCategories,
          relatedPlaces,
          relatedPlacesHeading: category
            ? `${phrase!.heading} in other Idaho cities`
            : "Other Idaho cities",
          browseSearch,
          breadcrumbs,
        };
      },
    );
  });

/**
 * Where a listing that's no longer live should send its visitors: its city
 * and category page, or the statewide category page. Only the category and
 * city are read; nothing else about the removed listing is exposed.
 */
export const getRemovedListingRedirect = createServerFn({ method: "GET" })
  .validator((input: { id: string }) => ({ id: String(input?.id ?? "").slice(0, 64) }))
  .handler(async ({ data }): Promise<string | null> => {
    if (!/^[0-9a-f-]{36}$/i.test(data.id)) return null;
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: row } = await supabaseAdmin
      .from("asks")
      .select("id, products(categories(slug)), classified_listing_details(city, state)")
      .eq("id", data.id)
      .maybeSingle();
    if (!row) return null;
    const record = row as unknown as {
      products: { categories: { slug: string } | null } | null;
      classified_listing_details:
        | { city: string | null; state: string | null }
        | { city: string | null; state: string | null }[]
        | null;
    };
    const details = Array.isArray(record.classified_listing_details)
      ? record.classified_listing_details[0]
      : record.classified_listing_details;
    const categorySlug = record.products?.categories?.slug;
    if (!categorySlug) return "/browse";
    const city = idahoCities.find((name) => name === details?.city);
    return city ? placePath(city, categorySlug) : categoryPagePath(categorySlug);
  });
