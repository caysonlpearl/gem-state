import { createFileRoute, notFound } from "@tanstack/react-router";
import { useSuspenseQuery } from "@tanstack/react-query";

import { PlacePage, placePageHead, placePageQuery } from "@/components/classifieds/PlacePage";

// /idaho/boise (a city or region hub) or /idaho/trailers (a category across Idaho).
export const Route = createFileRoute("/idaho/$place/")({
  loader: async ({ context, params }) => {
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
