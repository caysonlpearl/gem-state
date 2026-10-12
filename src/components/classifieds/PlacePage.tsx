import { queryOptions } from "@tanstack/react-query";
import { ArrowRight, CaretRight } from "@phosphor-icons/react";

import { ListingCard } from "@/components/classifieds/ListingCard";
import { getPlacePage, type PlacePageData } from "@/lib/place-pages.functions";

export const placePageQuery = (place: string, category?: string) =>
  queryOptions({
    queryKey: ["place-page", place, category ?? null],
    queryFn: () => getPlacePage({ data: { place, ...(category ? { category } : {}) } }),
  });

export function placePageHead(data: PlacePageData | null | undefined) {
  if (!data) return { meta: [{ name: "robots", content: "noindex" }] };
  return {
    meta: [
      { title: data.title },
      { name: "description", content: data.description },
      // Below the inventory gate the page still works for visitors but stays
      // out of the index, so thin pages never count against the site.
      ...(data.indexable ? [] : [{ name: "robots", content: "noindex, follow" }]),
      { property: "og:title", content: data.title },
      { property: "og:description", content: data.description },
      { property: "og:type", content: "website" },
    ],
  };
}

function browseHref(search: Record<string, string | number>) {
  const params = new URLSearchParams(
    Object.entries(search).map(([key, value]) => [key, String(value)]),
  );
  return `/browse?${params.toString()}`;
}

function LinkChips({ heading, links }: { heading: string; links: PlacePageData["relatedPlaces"] }) {
  if (!links.length) return null;
  return (
    <section className="border-t border-border/70 pt-8">
      <h2 className="text-[20px] font-bold tracking-tight">{heading}</h2>
      <ul className="mt-4 flex flex-wrap gap-2">
        {links.map((link) => (
          <li key={link.path}>
            <a
              href={link.path}
              className="inline-flex min-h-11 items-center gap-2 rounded-full border border-input bg-card px-4 text-[13px] font-medium hover:border-primary"
            >
              {link.label}
              <span className="numeric text-muted-foreground">{link.count}</span>
            </a>
          </li>
        ))}
      </ul>
    </section>
  );
}

/** Landing page for a city, region, category, or city/region + category. */
export function PlacePage({ data }: { data: PlacePageData }) {
  const seeAll = browseHref(data.browseSearch);
  return (
    <main className="mx-auto max-w-[1360px] space-y-10 px-4 py-6 sm:px-7 sm:py-8 lg:px-10">
      <div>
        <nav
          aria-label="Breadcrumb"
          className="flex flex-wrap items-center gap-1.5 text-[12.5px] text-muted-foreground"
        >
          {data.breadcrumbs.map((crumb, index) => (
            <span key={crumb.path} className="flex items-center gap-1.5">
              {index > 0 ? <CaretRight size={13} aria-hidden="true" /> : null}
              {index === data.breadcrumbs.length - 1 ? (
                <span className="text-foreground">{crumb.label}</span>
              ) : (
                <a href={crumb.path} className="hover:text-foreground">
                  {crumb.label}
                </a>
              )}
            </span>
          ))}
        </nav>
        <h1 className="mt-4 text-[28px] font-bold leading-tight tracking-tight sm:text-[36px]">
          {data.heading}
        </h1>
        <p className="mt-2 max-w-[70ch] text-[15px] leading-relaxed text-muted-foreground">
          {data.lead}
        </p>
        <a
          href={seeAll}
          className="mt-3 inline-flex min-h-11 items-center gap-1 text-[13.5px] font-semibold text-primary hover:underline"
        >
          Search and filter these listings <ArrowRight size={13} />
        </a>
      </div>

      {data.listings.length > 0 ? (
        <section aria-label="Listings">
          <ul className="grid grid-cols-2 gap-x-4 gap-y-9 md:grid-cols-3 xl:grid-cols-4">
            {data.listings.map((listing) => (
              <li key={listing.id}>
                <ListingCard listing={listing} />
              </li>
            ))}
          </ul>
          {data.total > data.listings.length ? (
            <div className="mt-8 flex justify-center">
              <a
                href={seeAll}
                className="inline-flex h-11 items-center rounded-full border border-input bg-card px-6 text-[13.5px] font-semibold shadow-sm"
              >
                See all {data.total.toLocaleString()} listings
              </a>
            </div>
          ) : null}
        </section>
      ) : null}

      <LinkChips heading="Browse by category" links={data.relatedCategories} />
      <LinkChips heading={data.relatedPlacesHeading} links={data.relatedPlaces} />
    </main>
  );
}
