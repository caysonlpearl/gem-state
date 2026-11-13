import { WebsiteStorefrontLink } from "@/components/storefronts/WebsiteStorefrontLink";
import { DealerStorefrontHeader } from "@/components/dealers/DealerStorefrontHeader";
import { DealerStorefrontView } from "@/components/storefronts/DealerStorefrontView";
import { queryOptions, useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute, Link, notFound } from "@tanstack/react-router";

import { ListingCard } from "@/components/classifieds/ListingCard";
import { BluebirdEmptyState } from "@/components/layout/BluebirdEmptyState";
import { trackBusinessEvent } from "@/lib/business-analytics";
import { businessForListing } from "@/lib/business-performance";
import { getPublicDealer } from "@/lib/dealer.functions";
import { isIndexableStorefront } from "@/lib/seo-policy";
import { useEffect } from "react";

const dealerQuery = (slug: string, page = 1) =>
  queryOptions({
    queryKey: ["public-dealer", slug, page],
    queryFn: () => getPublicDealer({ data: { slug, page } }),
  });

export const Route = createFileRoute("/dealers/$slug")({
  validateSearch: (search: Record<string, unknown>): { page?: number } =>
    search["page"] == null
      ? {}
      : { page: Math.min(10000, Math.max(1, Math.floor(Number(search["page"]) || 1))) },
  loaderDeps: ({ search }) => ({ page: search.page ?? 1 }),
  loader: async ({ context, params, deps }) => {
    const dealer = await context.queryClient.ensureQueryData(dealerQuery(params.slug, deps.page));
    if (!dealer) throw notFound();
    return { dealer };
  },
  head: ({ loaderData }) => ({
    meta: [
      ...(isIndexableStorefront(loaderData?.dealer?.listings.length ?? 0)
        ? []
        : [{ name: "robots", content: "noindex, follow" }]),
      {
        title: loaderData?.dealer
          ? `${loaderData.dealer.displayName} · Bluebird Marketplace`
          : "Dealership · Bluebird Marketplace",
      },
      {
        name: "description",
        content:
          loaderData?.dealer?.description ??
          "Verified dealership storefront on Bluebird Marketplace.",
      },
    ],
  }),
  component: DealerPage,
  notFoundComponent: () => (
    <main className="mx-auto max-w-[760px] px-4 py-14">
      <BluebirdEmptyState
        title="Dealership not found"
        description="This storefront is unavailable or still being verified."
      >
        <Link to="/browse" search={{}} className="inline-flex h-10 items-center underline">
          Browse listings
        </Link>
      </BluebirdEmptyState>
    </main>
  ),
});

function DealerPage() {
  const { slug } = Route.useParams();
  const page = Route.useSearch().page ?? 1;
  const { data: dealer } = useSuspenseQuery(dealerQuery(slug, page));
  useEffect(() => {
    if (dealer)
      trackBusinessEvent(
        "business_profile_viewed",
        businessForListing({
          id: "dealer-profile:" + dealer.slug,
          city: dealer.city ?? "",
          state: dealer.state ?? "",
          dealer: {
            slug: dealer.slug,
            displayName: dealer.displayName,
            website: dealer.website,
            city: dealer.city,
            state: dealer.state,
          },
        }),
      );
  }, [dealer?.id, page]);
  if (!dealer) return null;

  return (
    <DealerStorefrontView
      dealer={dealer}
      page={page}
      runtime={{ Header: DealerStorefrontHeader, ListingCard, Link: WebsiteStorefrontLink }}
    />
  );
}
