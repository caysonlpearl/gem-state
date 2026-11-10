import { DealerStorefrontHeader } from "@/components/dealers/DealerStorefrontHeader";
import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import { queryOptions, useSuspenseQuery } from "@tanstack/react-query";

import { ListingCard } from "@/components/classifieds/ListingCard";
import { BluebirdEmptyState } from "@/components/layout/BluebirdEmptyState";
import { isIndexableStorefront } from "@/lib/seo-policy";
import { getPublicDealer } from "@/lib/dealer.functions";

const dealerQuery = (slug: string) =>
  queryOptions({
    queryKey: ["public-dealer", slug],
    queryFn: () => getPublicDealer({ data: { slug } }),
  });

export const Route = createFileRoute("/dealers/$slug")({
  loader: async ({ context, params }) => {
    const dealer = await context.queryClient.ensureQueryData(dealerQuery(params.slug));
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
  const { data: dealer } = useSuspenseQuery(dealerQuery(slug));
  if (!dealer) return null;

  return (
    <main className="mx-auto max-w-[1280px] px-4 py-7 sm:px-8 sm:py-10">
      <DealerStorefrontHeader dealer={dealer} />
      <section id="dealer-inventory" className="scroll-mt-8 pt-9">
        <div className="mb-5 flex items-end justify-between gap-3">
          <h2 className="font-editorial text-[27px] font-normal">Current inventory</h2>
          <span className="text-[11.5px] text-muted-foreground">
            {dealer.listingCount ?? dealer.listings.length} active listings
          </span>
        </div>
        {(dealer.listingCount ?? 0) > dealer.listings.length ? (
          <Link
            to="/browse"
            search={{ dealerSlug: dealer.slug, category: "cars-trucks", vehicleMode: "results" }}
            className="mb-5 inline-block text-sm text-primary underline"
          >
            Browse all inventory
          </Link>
        ) : null}
        {dealer.listings.length ? (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {dealer.listings.map((listing) => (
              <ListingCard key={listing.id} listing={listing} />
            ))}
          </div>
        ) : (
          <BluebirdEmptyState
            title="No active inventory right now"
            description="This dealership will show vehicles here as soon as inventory is approved."
            className="max-w-3xl"
          />
        )}
      </section>
    </main>
  );
}
