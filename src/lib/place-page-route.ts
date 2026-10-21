import { queryOptions } from "@tanstack/react-query";
import { getPlacePage, getVehiclePage, type PlacePageData } from "@/lib/place-pages.functions";
import { PUBLIC_PAGE_STALE_MS } from "@/lib/query-freshness";
import { jsonLdScript, placePageStructuredData } from "@/lib/structured-data";

export const placePageQuery = (place: string, category?: string) =>
  queryOptions({
    queryKey: ["place-page", place, category ?? null],
    staleTime: PUBLIC_PAGE_STALE_MS,
    queryFn: () => getPlacePage({ data: { place, ...(category ? { category } : {}) } }),
  });

export const vehiclePageQuery = (make: string, model?: string) =>
  queryOptions({
    queryKey: ["vehicle-page", make, model ?? null],
    staleTime: PUBLIC_PAGE_STALE_MS,
    queryFn: () => getVehiclePage({ data: { make, ...(model ? { model } : {}) } }),
  });

export function placePageHead(data: PlacePageData | null | undefined) {
  if (!data) return { meta: [{ name: "robots", content: "noindex" }] };
  return {
    meta: [
      { title: data.title },
      { name: "description", content: data.description },
      // Below the inventory gate the page still works for visitors but stays
      // out of the index, so thin pages never count against the site.
      ...(data.indexable ? [] : [{ name: "robots", content: "noindex, follow" }]),
      { property: "og:title", content: data.title },
      { property: "og:description", content: data.description },
      { property: "og:type", content: "website" },
    ],
    scripts: [
      jsonLdScript(
        placePageStructuredData({
          heading: data.heading,
          path: data.breadcrumbs.at(-1)?.path ?? "/browse",
          breadcrumbs: data.breadcrumbs,
          listings: data.listings,
          faq: data.faq,
        }),
      ),
    ],
  };
}
