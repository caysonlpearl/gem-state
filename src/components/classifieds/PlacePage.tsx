import { ArrowRight, CaretRight, ShieldCheck } from "@phosphor-icons/react";

import { CategoryArtwork } from "@/components/classifieds/CategoryIcon";
import { ListingCard } from "@/components/classifieds/ListingCard";
import { BluebirdEmptyState } from "@/components/layout/BluebirdEmptyState";
import { guidesForCategory } from "@/content/guides";
import type { PlacePageData } from "@/lib/place-pages.functions";

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
              <span className="numeric text-muted-foreground">{link.count} reviewed</span>
            </a>
          </li>
        ))}
      </ul>
    </section>
  );
}

function GuideLinks({ categorySlug }: { categorySlug: string }) {
  const related = guidesForCategory(categorySlug).slice(0, 3);
  if (!related.length) return null;
  return (
    <section className="border-t border-border/70 pt-8">
      <h2 className="text-[20px] font-bold tracking-tight">Buying or selling? Read first</h2>
      <ul className="mt-4 space-y-2">
        {related.map((guide) => (
          <li key={guide.slug}>
            <a
              href={`/guides/${guide.slug}`}
              className="inline-flex min-h-11 items-center gap-1 text-[14px] font-semibold text-primary hover:underline"
            >
              {guide.title} <ArrowRight size={13} />
            </a>
          </li>
        ))}
      </ul>
    </section>
  );
}

function Stats({ stats }: { stats: PlacePageData["stats"] }) {
  if (!stats.length) return null;
  return (
    <dl className="mt-5 grid max-w-[880px] grid-cols-2 gap-3 sm:grid-cols-4">
      {stats.map((stat) => (
        <div key={stat.label} className="rounded-xl border border-border bg-card px-4 py-3">
          <dt className="text-[11.5px] text-muted-foreground">{stat.label}</dt>
          <dd className="numeric mt-1 text-[17px] font-bold">{stat.value}</dd>
        </div>
      ))}
    </dl>
  );
}

function PriceTables({ tables }: { tables: PlacePageData["priceTables"] }) {
  if (!tables.length) return null;
  return (
    <section className="border-t border-border/70 pt-8">
      <h2 className="text-[20px] font-bold tracking-tight">Asking prices</h2>
      <div className="mt-4 grid gap-6 lg:grid-cols-2">
        {tables.map((table) => (
          <div key={table.heading}>
            <h3 className="text-[14px] font-semibold">{table.heading}</h3>
            <table className="mt-2 w-full text-left text-[13.5px]">
              <thead className="text-[11.5px] uppercase tracking-[0.06em] text-muted-foreground">
                <tr>
                  <th className="py-2 font-semibold">
                    {table.heading.includes("year") ? "Model year" : "Mileage"}
                  </th>
                  <th className="py-2 text-right font-semibold">Listings</th>
                  <th className="py-2 text-right font-semibold">Median</th>
                </tr>
              </thead>
              <tbody>
                {table.rows.map((row) => (
                  <tr key={row.label} className="border-t border-border">
                    <td className="py-2">{row.label}</td>
                    <td className="numeric py-2 text-right">{row.count}</td>
                    <td className="numeric py-2 text-right font-semibold">{row.median}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ))}
      </div>
      <p className="mt-3 text-[12px] text-muted-foreground">
        From the asking prices of reviewed Bluebird listings, not a complete market census; final prices are agreed between buyer and
        seller.
      </p>
    </section>
  );
}

function RegionGroups({ groups }: { groups: PlacePageData["regionGroups"] }) {
  return (
    <div className="space-y-10">
      {groups.map((group, groupIndex) => (
        <section key={group.region} aria-labelledby={`region-${group.path}`}>
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h2 id={`region-${group.path}`} className="text-[20px] font-bold tracking-tight">
              <a href={group.path} className="hover:text-primary">
                {group.region}
              </a>
            </h2>
            <p className="text-[13px] text-muted-foreground">
              {group.count} {group.count === 1 ? "reviewed listing" : "reviewed listings"}
              {group.median ? ` · median ${group.median}` : ""}
            </p>
          </div>
          <ul className="mt-4 grid grid-cols-2 gap-x-4 gap-y-9 md:grid-cols-3 xl:grid-cols-4">
            {group.listings.map((listing, index) => (
              <li key={listing.id}>
                <ListingCard listing={listing} priority={groupIndex === 0 && index === 0} />
              </li>
            ))}
          </ul>
          {group.count > group.listings.length ? (
            <a
              href={group.path}
              className="mt-4 inline-flex min-h-11 items-center gap-1 text-[13.5px] font-semibold text-primary hover:underline"
            >
              Browse listings in {group.region} <ArrowRight size={13} />
            </a>
          ) : null}
        </section>
      ))}
    </div>
  );
}

function RecentlySold({ listings }: { listings: PlacePageData["recentlySold"] }) {
  if (!listings.length) return null;
  return (
    <section className="border-t border-border/70 pt-8">
      <h2 className="text-[20px] font-bold tracking-tight">Recently sold</h2>
      <p className="mt-1 text-[13px] text-muted-foreground">
        Examples marked sold by their sellers in the last 60 days, with the last asking price. Not a total sales count.
      </p>
      <ul className="mt-4 grid grid-cols-2 gap-x-4 gap-y-9 md:grid-cols-3 xl:grid-cols-4">
        {listings.map((listing) => (
          <li key={listing.id}>
            <ListingCard listing={listing} soldAt={listing.soldAt} />
          </li>
        ))}
      </ul>
    </section>
  );
}

function Faq({ faq }: { faq: PlacePageData["faq"] }) {
  if (!faq.length) return null;
  return (
    <section className="border-t border-border/70 pt-8">
      <h2 className="text-[20px] font-bold tracking-tight">Questions</h2>
      <div className="mt-4 max-w-[75ch] space-y-5">
        {faq.map((entry) => (
          <div key={entry.question}>
            <h3 className="text-[15px] font-semibold">{entry.question}</h3>
            <p className="mt-1 text-[14px] leading-relaxed text-muted-foreground">{entry.answer}</p>
          </div>
        ))}
      </div>
    </section>
  );
}

/** Landing page for a city, region, category, or city/region + category. */
export function PlacePage({ data }: { data: PlacePageData }) {
  const seeAll = browseHref(data.browseSearch);
  const categorySlug = String(data.browseSearch["category"] ?? "");
  const isFirearmsPage = categorySlug === "firearms";
  const isBoiseHub = data.browseSearch["city"] === "Boise" && !categorySlug;
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
        <div className={isFirearmsPage ? "mt-4 flex items-center gap-4" : "mt-4"}>
          {isFirearmsPage ? (
            <span className="flex size-[76px] shrink-0 items-center justify-center rounded-2xl border border-border/70 bg-card shadow-sm sm:size-[88px]">
              <CategoryArtwork slug="firearms" size={78} />
            </span>
          ) : null}
          <div>
            <h1 className="text-[28px] font-bold leading-tight tracking-tight sm:text-[36px]">
              {data.heading}
            </h1>
            <p className="mt-2 max-w-[70ch] text-[15px] leading-relaxed text-muted-foreground">
              {data.lead}
            </p>
          </div>
        </div>
        <a
          href={seeAll}
          className="mt-3 inline-flex min-h-11 items-center gap-1 text-[13.5px] font-semibold text-primary hover:underline"
        >
          Search and filter these listings <ArrowRight size={13} />
        </a>
        <Stats stats={data.stats} />
        <p className="mt-3 max-w-[85ch] text-[12px] text-muted-foreground">{data.statisticsNote}</p>
      </div>

      {isFirearmsPage ? (
        <div className="-mt-5 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-brand-blue/20 bg-brand-blue/5 px-4 py-3 sm:px-5">
          <div className="flex min-w-0 items-start gap-3">
            <ShieldCheck
              size={19}
              weight="fill"
              className="mt-0.5 shrink-0 text-primary"
              aria-hidden="true"
            />
            <p className="text-[12px] leading-relaxed text-muted-foreground sm:text-[13px]">
              Review Bluebird’s guidance for safe, lawful firearm listings and transactions.
            </p>
          </div>
          <a
            href="/firearms-safety"
            className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-full border border-primary/40 bg-card px-3.5 text-[12px] font-semibold text-primary transition-colors hover:bg-primary hover:text-primary-foreground"
          >
            Firearm safety statement <ArrowRight size={14} weight="bold" aria-hidden="true" />
          </a>
        </div>
      ) : null}

      {data.listings.length === 0 ? (
        <BluebirdEmptyState
          headingLevel="h2"
          title="Nothing listed here yet"
          description="New listings show up on this page as soon as they're posted. Try nearby cities or other categories below."
        />
      ) : data.regionGroups.length > 0 ? (
        <RegionGroups groups={data.regionGroups} />
      ) : (
        <section aria-label="Listings">
          <ul className="grid grid-cols-2 gap-x-4 gap-y-9 md:grid-cols-3 xl:grid-cols-4">
            {data.listings.map((listing, index) => (
              <li key={listing.id}>
                <ListingCard listing={listing} priority={index === 0} />
              </li>
            ))}
          </ul>
          {data.total > data.listings.length ? (
            <div className="mt-8 flex justify-center">
              <a
                href={seeAll}
                className="inline-flex h-11 items-center rounded-full border border-input bg-card px-6 text-[13.5px] font-semibold shadow-sm"
              >
                Browse matching listings
              </a>
            </div>
          ) : null}
        </section>
      )}

      <PriceTables tables={data.priceTables} />
      {data.advice?.length ? (
        <section className="border-t border-border/70 pt-8">
          <h2 className="text-[20px] font-bold">Before you contact a listing</h2>
          <div className="mt-4 grid gap-6 md:grid-cols-2">
            {data.advice.map((section) => (
              <div key={section.heading}>
                <h3 className="text-[15px] font-semibold">{section.heading}</h3>
                <p className="mt-2 max-w-[70ch] text-[14px] leading-relaxed text-muted-foreground">
                  {section.text}
                </p>
              </div>
            ))}
          </div>
          <div className="mt-5 flex flex-wrap gap-3 text-[13.5px] font-semibold">
            <a
              href={seeAll}
              className="inline-flex min-h-11 items-center rounded-full bg-primary px-5 text-primary-foreground"
            >
              Browse matching listings
            </a>
            <a
              href="/create-listing"
              className="inline-flex min-h-11 items-center rounded-full border border-input px-5"
            >
              Post a listing
            </a>
          </div>
        </section>
      ) : null}
      {isBoiseHub ? (
        <section className="border-t border-border/70 pt-8">
          <h2 className="text-[20px] font-bold">Buying and selling in Boise</h2>
          <p className="mt-2 max-w-[70ch] text-[14px] leading-relaxed text-muted-foreground">
            Compare the listing details and asking price before contacting a seller. For a vehicle,
            check the title, VIN and condition before paying. Plan a public meeting and keep payment
            details and verification codes private.
          </p>
          <ul className="mt-4 space-y-2 text-[14px] font-semibold text-primary">
            {[
              { path: "/guides/how-to-buy-a-used-car-in-idaho", label: "Buying a used car: title checks and paperwork" },
              { path: "/guides/new-to-idaho-title-and-register-your-vehicle", label: "New to Idaho: vehicle title and registration checklist" },
              { path: "/guides/marketplace-scams-to-watch-for", label: "Marketplace scams and warning signs" },
            ].map((link) => (
              <li key={link.path}>
                <a href={link.path} className="inline-flex min-h-11 items-center gap-1 hover:underline">
                  {link.label} <ArrowRight size={13} aria-hidden="true" />
                </a>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
      <RecentlySold listings={data.recentlySold} />
      {data.extraLinks.map((row) => (
        <LinkChips key={row.heading} heading={row.heading} links={row.links} />
      ))}
      <LinkChips heading="Browse by category" links={data.relatedCategories} />
      <LinkChips heading={data.relatedPlacesHeading} links={data.relatedPlaces} />
      <Faq faq={data.faq} />
      <GuideLinks categorySlug={String(data.browseSearch["category"] ?? "")} />
    </main>
  );
}
