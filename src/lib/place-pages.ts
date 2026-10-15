import {
  classifiedCategories,
  idahoCities,
  idahoRegions,
  vehicleModelsByMake,
  vehicleOptions,
} from "@/config/classifieds";

/**
 * URL shapes for the search landing pages:
 *   /idaho/{city | region | category}
 *   /idaho/{city | region}/{category}
 * Shared by the routes, the sitemap and every link that points at them.
 */

export function placeSlug(name: string) {
  return name
    .toLowerCase()
    .replace(/'/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

// "other-real-estate" is the internal slug; people search for homes.
const CATEGORY_URL_ALIASES: Record<string, string> = { "other-real-estate": "homes" };

export function categoryUrlSlug(slug: string) {
  return CATEGORY_URL_ALIASES[slug] ?? slug;
}

export function categoryFromUrlSlug(urlSlug: string) {
  const internal =
    Object.entries(CATEGORY_URL_ALIASES).find(([, alias]) => alias === urlSlug)?.[0] ?? urlSlug;
  return classifiedCategories.find((category) => category.slug === internal) ?? null;
}

export type ResolvedPlace = { kind: "city"; name: string } | { kind: "region"; name: string };

export function placeFromSlug(slug: string): ResolvedPlace | null {
  const city = idahoCities.find((name) => placeSlug(name) === slug);
  if (city) return { kind: "city", name: city };
  const region = idahoRegions.find((name) => placeSlug(name) === slug);
  if (region) return { kind: "region", name: region };
  return null;
}

export function placePath(place: string, categorySlug?: string) {
  const base = `/idaho/${placeSlug(place)}`;
  return categorySlug ? `${base}/${categoryUrlSlug(categorySlug)}` : base;
}

export function categoryPagePath(categorySlug: string) {
  return `/idaho/${categoryUrlSlug(categorySlug)}`;
}

/** The closest landing page for a listing: its city and category, else its category statewide. */
export function nearbyPagePath(
  categorySlug: string | null | undefined,
  city: string | null | undefined,
) {
  if (!categorySlug) return "/browse";
  const knownCity = idahoCities.find((name) => name === city);
  return knownCity ? placePath(knownCity, categorySlug) : categoryPagePath(categorySlug);
}

/** How a category reads in a sentence and a heading. */
export function categoryPhrase(slug: string, name: string) {
  if (slug === "jobs") return { noun: "jobs", heading: "Jobs" };
  if (slug === "services") return { noun: "local services", heading: "Local services" };
  if (slug === "other-real-estate") return { noun: "homes for sale and rent", heading: "Homes" };
  if (slug === "pets") return { noun: "pets", heading: "Pets" };
  return { noun: name.toLowerCase(), heading: name };
}

/** A page is only offered to search engines once it's worth landing on. */
export {
  SEO_MIN_LISTINGS as PLACE_PAGE_MIN_LISTINGS,
  SEO_FRESH_DAYS as PLACE_PAGE_FRESH_DAYS,
} from "@/lib/seo-policy";
/** Make pages use the same bar; a single model needs fewer to be useful. */
export const MAKE_PAGE_MIN_LISTINGS = 5;
export const MODEL_PAGE_MIN_LISTINGS = 3;

/**
 * Vehicle make and model pages: /cars/toyota and /cars/toyota/tacoma, for
 * cars and trucks. Makes and models come from the vehicle catalog the
 * listing form uses, so every page name is spelled the catalog's way.
 */
export function canonicalMake(value: string | null | undefined) {
  const key = String(value ?? "")
    .trim()
    .toLowerCase();
  return key ? (vehicleOptions.makes.find((make) => make.toLowerCase() === key) ?? null) : null;
}

export function canonicalModel(make: string, value: string | null | undefined) {
  const key = String(value ?? "")
    .trim()
    .toLowerCase();
  if (!key) return null;
  return (vehicleModelsByMake[make] ?? []).find((model) => model.toLowerCase() === key) ?? null;
}

export function vehiclePagePath(make: string, model?: string | null) {
  return model ? `/cars/${placeSlug(make)}/${placeSlug(model)}` : `/cars/${placeSlug(make)}`;
}

export function makeFromSlug(slug: string) {
  return vehicleOptions.makes.find((make) => placeSlug(make) === slug) ?? null;
}

export function modelFromSlug(make: string, slug: string) {
  return (vehicleModelsByMake[make] ?? []).find((model) => placeSlug(model) === slug) ?? null;
}
