import { createFileRoute, notFound } from "@tanstack/react-router";
import { useSuspenseQuery } from "@tanstack/react-query";

import { PlacePage } from "@/components/classifieds/PlacePage";
import { placePageHead, placePageQuery } from "@/lib/place-page-route";

// /idaho/boise/trailers: one category in one city or region.
export const Route = createFileRoute("/idaho/$place/$category")({
  loader: async ({ context, params }) => {
    const data = await context.queryClient.ensureQueryData(
      placePageQuery(params.place, params.category),
    );
    if (!data) throw notFound();
    return data;
  },
  head: ({ loaderData }) => placePageHead(loaderData),
  component: PlaceCategoryRoute,
});

function PlaceCategoryRoute() {
  const { place, category } = Route.useParams();
  const { data } = useSuspenseQuery(placePageQuery(place, category));
  return data ? <PlacePage data={data} /> : null;
}
