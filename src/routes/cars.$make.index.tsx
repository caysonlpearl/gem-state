import { createFileRoute, notFound } from "@tanstack/react-router";
import { useSuspenseQuery } from "@tanstack/react-query";

import { PlacePage } from "@/components/classifieds/PlacePage";
import { placePageHead, vehiclePageQuery } from "@/lib/place-page-route";

// /cars/toyota: every car or truck of one make listed in Idaho.
export const Route = createFileRoute("/cars/$make/")({
  loader: async ({ context, params }) => {
    const data = await context.queryClient.ensureQueryData(vehiclePageQuery(params.make));
    if (!data) throw notFound();
    return data;
  },
  head: ({ loaderData }) => placePageHead(loaderData),
  component: MakeRoute,
});

function MakeRoute() {
  const { make } = Route.useParams();
  const { data } = useSuspenseQuery(vehiclePageQuery(make));
  return data ? <PlacePage data={data} /> : null;
}
