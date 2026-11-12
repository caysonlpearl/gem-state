import { DealerStorefrontHeader } from "@/components/dealers/DealerStorefrontHeader";
import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import { queryOptions, useSuspenseQuery } from "@tanstack/react-query";

import { ListingCard } from "@/components/classifieds/ListingCard";
import { BluebirdEmptyState } from "@/components/layout/BluebirdEmptyState";
import { isIndexableStorefront } from "@/lib/seo-policy";
import { getPublicDealer } from "@/lib/dealer.functions";
import { useEffect } from "react";
import { trackBusinessEvent } from "@/lib/business-analytics";
import { businessForListing } from "@/lib/business-performance";

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
    <main className="mx-auto max-w-[1280px] px-4 py-7 sm:px-8 sm:py-10">
      <DealerStorefrontHeader dealer={dealer} />
      <section id="dealer-inventory" className="scroll-mt-8 pt-9">
        <div className="mb-5 flex items-end justify-between gap-3">
          <h2 className="font-editorial text-[27px] font-normal">Current inventory</h2>
          <span className="text-[11.5px] text-muted-foreground">
            {dealer.listingCount ?? dealer.listings.length} active listings
          </span>
        </div>
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
        {(dealer.pageCount ?? 1) > 1 ? (
          <nav
            aria-label="Dealership inventory pages"
            className="mt-9 flex flex-wrap items-center justify-center gap-2 border-t border-border/70 pt-7"
          >
            {(dealer.page ?? page) > 1 ? (
              <Link
                to="/dealers/$slug"
                params={{ slug }}
                search={{ page: (dealer.page ?? page) - 1 }}
                hash="dealer-inventory"
                className="rounded-full border border-border px-4 py-3 text-sm font-semibold"
              >
                Previous
              </Link>
            ) : null}
            {Array.from({ length: dealer.pageCount ?? 1 }, (_, i) => i + 1)
              .filter(
                (n) =>
                  n === 1 || n === dealer.pageCount || Math.abs(n - (dealer.page ?? page)) <= 2,
              )
              .map((n, i, all) => (
                <span key={n} className="inline-flex items-center gap-2">
                  {i > 0 && n > all[i - 1] + 1 ? (
                    <span className="px-1 text-muted-foreground">…</span>
                  ) : null}
                  <Link
                    to="/dealers/$slug"
                    params={{ slug }}
                    search={{ page: n }}
                    hash="dealer-inventory"
                    aria-label={`Inventory page ${n}`}
                    aria-current={n === (dealer.page ?? page) ? "page" : undefined}
                    className={`grid h-11 w-11 place-items-center rounded-full text-sm font-semibold ${n === (dealer.page ?? page) ? "bg-primary text-primary-foreground" : "border border-border hover:bg-secondary"}`}
                  >
                    {n}
                  </Link>
                </span>
              ))}
            {(dealer.page ?? page) < (dealer.pageCount ?? 1) ? (
              <Link
                to="/dealers/$slug"
                params={{ slug }}
                search={{ page: (dealer.page ?? page) + 1 }}
                hash="dealer-inventory"
                className="rounded-full border border-border px-4 py-3 text-sm font-semibold"
              >
                Next
              </Link>
            ) : null}
            <p className="mt-3 w-full text-center text-xs text-muted-foreground">
              Page {dealer.page ?? page} of {dealer.pageCount} · {dealer.listingCount} vehicles
            </p>
          </nav>
        ) : null}
      </section>
    </main>
  );
}
