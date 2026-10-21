import { createFileRoute, notFound, redirect } from "@tanstack/react-router";
import { useSuspenseQuery } from "@tanstack/react-query";

import { PlacePage } from "@/components/classifieds/PlacePage";
import { placePageHead, placePageQuery } from "@/lib/place-page-route";

import { categoryFromUrlSlug, categoryUrlSlug, categoryPagePath, placeFromSlug } from "@/lib/place-pages";

// /idaho/boise (a city or region hub) or /idaho/trailers (a category across Idaho).
export const Route = createFileRoute("/idaho/$place/")({
  loader: async ({ context, params }) => {
    const category = placeFromSlug(params.place) ? null : categoryFromUrlSlug(params.place);
    if (category && params.place !== categoryUrlSlug(category.slug)) {
      throw redirect({ href: categoryPagePath(category.slug), statusCode: 301 });
    }
    const data = await context.queryClient.ensureQueryData(placePageQuery(params.place));
    if (!data) throw notFound();
    return data;
  },
  head: ({ loaderData }) => placePageHead(loaderData),
  component: PlaceRoute,
});

function PlaceRoute() {
  const { place } = Route.useParams();
  const { data } = useSuspenseQuery(placePageQuery(place));
  return data ? <PlacePage data={data} /> : null;
}
