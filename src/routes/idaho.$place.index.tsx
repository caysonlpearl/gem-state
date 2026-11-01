import { createFileRoute, notFound, redirect } from "@tanstack/react-router";
import { useSuspenseQuery } from "@tanstack/react-query";

import { PlacePage } from "@/components/classifieds/PlacePage";
import { placePageHead, placePageQuery } from "@/lib/place-page-route";

import {
  categoryFromUrlSlug,
  resolvedCategoryUrlSlug,
  categoryPagePath,
  placeFromSlug,
} from "@/lib/place-pages";

// /idaho/boise (a city or region hub) or /idaho/trailers (a category across Idaho).
export const Route = createFileRoute("/idaho/$place/")({
  loader: async ({ context, params }) => {
    const category = placeFromSlug(params.place) ? null : categoryFromUrlSlug(params.place);
    if (category && params.place !== resolvedCategoryUrlSlug(category)) {
      throw redirect({ href: categoryPagePath(category.slug), statusCode: 301 });
    }
    const data = await context.queryClient.ensureQueryData(placePageQuery(params.place));
    if (!data) throw notFound();
    return data;
  },
  head: ({ loaderData }) => placePageHead(
    loaderData?.browseSearch.city === "Boise" && !loaderData.browseSearch.category
      ? {
          ...loaderData,
          title: "Boise Marketplace Classifieds — Bluebird",
          description:
            "Browse Boise-area classifieds on Bluebird. Explore current listings by category, narrow your search by price and location, and contact sellers directly.",
        }
      : loaderData,
  ),
  component: PlaceRoute,
});

function PlaceRoute() {
  const { place } = Route.useParams();
  const { data } = useSuspenseQuery(placePageQuery(place));
  return data ? <PlacePage data={data} /> : null;
}
