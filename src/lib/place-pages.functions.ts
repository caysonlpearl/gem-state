import { createServerFn } from "@tanstack/react-start";

import { brand } from "@/config/brand";
import { classifiedCategories, idahoCities, idahoRegions } from "@/config/classifieds";
import {
  browseClassifieds,
  getRecentlySoldListings,
  type ClassifiedCard,
  type SoldCard,
} from "@/lib/classifieds.functions";
import {
  idahoDate,
  landingFaq,
  medianCents,
  priceByMileage,
  priceByYear,
  priceSummary,
  regionOfListing,
  REPORT_NO_PRICE,
  wholeDollars,
  type FaqEntry,
  type PriceBand,
  type PriceSummary,
} from "@/lib/market-stats";
import {
  MAKE_PAGE_MIN_LISTINGS,
  MODEL_PAGE_MIN_LISTINGS,
  PLACE_PAGE_FRESH_DAYS,
  PLACE_PAGE_MIN_LISTINGS,
  canonicalMake,
  canonicalModel,
  makeFromSlug,
  modelFromSlug,
  categoryFromUrlSlug,
  categoryPagePath,
  categoryPhrase,
  placeFromSlug,
  placePath,
  vehiclePagePath,
  type ResolvedPlace,
} from "@/lib/place-pages";

export type PlacePageLink = { label: string; path: string; count: number };

export type PlacePageStat = { label: string; value: string };

export type PlacePriceTable = {
  heading: string;
  rows: { label: string; count: number; median: string }[];
};

export type PlaceRegionGroup = {
  region: string;
  path: string;
  count: number;
  median: string | null;
  listings: ClassifiedCard[];
};

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
  /** Headline numbers: listing count, median and range, newest listing. */
  stats: PlacePageStat[];
  /** Vehicle pages: median price by model year and by mileage. */
  priceTables: PlacePriceTable[];
  /** Statewide category pages: the listings grouped by Idaho region. */
  regionGroups: PlaceRegionGroup[];
  /** Extra link rows, such as popular makes on car pages. */
  extraLinks: { heading: string; links: PlacePageLink[] }[];
  faq: FaqEntry[];
  recentlySold: SoldCard[];
};

// Enough to compute honest stats for a local page without paging forever.
const MAX_PAGES = 8;
const SHOWN_LISTINGS = 24;
const FOR_SALE_EXCEPTIONS = new Set(["jobs", "services", "other-real-estate", "pets"]);
// Pay, quotes, homes that mix sale prices with monthly rent, and pets (fees
// and livestock side by side) don't make an honest single median.
const NO_PRICE_STATS = REPORT_NO_PRICE;
const VEHICLE_TABLE_CATEGORIES = new Set(["cars-trucks", "motorcycles", "rvs-campers", "powersports"]);
const REGION_GROUP_LISTINGS = 4;

type Filters = {
  make?: string;
  model?: string;
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

        // The page's listings, the wider sets its related links count from
        // (other categories here, other cities for this category) and recent
        // sales don't depend on each other, so they load together.
        const mainRequest = fetchListings(filtersFor(place, category?.slug ?? null));
        const [main, placeWide, categoryWide, recentlySold] = await Promise.all([
          mainRequest,
          place && category ? fetchListings(filtersFor(place, null)) : mainRequest,
          category
            ? place
              ? fetchListings(filtersFor(null, category.slug))
              : mainRequest
            : fetchListings(filtersFor(null, null)),
          getRecentlySoldListings({
            data: {
              ...(category ? { category: category.slug } : {}),
              ...(place?.kind === "city" ? { city: place.name, radiusMiles: 25 } : {}),
              ...(place?.kind === "region" ? { region: place.name } : {}),
              limit: 8,
            },
          }),
        ]);
        const phrase = category ? categoryPhrase(category.slug, category.name) : null;
        const where = whereText(place);

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

        const price: PriceSummary | null =
          category && !NO_PRICE_STATS.has(category.slug)
            ? priceSummary(main.listings.map((listing) => listing.priceCents))
            : null;
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
                price ? `, with a median asking price of ${wholeDollars(price.medianCents)}` : ""
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

        // Statewide category pages group their listings by region.
        const regionGroups: PlaceRegionGroup[] =
          category && !place
            ? idahoRegions
                .map((region) => {
                  const inRegion = main.listings.filter(
                    (listing) => regionOfListing(listing) === region,
                  );
                  const regionPrices = inRegion
                    .map((listing) => listing.priceCents)
                    .filter((cents) => cents > 0);
                  return {
                    region,
                    path: placePath(region, category.slug),
                    count: inRegion.length,
                    median:
                      !NO_PRICE_STATS.has(category.slug) && regionPrices.length >= 3
                        ? wholeDollars(medianCents(regionPrices))
                        : null,
                    listings: inRegion.slice(0, REGION_GROUP_LISTINGS),
                  };
                })
                .filter((group) => group.count > 0)
                .sort((a, b) => b.count - a.count)
            : [];

        // Vehicle categories: price by model year and by mileage.
        const priceTables: PlacePriceTable[] =
          category && VEHICLE_TABLE_CATEGORIES.has(category.slug)
            ? vehiclePriceTables(main.listings)
            : [];

        // Car and truck pages link to the make pages for what's listed.
        const makeCounts =
          category?.slug === "cars-trucks"
            ? countBy(main.listings, (listing) => canonicalMake(listing.vehicle?.make))
            : new Map<string, number>();
        const topMakes = Array.from(makeCounts.entries())
          .map(([make, count]) => ({ label: make, path: vehiclePagePath(make), count }))
          .sort((a, b) => b.count - a.count);

        const stats: PlacePageStat[] = [];
        if (main.total > 0) {
          stats.push({ label: "Live listings", value: main.total.toLocaleString("en-US") });
          if (price) {
            stats.push({ label: "Median asking price", value: wholeDollars(price.medianCents) });
            stats.push({
              label: price.typicalRange ? "Most listings" : "Price range",
              value: `${wholeDollars(price.lowCents)} – ${wholeDollars(price.highCents)}`,
            });
          }
          if (newest) stats.push({ label: "Newest listing", value: idahoDate(newest) });
        }

        const faq = landingFaq({
          noun: phrase ? phrase.noun : "listings",
          where,
          total: main.total,
          newest: newest || null,
          price,
          otherPlaces: category ? relatedPlaces : [],
          placesScope: place ? "elsewhere" : "all",
          topCategories: place && !category ? relatedCategories : [],
          topMakes,
          recentlySold: recentlySold.length,
        });

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
            ? place
              ? `${phrase!.heading} in other Idaho cities`
              : `${phrase!.heading} by city`
            : "Other Idaho cities",
          browseSearch,
          breadcrumbs,
          stats,
          priceTables,
          regionGroups,
          extraLinks: topMakes.length
            ? [{ heading: "Popular makes", links: topMakes.slice(0, 16) }]
            : [],
          faq,
          recentlySold,
        };
      },
    );
  });

/** Median price by model year and by mileage, as display rows. */
export function vehiclePriceTables(listings: ClassifiedCard[]): PlacePriceTable[] {
  const format = (rows: PriceBand[]) =>
    rows.map((row) => ({ label: row.label, count: row.count, median: wholeDollars(row.medianCents) }));
  const tables: PlacePriceTable[] = [];
  const byYear = priceByYear(listings);
  if (byYear.length) tables.push({ heading: "Median price by model year", rows: format(byYear) });
  const byMileage = priceByMileage(listings);
  if (byMileage.length) tables.push({ heading: "Median price by mileage", rows: format(byMileage) });
  return tables;
}

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

const pluralModel = (name: string) => (/s$/i.test(name) ? name : `${name}s`);

/**
 * /cars/toyota and /cars/toyota/tacoma: every car or truck of that make (and
 * model) listed in Idaho, with price by year and mileage and where they are.
 * Same shape as the place pages so the same template renders them.
 */
export const getVehiclePage = createServerFn({ method: "GET" })
  .validator((input: { make: string; model?: string }) => ({
    make: String(input?.make ?? "").slice(0, 60),
    model: String(input?.model ?? "").slice(0, 80),
  }))
  .handler(async ({ data }): Promise<PlacePageData | null> => {
    const make = makeFromSlug(data.make);
    if (!make) return null;
    const model = data.model ? modelFromSlug(make, data.model) : null;
    if (data.model && !model) return null;

    const { shortCache, PUBLIC_PAGE_CACHE_MS } = await import("./short-cache.server");
    return shortCache(`vehicle-page:${make}:${model ?? ""}`, PUBLIC_PAGE_CACHE_MS, async () => {
      // This make (and model), the whole make for sibling links, and recent
      // sales load together.
      const mainRequest = fetchListings({
        category: "cars-trucks",
        state: "ID",
        make,
        ...(model ? { model } : {}),
      });
      const [main, makeWide, recentlySold] = await Promise.all([
        mainRequest,
        model ? fetchListings({ category: "cars-trucks", state: "ID", make }) : mainRequest,
        getRecentlySoldListings({
          data: { category: "cars-trucks", make, ...(model ? { model } : {}), limit: 8 },
        }),
      ]);
      const name = model ? `${make} ${model}` : make;
      const noun = model ? pluralModel(name) : `${make} cars and trucks`;
      const where = "in Idaho";

      const price = priceSummary(main.listings.map((listing) => listing.priceCents));
      const newest = main.listings.reduce(
        (latest, listing) => (listing.createdAt > latest ? listing.createdAt : latest),
        "",
      );
      const fresh =
        Boolean(newest) && Date.now() - Date.parse(newest) < PLACE_PAGE_FRESH_DAYS * 86_400_000;
      const minimum = model ? MODEL_PAGE_MIN_LISTINGS : MAKE_PAGE_MIN_LISTINGS;
      const indexable = main.total >= minimum && fresh;

      const cityCounts = countBy(main.listings, (listing) =>
        idahoCities.find((city) => city === listing.city),
      );
      const cities: PlacePageLink[] = Array.from(cityCounts.entries())
        .map(([city, count]) => ({ label: city, path: placePath(city, "cars-trucks"), count }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 10);

      // The make page links to each model listed; a model page to its siblings.
      const modelCounts = countBy(makeWide.listings, (listing) =>
        canonicalModel(make, listing.vehicle?.model),
      );
      const models: PlacePageLink[] = Array.from(modelCounts.entries())
        .filter(([other]) => other !== model)
        .map(([other, count]) => ({ label: other, path: vehiclePagePath(make, other), count }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 16);

      const years = main.listings
        .map((listing) => listing.vehicle?.year)
        .filter((year): year is number => typeof year === "number");

      const heading = `${name} for sale in Idaho`;
      const lead =
        main.total === 0
          ? `No ${noun} are listed in Idaho right now. New ones show up here as soon as they're posted.`
          : `There ${main.total === 1 ? "is" : "are"} ${main.total} ${
              main.total === 1 ? `${name} listing` : `${name} listings`
            } in Idaho right now${
              price ? `, with a median asking price of ${wholeDollars(price.medianCents)}` : ""
            }.`;

      const stats: PlacePageStat[] = [];
      if (main.total > 0) {
        stats.push({ label: "Live listings", value: main.total.toLocaleString("en-US") });
        if (price) {
          stats.push({ label: "Median asking price", value: wholeDollars(price.medianCents) });
          stats.push({
            label: price.typicalRange ? "Most listings" : "Price range",
            value: `${wholeDollars(price.lowCents)} – ${wholeDollars(price.highCents)}`,
          });
        }
        if (years.length) {
          const low = Math.min(...years);
          const high = Math.max(...years);
          stats.push({ label: "Model years", value: low === high ? String(low) : `${low}–${high}` });
        }
      }

      const breadcrumbs = [
        { label: "Idaho", path: "/browse" },
        { label: "Cars & Trucks", path: categoryPagePath("cars-trucks") },
        { label: make, path: vehiclePagePath(make) },
        ...(model ? [{ label: model, path: vehiclePagePath(make, model) }] : []),
      ];

      return {
        heading,
        title: `${heading} — ${brand.name}`,
        description: `${lead} Contact local sellers directly on ${brand.name}.`,
        lead,
        listings: main.listings.slice(0, SHOWN_LISTINGS),
        total: main.total,
        indexable,
        relatedCategories: [],
        relatedPlaces: cities,
        relatedPlacesHeading: `${name} listings by city`,
        browseSearch: { category: "cars-trucks", state: "ID", make, ...(model ? { model } : {}) },
        breadcrumbs,
        stats,
        priceTables: vehiclePriceTables(main.listings),
        regionGroups: [],
        extraLinks: models.length
          ? [{ heading: model ? `Other ${make} models` : `${make} models`, links: models }]
          : [],
        faq: landingFaq({
          noun,
          where,
          total: main.total,
          newest: newest || null,
          price,
          otherPlaces: cities,
          placesScope: "all",
          recentlySold: recentlySold.length,
        }),
        recentlySold,
      };
    });
  });
