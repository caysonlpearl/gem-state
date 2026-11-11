import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import { queryOptions, useSuspenseQuery } from "@tanstack/react-query";
import { getPublicRetailer } from "@/lib/retailer.functions";
import { ListingCard } from "@/components/classifieds/ListingCard";
import { ListingSellerIdentity } from "@/components/listings/ListingSellerIdentity";
import { Phone, ChatCircle, Globe } from "@phosphor-icons/react";
const retailerQuery = (slug: string, page: number) =>
  queryOptions({
    queryKey: ["retailer-profile", slug, page],
    queryFn: () => getPublicRetailer({ data: { slug, page } }),
    staleTime: 60_000,
  });
export const Route = createFileRoute("/retailers/$slug")({
  validateSearch: (s: Record<string, unknown>): { page?: number } =>
    s.page == null ? {} : { page: Math.min(10000, Math.max(1, Math.floor(Number(s.page) || 1))) },
  loaderDeps: ({ search }) => ({ page: search.page ?? 1 }),
  loader: async ({ context, params, deps }) => {
    const retailer = await context.queryClient.ensureQueryData(
      retailerQuery(params.slug, deps.page),
    );
    if (!retailer) throw notFound();
    return { retailer };
  },
  head: ({ loaderData }) => ({
    meta: [
      { title: `${loaderData?.retailer.name ?? "Seller"} · Bluebird Marketplace` },
      { name: "robots", content: "noindex,follow" },
    ],
  }),
  component: RetailerProfile,
  notFoundComponent: () => (
    <main className="mx-auto max-w-[1280px] px-4 py-14">
      <h1 className="text-2xl font-bold">Seller profile not found</h1>
      <Link to="/browse" search={{}} className="mt-4 inline-block underline">
        Browse listings
      </Link>
    </main>
  ),
});
function RetailerProfile() {
  const { slug } = Route.useParams();
  const page = Route.useSearch().page ?? 1;
  const { data: r } = useSuspenseQuery(retailerQuery(slug, page));
  if (!r) return null;
  const button =
    "inline-flex h-10 items-center justify-center gap-2 rounded-xl border border-border bg-card px-4 text-sm font-semibold text-primary hover:bg-secondary";
  return (
    <main className="mx-auto max-w-[1280px] px-4 py-8 sm:px-8">
      <header className="max-w-2xl">
        <ListingSellerIdentity
          name={r.name}
          imageUrl={r.logoUrl}
          title={r.name}
          headingLevel="h1"
        />
        <div className="mt-4 grid grid-cols-3 gap-2" aria-label="Seller contact options">
          <a className={button} href={r.phoneHref}>
            <Phone size={17} />
            Call
          </a>
          <a className={button} href={r.contactUrl} target="_blank" rel="noopener noreferrer">
            <ChatCircle size={17} />
            Contact
          </a>
          <a className={button} href={r.website} target="_blank" rel="noopener noreferrer">
            <Globe size={17} />
            Website
          </a>
        </div>
        <p className="mt-3 text-sm text-muted-foreground">{r.phone}</p>
      </header>
      <section id="inventory" className="mt-9">
        <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-2xl font-bold">Listings from {r.name}</h2>
          <span className="text-sm text-muted-foreground">{r.listingCount} active listings</span>
        </div>
        {r.listings.length ? (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {r.listings.map((c) => (
              <ListingCard key={c.id} listing={c} />
            ))}
          </div>
        ) : (
          <p>No active listings right now.</p>
        )}
        {r.pageCount > 1 ? (
          <nav
            aria-label="Seller inventory pages"
            className="mt-8 flex flex-wrap items-center justify-center gap-3"
          >
            {r.page > 1 ? (
              <Link
                to="/retailers/$slug"
                params={{ slug }}
                search={{ page: r.page - 1 }}
                hash="inventory"
                className={button}
              >
                Previous
              </Link>
            ) : null}
            <span className="text-sm">
              Page {r.page} of {r.pageCount}
            </span>
            {r.page < r.pageCount ? (
              <Link
                to="/retailers/$slug"
                params={{ slug }}
                search={{ page: r.page + 1 }}
                hash="inventory"
                className={button}
              >
                Next
              </Link>
            ) : null}
          </nav>
        ) : null}
      </section>
    </main>
  );
}
