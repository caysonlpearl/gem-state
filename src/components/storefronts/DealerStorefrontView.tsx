import type { ComponentType, ComponentProps } from "react";
import type { PublicDealerProfile } from "@/lib/dealer.functions";
import type { ListingCard as WebsiteCard } from "@/components/classifieds/ListingCard";
import { BluebirdEmptyState } from "@/components/layout/BluebirdEmptyState";
import type { StorefrontLinkProps } from "./storefront-types";
export function DealerStorefrontView({
  dealer,
  page = 1,
  runtime,
}: {
  dealer: PublicDealerProfile;
  page?: number;
  runtime: {
    Header: ComponentType<{ dealer: PublicDealerProfile }>;
    ListingCard: ComponentType<ComponentProps<typeof WebsiteCard>>;
    Link: ComponentType<StorefrontLinkProps>;
    pageElement?: "main" | "article";
  };
}) {
  const { Header: DealerStorefrontHeader, ListingCard, Link } = runtime;
  const Page = runtime.pageElement ?? "main";
  const slug = dealer.slug;
  return (
    <Page className="mx-auto max-w-[1280px] px-4 py-7 sm:px-8 sm:py-10">
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
    </Page>
  );
}
