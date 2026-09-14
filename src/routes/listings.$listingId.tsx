import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import { queryOptions, useSuspenseQuery } from "@tanstack/react-query";
import { useState } from "react";
import { MapPin, Truck, Handbag, Flag } from "@phosphor-icons/react";

import { brand } from "@/config/brand";
import { formatUsd } from "@/config/fees";
import { ListingActions } from "@/components/classifieds/ListingActions";
import { ListingCard } from "@/components/classifieds/ListingCard";
import {
  conditionLabels,
  formatMileage,
  fulfillmentLabels,
  postedAge,
  vehicleHeadline,
} from "@/lib/classifieds-display";
import { getClassifiedListing, getRelatedClassifieds } from "@/lib/classifieds.functions";

const listingQuery = (id: string) =>
  queryOptions({
    queryKey: ["classified-listing", id],
    queryFn: () => getClassifiedListing({ data: { id } }),
  });

export const Route = createFileRoute("/listings/$listingId")({
  loader: async ({ context, params }) => {
    const listing = await context.queryClient.ensureQueryData(listingQuery(params.listingId));
    if (!listing) throw notFound();
    return {
      title: listing.title,
      price: listing.priceCents,
      city: listing.city,
      state: listing.state,
    };
  },
  head: ({ loaderData }) => {
    if (!loaderData) {
      return {
        meta: [
          { title: `Listing unavailable — ${brand.name}` },
          { name: "robots", content: "noindex" },
        ],
      };
    }
    const title = `${loaderData.title} — ${formatUsd(loaderData.price)} in ${loaderData.city}, ${loaderData.state}`;
    const description = `${loaderData.title} listed for ${formatUsd(loaderData.price)} by a seller in ${loaderData.city}, ${loaderData.state} on ${brand.name}.`;
    return {
      meta: [
        { title },
        { name: "description", content: description },
        { property: "og:title", content: title },
        { property: "og:description", content: description },
        { property: "og:type", content: "website" },
        { name: "twitter:card", content: "summary_large_image" },
      ],
    };
  },
  component: ListingDetail,
  notFoundComponent: ListingMissing,
});

function ListingMissing() {
  return (
    <main className="mx-auto max-w-[720px] px-4 py-16 text-center sm:px-6">
      <h1 className="text-[21px] font-semibold tracking-tight">This listing is no longer live</h1>
      <p className="mx-auto mt-2 max-w-[46ch] text-[13px] leading-relaxed text-muted-foreground">
        It may have sold, expired, or been removed by the seller.
      </p>
      <Link
        to="/browse"
        search={{}}
        className="mt-5 inline-flex h-10 items-center rounded-md bg-primary px-4 text-[13px] font-semibold text-primary-foreground"
      >
        Browse all listings
      </Link>
    </main>
  );
}

function SpecGrid({ rows }: { rows: [string, string][] }) {
  if (rows.length === 0) return null;
  return (
    <dl className="grid grid-cols-2 gap-px overflow-hidden rounded-md border border-border bg-border sm:grid-cols-3">
      {rows.map(([label, value]) => (
        <div key={label} className="bg-card px-3 py-3">
          <dt className="text-[10px] uppercase tracking-[0.08em] text-muted-foreground">{label}</dt>
          <dd className="mt-1 text-[13px] font-semibold">{value}</dd>
        </div>
      ))}
    </dl>
  );
}

function ListingDetail() {
  const { listingId } = Route.useParams();
  const { data: listing } = useSuspenseQuery(listingQuery(listingId));
  const [activeImage, setActiveImage] = useState(0);

  const relatedQuery = useSuspenseQuery(
    queryOptions({
      queryKey: ["classified-related", listingId, listing?.categorySlug],
      queryFn: () =>
        getRelatedClassifieds({
          data: {
            ...(listing?.categorySlug ? { category: listing.categorySlug } : {}),
            excludeId: listingId,
          },
        }),
    }),
  );

  if (!listing) return <ListingMissing />;

  const vehicle = listing.vehicle;
  const specRows: [string, string][] = vehicle
    ? ([
        ["Mileage", formatMileage(vehicle.mileage)],
        ["Body style", vehicle.bodyStyle],
        ["Transmission", vehicle.transmission],
        ["Drivetrain", vehicle.drivetrain],
        ["Fuel", vehicle.fuelType],
        ["Exterior", vehicle.exteriorColor],
        ["Title", vehicle.titleStatus],
        ["VIN", vehicle.vin],
        ["Condition", conditionLabels[listing.condition] ?? listing.condition],
      ].filter(([, value]) => Boolean(value)) as [string, string][])
    : ([
        ["Condition", conditionLabels[listing.condition] ?? listing.condition],
        ["Category", listing.categoryName],
        ["Fulfillment", fulfillmentLabels[listing.fulfillmentMode]],
      ].filter(([, value]) => Boolean(value)) as [string, string][]);

  const photo = listing.images[activeImage] ?? listing.images[0];

  return (
    <main className="mx-auto max-w-[1200px] px-4 py-6 sm:px-6">
      <nav className="text-[12px] text-muted-foreground">
        <Link to="/browse" search={{}} className="hover:text-foreground">
          All listings
        </Link>
        {listing.categorySlug && (
          <>
            <span className="px-1.5">/</span>
            <Link
              to="/browse"
              search={{ category: listing.categorySlug }}
              className="hover:text-foreground"
            >
              {listing.categoryName}
            </Link>
          </>
        )}
      </nav>

      <div className="mt-4 grid gap-8 lg:grid-cols-[minmax(0,1.55fr)_minmax(0,1fr)]">
        <div className="min-w-0">
          {photo ? (
            <div className="overflow-hidden rounded-md border border-border bg-secondary">
              <img src={photo.url} alt={photo.alt} className="max-h-[520px] w-full object-cover" />
            </div>
          ) : (
            <div className="flex h-[280px] items-center justify-center rounded-md border border-border bg-secondary text-[12px] text-muted-foreground">
              This seller has not added photos yet.
            </div>
          )}
          {listing.images.length > 1 && (
            <div className="no-scrollbar mt-2 flex gap-2 overflow-x-auto pb-1">
              {listing.images.map((image, index) => (
                <button
                  key={image.url}
                  type="button"
                  onClick={() => setActiveImage(index)}
                  aria-label={`Show photo ${index + 1}`}
                  className={`h-16 w-24 shrink-0 overflow-hidden rounded border ${
                    index === activeImage ? "border-primary" : "border-border"
                  }`}
                >
                  <img src={image.url} alt="" className="h-full w-full object-cover" />
                </button>
              ))}
            </div>
          )}

          <h1 className="mt-6 text-[24px] font-bold leading-tight tracking-tight sm:text-[28px]">
            {listing.title}
          </h1>
          {vehicle && (
            <p className="mt-1 text-[13px] text-muted-foreground">{vehicleHeadline(vehicle)}</p>
          )}
          <p className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[12.5px] text-muted-foreground">
            <span className="flex items-center gap-1">
              <MapPin size={13} weight="fill" className="text-primary" />
              {listing.city}, {listing.state} ({listing.region})
            </span>
            <span>Posted {postedAge(listing.createdAt).toLowerCase()}</span>
          </p>

          <section className="mt-6">
            <h2 className="text-[15px] font-semibold">
              {vehicle ? "Vehicle details" : "Item details"}
            </h2>
            <div className="mt-3">
              <SpecGrid rows={specRows} />
            </div>
          </section>

          {listing.description && (
            <section className="mt-6">
              <h2 className="text-[15px] font-semibold">Seller description</h2>
              <p className="mt-2 whitespace-pre-line text-[13.5px] leading-relaxed text-muted-foreground">
                {listing.description}
              </p>
            </section>
          )}

          {listing.sellerNote && (
            <section className="mt-5 rounded-md border border-border bg-secondary/50 px-4 py-3">
              <h2 className="text-[11px] uppercase tracking-[0.08em] text-muted-foreground">
                Note from the seller
              </h2>
              <p className="mt-1 text-[13px] leading-relaxed">{listing.sellerNote}</p>
            </section>
          )}

          {listing.seller && (
            <section className="mt-6 rounded-md border border-border bg-card p-4">
              <div className="flex items-center gap-3">
                <div className="grid h-10 w-10 shrink-0 place-items-center overflow-hidden rounded-full bg-primary text-sm font-semibold text-primary-foreground">
                  {listing.seller.avatarUrl ? (
                    <img src={listing.seller.avatarUrl} alt="" className="h-full w-full object-cover" />
                  ) : (
                    listing.seller.displayName.slice(0, 1).toUpperCase()
                  )}
                </div>
                <div className="min-w-0">
                  <h2 className="text-[14px] font-semibold">About the seller</h2>
                  <Link
                    to="/sellers/$slug"
                    params={{ slug: listing.seller.slug }}
                    className="text-[12.5px] text-primary hover:underline"
                  >
                    {listing.seller.displayName}
                  </Link>
                  {listing.seller.ratingAverage != null && (
                    <p className="text-[11.5px] text-muted-foreground">
                      {listing.seller.ratingAverage.toFixed(1)} / 5 · {listing.seller.reviewCount} review
                      {listing.seller.reviewCount === 1 ? "" : "s"}
                    </p>
                  )}
                </div>
              </div>
              {listing.seller.bio && (
                <p className="mt-3 text-[12.5px] leading-relaxed text-muted-foreground">
                  {listing.seller.bio}
                </p>
              )}
            </section>
          )}
        </div>

        <aside className="min-w-0 space-y-4 lg:sticky lg:top-24 lg:self-start">
          <ListingActions listing={listing} />

          <div className="rounded-md border border-border bg-card px-4 py-4">
            <h2 className="text-[13px] font-semibold">How you get it</h2>
            <ul className="mt-2 space-y-2 text-[12.5px] text-muted-foreground">
              {listing.fulfillmentMode !== "shipping" && (
                <li className="flex items-start gap-2">
                  <Handbag size={15} className="mt-0.5 shrink-0 text-primary" />
                  Local pickup in {listing.city}, {listing.state}, arranged with the seller after
                  purchase.
                </li>
              )}
              {listing.fulfillmentMode !== "local_pickup" && (
                <li className="flex items-start gap-2">
                  <Truck size={15} className="mt-0.5 shrink-0 text-primary" />
                  Shipping available. Rates are calculated at checkout from the seller&apos;s
                  address.
                </li>
              )}
            </ul>
            <p className="mt-3 text-[11px] leading-relaxed text-muted-foreground">
              {brand.legal.disclaimer}
            </p>
          </div>

          <Link
            to="/contact"
            className="flex items-center justify-center gap-1.5 text-[12px] text-muted-foreground hover:text-foreground"
          >
            <Flag size={13} /> Report this listing
          </Link>
        </aside>
      </div>

      {relatedQuery.data.listings.length > 0 && (
        <section className="mt-12">
          <h2 className="text-[18px] font-semibold tracking-tight">
            More in {listing.categoryName}
          </h2>
          <div className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-4">
            {relatedQuery.data.listings.map((related) => (
              <ListingCard key={related.id} listing={related} />
            ))}
          </div>
        </section>
      )}
    </main>
  );
}
