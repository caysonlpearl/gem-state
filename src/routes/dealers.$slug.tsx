import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import { queryOptions, useSuspenseQuery } from "@tanstack/react-query";

import { ListingCard } from "@/components/classifieds/ListingCard";
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
      {
        title: loaderData?.dealer
          ? `${loaderData.dealer.displayName} · Bluebird Marketplace`
          : "Dealership · Bluebird Marketplace",
      },
      {
        name: "description",
        content: loaderData?.dealer?.description ?? "Verified dealership storefront on Bluebird Marketplace.",
      },
    ],
  }),
  component: DealerPage,
  notFoundComponent: () => (
    <main className="mx-auto max-w-[760px] px-4 py-20 text-center">
      <h1 className="font-editorial text-[34px]">Dealership not found</h1>
      <p className="mt-2 text-sm text-muted-foreground">This storefront is unavailable or still being verified.</p>
      <Link to="/browse" search={{}} className="mt-5 inline-block underline">
        Browse listings
      </Link>
    </main>
  ),
});

function DealerPage() {
  const { slug } = Route.useParams();
  const { data: dealer } = useSuspenseQuery(dealerQuery(slug));
  if (!dealer) return null;

  return (
    <main className="mx-auto max-w-[1180px] px-4 py-10 sm:px-8">
      <section className="border-b border-border pb-8">
        <div className="flex items-start gap-4">
          <div className="grid h-16 w-16 shrink-0 place-items-center overflow-hidden rounded-lg bg-primary text-[22px] font-semibold text-primary-foreground">
            {dealer.logoUrl ? (
              <img src={dealer.logoUrl} alt="" className="h-full w-full object-cover" />
            ) : (
              dealer.displayName.slice(0, 1).toUpperCase()
            )}
          </div>
          <div className="min-w-0">
            <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-primary">Verified dealership</p>
            <h1 className="mt-1 font-editorial text-[38px] font-normal tracking-[-0.035em]">{dealer.displayName}</h1>
            <p className="text-[11.5px] text-muted-foreground">
              {dealer.city || "Idaho"}{dealer.state ? `, ${dealer.state}` : ""} · /dealers/{dealer.slug}
            </p>
            {dealer.description ? <p className="mt-3 max-w-[680px] text-[13px] leading-relaxed text-muted-foreground">{dealer.description}</p> : null}
          </div>
        </div>
        <div className="mt-5 flex flex-wrap gap-x-5 gap-y-2 text-[12px] text-muted-foreground">
          {dealer.addressLine1 ? <span>{dealer.addressLine1}{dealer.city ? `, ${dealer.city}` : ""}{dealer.state ? `, ${dealer.state}` : ""}</span> : null}
          {dealer.phone ? <a className="hover:text-foreground" href={`tel:${dealer.phone}`}>{dealer.phone}</a> : null}
          {dealer.email ? <a className="hover:text-foreground" href={`mailto:${dealer.email}`}>{dealer.email}</a> : null}
          {dealer.website ? <a className="hover:text-foreground" href={dealer.website} target="_blank" rel="noreferrer">Website</a> : null}
        </div>
      </section>
      <section className="pt-7">
        <div className="mb-5 flex items-end justify-between gap-3">
          <h2 className="font-editorial text-[27px] font-normal">Current inventory</h2>
          <span className="text-[11.5px] text-muted-foreground">{dealer.listings.length} active listings</span>
        </div>
        {dealer.listings.length ? (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {dealer.listings.map((listing) => <ListingCard key={listing.id} listing={listing} />)}
          </div>
        ) : (
          <p className="border border-dashed border-input bg-card p-5 text-[13px] text-muted-foreground">This dealership has no active inventory right now.</p>
        )}
      </section>
    </main>
  );
}
