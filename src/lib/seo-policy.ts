/** Shared crawl policy. Search state is already validated by its route. */
export const SEO_MIN_LISTINGS = 5;
export const SEO_FRESH_DAYS = 30;
export const SEO_CITY_RADIUS_MILES = 25;

type SeoPlace = { kind: "city" | "region"; name: string } | null;

export function placeInventoryFilters(place: SeoPlace, category?: string | null) {
  return {
    state: "ID",
    ...(place?.kind === "city" ? { city: place.name, radiusMiles: SEO_CITY_RADIUS_MILES } : {}),
    ...(place?.kind === "region" ? { region: place.name } : {}),
    ...(category ? { category } : {}),
  };
}

/** Same geography for the rendered page and its sitemap membership. */
export function matchesSeoPlace(
  place: SeoPlace,
  listing: { city: string; state: string; region: string },
  withinRadius: (city: string, listingCity: string, radius: number) => boolean,
) {
  const filters = placeInventoryFilters(place);
  if (listing.state !== filters.state) return false;
  if (filters.region && listing.region !== filters.region) return false;
  return !filters.city || withinRadius(filters.city, listing.city, SEO_CITY_RADIUS_MILES);
}

const PRIVATE_PREFIXES = [
  "/account",
  "/admin",
  "/auth",
  "/claim-seller",
  "/messages",
  "/selling",
  "/buying",
  "/watchlist",
  "/notifications",
  "/onboarding",
  "/seller-setup",
  "/dealer-setup",
  "/create-listing",
  "/create-missing-listing",
  "/orders",
  "/shopper",
  "/shopper-payouts",
  "/suggest",
  "/lovable/email",
];

export function isPrivateSeoPath(path: string) {
  return PRIVATE_PREFIXES.some((prefix) => path === prefix || path.startsWith(`${prefix}/`));
}

export function isSitemapAllowedPath(path: string) {
  return !isPrivateSeoPath(path) && !/^\/shoppers(\/|$)/.test(path);
}

export function isIndexableStorefront(activeListingCount: number) {
  return activeListingCount > 0;
}

const COLLECTION_KEYS = new Set([
  "category",
  "group",
  "allCategories",
  "page",
  "vehicleMode",
  "homeMode",
  "jobMode",
  "serviceMode",
  "petMode",
  "homeTab",
]);

export function isIndexableCollectionSearch(search: Record<string, unknown>) {
  return Object.entries(search).every(
    ([key, value]) =>
      COLLECTION_KEYS.has(key) ||
      value == null ||
      value === false ||
      value === "" ||
      (key === "sort" && value === "newest") ||
      (key === "view" && value === "grid"),
  );
}

export function isIndexableCollection(search: Record<string, unknown>, total: number) {
  return total >= SEO_MIN_LISTINGS && isIndexableCollectionSearch(search);
}

export function isIndexablePlaceInventory(
  total: number,
  newestCreatedAt: string,
  now = Date.now(),
  minimum = SEO_MIN_LISTINGS,
) {
  return total >= minimum && Date.parse(newestCreatedAt) >= now - SEO_FRESH_DAYS * 86_400_000;
}

/** Never collapse distinct pages of a collection into its first page. */
export function canonicalPagePath(pathname: string, search: Record<string, unknown> = {}) {
  const path = pathname === "/" ? "/" : pathname.replace(/\/+$/, "");
  if (path !== "/browse") return path;
  const params = new URLSearchParams();
  if (typeof search.category === "string" && search.category)
    params.set("category", search.category);
  else if (search.group === "motors") params.set("group", "motors");
  else if (search.allCategories === true || search.allCategories === "true")
    params.set("allCategories", "true");
  for (const key of ["vehicleMode", "homeMode", "jobMode", "serviceMode", "petMode"])
    if (search[key] === "results") params.set(key, "results");
  if (search.category === "other-real-estate" && ["rent", "build"].includes(String(search.homeTab)))
    params.set("homeTab", String(search.homeTab));
  const page = Number(search.page);
  if (Number.isSafeInteger(page) && page > 1) params.set("page", String(page));
  return params.size ? `${path}?${params}` : path;
}

export function isOutOfRangePage(page: number, total: number, pageSize: number) {
  return page > Math.max(1, Math.ceil(total / pageSize));
}

export function socialImageMeta(
  siteUrl: string,
  imagePath = "/images/share/marketplace-share.jpg",
  alt = "Bluebird Marketplace — find your next local gem",
) {
  const image = imagePath.startsWith("/") ? `${siteUrl}${imagePath}` : imagePath;
  return [
    { property: "og:image", content: image },
    { property: "og:image:alt", content: alt },
    { name: "twitter:card", content: "summary_large_image" },
    { name: "twitter:image", content: image },
    { name: "twitter:image:alt", content: alt },
  ];
}

/** Apply only to known public aliases; don't redirect editor preview hosts. */
export function seoHostPolicy(url: URL) {
  if (["www.onbluebird.com", "gemstateclassifieds.lovable.app"].includes(url.hostname)) {
    const destination = new URL(url.pathname + url.search, "https://onbluebird.com");
    return { redirect: destination.href, preview: false };
  }
  return {
    redirect: null,
    preview:
      url.hostname.endsWith(".lovable.app") ||
      url.hostname.endsWith(".lovableproject.com") ||
      url.hostname === "localhost" ||
      url.hostname === "127.0.0.1",
  };
}
