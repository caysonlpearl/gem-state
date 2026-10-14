import { createFileRoute, notFound } from "@tanstack/react-router";
import { useSuspenseQuery } from "@tanstack/react-query";

import { PlacePage, placePageHead, vehiclePageQuery } from "@/components/classifieds/PlacePage";

// /cars/toyota/tacoma: one make and model listed in Idaho.
export const Route = createFileRoute("/cars/$make/$model")({
  loader: async ({ context, params }) => {
    const data = await context.queryClient.ensureQueryData(
      vehiclePageQuery(params.make, params.model),
    );
    if (!data) throw notFound();
    return data;
  },
  head: ({ loaderData }) => placePageHead(loaderData),
  component: ModelRoute,
});

function ModelRoute() {
  const { make, model } = Route.useParams();
  const { data } = useSuspenseQuery(vehiclePageQuery(make, model));
  return data ? <PlacePage data={data} /> : null;
}
