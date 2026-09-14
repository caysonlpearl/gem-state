import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import { queryOptions, useSuspenseQuery } from "@tanstack/react-query";
import { useState } from "react";
import {
  FileText,
  Flag,
  GasPump,
  Gauge,
  GearSix,
  Handbag,
  Images,
  Info,
  MapPin,
  Palette,
  Truck,
} from "@phosphor-icons/react";

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
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { CategoryIcon } from "@/components/classifieds/CategoryIcon";

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
  const specIcons = {
    Mileage: Gauge,
    Transmission: GearSix,
    Drivetrain: GearSix,
    Fuel: GasPump,
    Exterior: Palette,
    Title: FileText,
    VIN: FileText,
    Condition: Info,
    Category: Info,
    Fulfillment: Truck,
  } as const;
  return (
    <dl className="grid grid-cols-2 gap-2 sm:grid-cols-3">
      {rows.map(([label, value]) => (
        <div key={label} className="rounded-2xl bg-secondary/70 px-3.5 py-3.5">
          <dt className="flex items-center gap-1.5 text-[10px] uppercase tracking-[0.08em] text-muted-foreground">
            {(() => {
              const Icon = specIcons[label as keyof typeof specIcons] ?? Info;
              return <Icon size={14} weight="duotone" className="text-primary" />;
            })()}
            {label}
          </dt>
          <dd className="mt-1.5 text-[13px] font-semibold">{value}</dd>
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

  return (
    <main className="mx-auto max-w-[1280px] px-4 py-8 sm:px-8">
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

      <div className="mt-6 grid gap-10 lg:grid-cols-[minmax(0,1.55fr)_minmax(0,1fr)]">
        <div className="min-w-0">
          {listing.images.length > 0 ? (
            <Dialog>
              <div className="relative grid grid-cols-2 grid-rows-2 gap-2 overflow-hidden rounded-[28px] bg-secondary">
                {listing.images.slice(0, 5).map((image, index) => (
                  <button
                    key={image.url}
                    type="button"
                    onClick={() => setActiveImage(index)}
                    className={`group relative min-h-[170px] overflow-hidden bg-secondary sm:min-h-[220px] ${
                      index === 0 ? "row-span-2" : ""
                    }`}
                    aria-label={`Show photo ${index + 1}`}
                  >
                    <img
                      src={image.url}
                      alt={image.alt}
                      className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-[1.03]"
                    />
                  </button>
                ))}
                {listing.images.length > 1 && (
                  <DialogTrigger asChild>
                    <button
                      type="button"
                      className="absolute bottom-4 right-4 inline-flex h-10 items-center gap-2 rounded-full bg-card/95 px-4 text-[12px] font-semibold text-foreground shadow-md backdrop-blur transition-transform hover:scale-[1.02]"
                    >
                      <Images size={16} />
                      Show all photos
                    </button>
                  </DialogTrigger>
                )}
              </div>
              <DialogContent className="max-h-[90vh] max-w-5xl overflow-y-auto rounded-[28px] p-5 sm:p-7">
                <DialogHeader>
                  <DialogTitle>Photos</DialogTitle>
                  <DialogDescription>{listing.title}</DialogDescription>
                </DialogHeader>
                <div className="grid gap-3 sm:grid-cols-2">
                  {listing.images.map((image) => (
                    <img
                      key={image.url}
                      src={image.url}
                      alt={image.alt}
                      className="w-full rounded-2xl object-cover"
                    />
                  ))}
                </div>
              </DialogContent>
            </Dialog>
          ) : (
            <div className="flex h-[320px] flex-col items-center justify-center rounded-[28px] bg-gradient-to-br from-secondary via-card to-accent/25 text-[12px] text-muted-foreground">
              <span className="grid h-16 w-16 place-items-center rounded-2xl bg-card/80 text-primary shadow-sm">
                <CategoryIcon slug={listing.categorySlug ?? "general"} size={32} weight="duotone" />
              </span>
              <span className="mt-3">This seller has not added photos yet.</span>
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
                  className={`h-16 w-24 shrink-0 overflow-hidden rounded-2xl border ${
                    index === activeImage ? "border-primary" : "border-border"
                  }`}
                >
                  <img src={image.url} alt="" className="h-full w-full object-cover" />
                </button>
              ))}
            </div>
          )}

          <h1 className="mt-8 text-[28px] font-bold leading-tight tracking-tight sm:text-[34px]">
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

          <section className="mt-9">
            <h2 className="text-[18px] font-bold tracking-tight">
              {vehicle ? "Vehicle details" : "Item details"}
            </h2>
            <div className="mt-3">
              <SpecGrid rows={specRows} />
            </div>
          </section>

          {listing.description && (
            <section className="mt-9">
              <h2 className="text-[18px] font-bold tracking-tight">Seller description</h2>
              <p className="mt-2 whitespace-pre-line text-[13.5px] leading-relaxed text-muted-foreground">
                {listing.description}
              </p>
            </section>
          )}

          {listing.sellerNote && (
            <section className="mt-6 rounded-2xl bg-secondary/70 px-5 py-4">
              <h2 className="text-[11px] uppercase tracking-[0.08em] text-muted-foreground">
                Note from the seller
              </h2>
              <p className="mt-1 text-[13px] leading-relaxed">{listing.sellerNote}</p>
            </section>
          )}

          {listing.seller && (
            <section className="soft-card mt-7 p-5">
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

        <aside className="min-w-0 space-y-5 lg:sticky lg:top-28 lg:self-start">
          <ListingActions listing={listing} />

              <div className="soft-card px-5 py-5">
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
        <section className="mt-16">
          <h2 className="text-[24px] font-bold tracking-tight">
            More in {listing.categoryName}
          </h2>
          <div className="mt-5 grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-4">
            {relatedQuery.data.listings.map((related) => (
              <ListingCard key={related.id} listing={related} />
            ))}
          </div>
        </section>
      )}
    </main>
  );
}
