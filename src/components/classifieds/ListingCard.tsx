import type { ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import { MapPin } from "@phosphor-icons/react";
import { listingParam } from "@/lib/listing-url";

import { CategoryArtwork } from "@/components/classifieds/CategoryIcon";
import { WatchHeartButton } from "@/components/community/WatchHeartButton";
import {
  conditionLabels,
  formatClassifiedPrice,
  formatFulfillmentLabel,
  formatJobPay,
  formatMileage,
  petPlacementLabels,
  postedAge,
} from "@/lib/classifieds-display";
import type { ClassifiedCard } from "@/lib/classifieds.functions";

function ListingLink({
  listing,
  className,
  children,
}: {
  listing: ClassifiedCard;
  className: string;
  children: ReactNode;
}) {
  // Partner jobs open their Bluebird page first; the visitor leaves for
  // Adzuna only from that page's Apply button.
  return listing.externalJob ? (
    <Link
      to="/jobs/adzuna/$jobId"
      params={{ jobId: listing.id.replace(/^adzuna:/, "") }}
      className={className}
    >
      {children}
    </Link>
  ) : (
    <Link
      to="/listings/$listingId"
      params={{ listingId: listingParam(listing) }}
      className={className}
    >
      {children}
    </Link>
  );
}
function Attribution({ listing }: { listing: ClassifiedCard }) {
  return listing.externalJob ? (
    <div className="px-3.5 pb-3 text-[10px] text-muted-foreground">
      Jobs by{" "}
      <a
        href="https://www.adzuna.com"
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex min-h-[23px] min-w-[116px] items-center text-[23px] font-bold leading-none text-primary"
      >
        Adzuna
      </a>
    </div>
  ) : null;
}

const TILE_COLORS = [
  "bg-primary/10 text-primary",
  "bg-accent/30 text-accent-foreground",
  "bg-brand-warm/15 text-foreground",
  "bg-secondary text-foreground",
];

function initialsOf(name: string) {
  const words = name
    .replace(/[^A-Za-z0-9& ]+/g, " ")
    .split(/\s+/)
    .filter((word) => word && !/^(the|of|and|inc|llc|co|corp|ltd)$/i.test(word));
  return (
    words.length > 1 ? words[0]![0]! + words[1]![0]! : (words[0] ?? "?").slice(0, 2)
  ).toUpperCase();
}

/**
 * An employer's logo when the listing has one (a Bluebird employer's own
 * photo), otherwise their initials on a soft colored tile. Partner feeds
 * like Adzuna don't include logos.
 */
export function EmployerTile({
  name,
  imageUrl,
  size = "md",
}: {
  name: string;
  imageUrl?: string | null;
  size?: "md" | "lg";
}) {
  const box =
    size === "lg" ? "h-16 w-16 rounded-2xl text-[20px]" : "h-12 w-12 rounded-xl text-[15px]";
  if (imageUrl) {
    return (
      <span className={`${box} shrink-0 overflow-hidden border border-border bg-card`}>
        <img src={imageUrl} alt="" loading="lazy" className="h-full w-full object-contain" />
      </span>
    );
  }
  const color =
    TILE_COLORS[[...name].reduce((sum, ch) => sum + ch.charCodeAt(0), 0) % TILE_COLORS.length];
  return (
    <span
      aria-hidden="true"
      className={`${box} ${color} grid shrink-0 place-items-center font-display font-bold tracking-tight`}
    >
      {initialsOf(name)}
    </span>
  );
}

function FeaturedBadge() {
  return (
    <span className="inline-flex rounded-full bg-accent px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.08em] text-accent-foreground shadow-sm">
      Featured
    </span>
  );
}

function Photo({
  listing,
  tall,
  priority,
}: {
  listing: ClassifiedCard;
  tall?: boolean;
  priority?: boolean;
}) {
  const ratio = tall ? "aspect-[4/3]" : "aspect-[4/3]";
  if (!listing.imageUrl) {
    return (
      <div
        className={`relative flex ${ratio} items-center justify-center overflow-hidden bg-gradient-to-br from-secondary via-card to-accent/25 text-muted-foreground`}
      >
        <span className="absolute -right-6 -top-8 h-28 w-28 rounded-full bg-primary/5" />
        <span className="absolute -bottom-10 -left-5 h-28 w-28 rounded-full bg-brand-warm/10" />
        {listing.isFeatured ? (
          <span className="absolute left-2 top-2 z-10">
            <FeaturedBadge />
          </span>
        ) : null}
        <span className="relative grid h-14 w-14 place-items-center rounded-2xl bg-card/75 text-primary shadow-sm backdrop-blur">
          <CategoryArtwork slug={listing.categorySlug ?? "general"} size={84} />
        </span>
      </div>
    );
  }
  return (
    <div className={`relative ${ratio} overflow-hidden bg-secondary`}>
      <img
        src={listing.imageUrl}
        alt={listing.title}
        // The first cards on a landing page are its largest paint; load them
        // right away instead of waiting for layout to decide they're visible.
        loading={priority ? "eager" : "lazy"}
        fetchPriority={priority ? "high" : undefined}
        className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.03]"
      />
      {listing.isFeatured ? (
        <span className="absolute left-2 top-2 z-10">
          <FeaturedBadge />
        </span>
      ) : null}
    </div>
  );
}

function Facts({ listing }: { listing: ClassifiedCard }) {
  if (listing.job) {
    return (
      <p className="mt-1 truncate text-[11.5px] text-muted-foreground">
        {[
          listing.job.employerName,
          listing.job.employmentType === "Not specified" ? null : listing.job.employmentType,
        ]
          .filter(Boolean)
          .join(" · ")}
      </p>
    );
  }
  if (listing.service) {
    return (
      <p className="mt-1 truncate text-[11.5px] text-muted-foreground">
        {listing.service.subcategory}
      </p>
    );
  }
  if (listing.pet) {
    return (
      <p className="mt-1 truncate text-[11.5px] text-muted-foreground">
        {[listing.pet.species, listing.pet.breed, petPlacementLabels[listing.pet.placementType]]
          .filter(Boolean)
          .join(" · ")}
      </p>
    );
  }
  if (listing.home) {
    const modeLabel =
      listing.home.mode === "rent"
        ? "For rent"
        : listing.home.mode === "build"
          ? "New construction"
          : "For sale";
    return (
      <p className="mt-1 truncate text-[11.5px] text-muted-foreground">
        {[
          modeLabel,
          listing.home.propertyType,
          listing.home.bedrooms ? `${listing.home.bedrooms} bd` : null,
          listing.home.bathrooms ? `${listing.home.bathrooms} ba` : null,
        ]
          .filter(Boolean)
          .join(" · ")}
      </p>
    );
  }
  const mileage = listing.vehicle ? formatMileage(listing.vehicle.mileage) : null;
  const bits = [
    mileage,
    listing.vehicle?.transmission ?? null,
    listing.vehicle?.drivetrain ?? null,
    listing.vehicle ? null : (conditionLabels[listing.condition] ?? null),
  ].filter(Boolean) as string[];
  if (bits.length === 0) return null;
  return <p className="mt-1 truncate text-[11.5px] text-muted-foreground">{bits.join(" · ")}</p>;
}

function Price({ listing }: { listing: ClassifiedCard }) {
  return (
    <>
      {listing.job
        ? formatJobPay(listing.job)
        : (listing.service?.pricing ??
          formatClassifiedPrice(listing.priceCents, {
            wholeDollars: Boolean(listing.vehicle || listing.home),
            monthly: listing.home?.mode === "rent",
          }))}
    </>
  );
}

function cardActionLabel(listing: ClassifiedCard) {
  if (listing.job) return "Apply now";
  if (listing.service) return "Get a quote";
  if (listing.pet) return petPlacementLabels[listing.pet.placementType] ?? "Pet listing";
  if (listing.home)
    return listing.home.mode === "rent"
      ? "Schedule a tour"
      : listing.home.mode === "build"
        ? "Explore new build"
        : "Contact seller";
  return formatFulfillmentLabel(listing.fulfillmentMode, Boolean(listing.vehicle));
}

/**
 * Jobs have no product photos, so their card is compact: the employer's
 * logo or initials beside the pay, title and employer, instead of a large
 * empty photo area.
 */
function JobCard({ listing }: { listing: ClassifiedCard }) {
  const job = listing.job!;
  return (
    <article className="group relative min-w-0 overflow-hidden rounded-2xl border border-transparent bg-card shadow-sm transition-shadow hover:shadow-md">
      <ListingLink listing={listing} className="block p-3.5 pr-11">
        <div className="flex items-start gap-3">
          <EmployerTile name={job.employerName || listing.title} imageUrl={listing.imageUrl} />
          <div className="min-w-0">
            <p className="numeric text-[15px] font-bold leading-tight text-foreground">
              <Price listing={listing} />
            </p>
            <h3 className="mt-1 line-clamp-2 text-[13px] font-semibold leading-[1.3] group-hover:text-primary">
              {listing.isFeatured ? (
                <span className="mr-1.5 inline-flex align-middle">
                  <FeaturedBadge />
                </span>
              ) : null}
              {listing.title}
            </h3>
            <Facts listing={listing} />
          </div>
        </div>
        <div className="mt-3 flex items-center justify-between gap-2 text-[11px] text-muted-foreground">
          <span className="flex min-w-0 items-center gap-1 truncate">
            <MapPin size={12} weight="fill" className="shrink-0 text-primary" />
            {listing.city}, {listing.state}
          </span>
          <span className="shrink-0">{postedAge(listing.createdAt)}</span>
        </div>
      </ListingLink>
      {!listing.externalJob ? (
        <div className="absolute right-2 top-2 z-10">
          <WatchHeartButton
            productId={listing.productId}
            productSlug={listing.productSlug}
            productName={listing.title}
            isDemo={listing.isMock === true}
          />
        </div>
      ) : null}
      <Attribution listing={listing} />
    </article>
  );
}

/** soldAt marks a card in a Recently sold section: a Sold tag, the last asking price, no save button. */
export function ListingCard({
  listing,
  soldAt,
  priority,
}: {
  listing: ClassifiedCard;
  soldAt?: string;
  /** Load this card's photo eagerly at high priority (the first cards above the fold). */
  priority?: boolean;
}) {
  if (listing.job && !soldAt) return <JobCard listing={listing} />;
  return (
    <article className="group relative min-w-0 overflow-hidden rounded-2xl border border-transparent bg-card shadow-sm transition-shadow hover:shadow-md">
      <div className="relative">
        <ListingLink listing={listing} className="block">
          <Photo listing={listing} priority={priority} />
        </ListingLink>
        {soldAt ? (
          <span className="absolute left-2 top-2 z-10 inline-flex rounded-full bg-foreground px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.08em] text-background shadow-sm">
            Sold
          </span>
        ) : !listing.externalJob ? (
          <div className="absolute right-2 top-2 z-10">
            <WatchHeartButton
              productId={listing.productId}
              productSlug={listing.productSlug}
              productName={listing.title}
              isDemo={listing.isMock === true}
            />
          </div>
        ) : null}
      </div>
      <ListingLink listing={listing} className="block px-3.5 pb-4 pt-3.5">
        <p className="numeric text-[17px] font-bold leading-none text-foreground">
          {soldAt ? (
            <span className="mr-1 text-[11px] font-semibold text-muted-foreground">Asked</span>
          ) : null}
          <Price listing={listing} />
        </p>
        <h3 className="mt-1.5 line-clamp-2 min-h-[34px] text-[13px] font-semibold leading-[1.3] group-hover:text-primary">
          {listing.title}
        </h3>
        <Facts listing={listing} />
        {listing.dealer ? (
          <p className="mt-1 truncate text-[11.5px] font-medium text-primary">
            {listing.dealer.displayName} · Dealer inventory
          </p>
        ) : null}
        <p className="mt-2 flex items-center gap-1 truncate text-[11.5px] text-muted-foreground">
          <MapPin size={12} weight="fill" className="shrink-0 text-primary" />
          {listing.city}, {listing.state}
        </p>
        <div className="mt-2 flex items-center justify-between gap-2 text-[10.5px] text-muted-foreground">
          <span className="truncate">{soldAt ? "Sold" : cardActionLabel(listing)}</span>
          <span className="shrink-0">{postedAge(soldAt ?? listing.createdAt)}</span>
        </div>
      </ListingLink>
      <Attribution listing={listing} />
    </article>
  );
}

export function ListingRow({ listing }: { listing: ClassifiedCard }) {
  return (
    <article className="group relative overflow-hidden rounded-2xl border border-transparent bg-card shadow-sm transition-shadow hover:shadow-md">
      <ListingLink
        listing={listing}
        className={
          listing.job
            ? "grid grid-cols-[48px_minmax(0,1fr)] gap-3 p-3"
            : "grid grid-cols-[130px_minmax(0,1fr)] gap-3 sm:grid-cols-[210px_minmax(0,1fr)]"
        }
      >
        {listing.job ? (
          <EmployerTile
            name={listing.job.employerName || listing.title}
            imageUrl={listing.imageUrl}
          />
        ) : (
          <Photo listing={listing} />
        )}
        <div className="min-w-0 py-3 pr-3">
          <div className="flex flex-wrap items-baseline justify-between gap-x-3">
            <h3 className="min-w-0 flex-1 truncate text-[14px] font-semibold group-hover:text-primary">
              {listing.isFeatured ? (
                <span className="mr-2 inline-flex align-middle">
                  <FeaturedBadge />
                </span>
              ) : null}
              {listing.title}
            </h3>
            <p className="numeric text-[17px] font-bold leading-none">
              <Price listing={listing} />
            </p>
          </div>
          <Facts listing={listing} />
          {listing.dealer ? (
            <p className="mt-1 truncate text-[11.5px] font-medium text-primary">
              {listing.dealer.displayName} · Dealer inventory
            </p>
          ) : null}
          <p className="mt-2 flex items-center gap-1 truncate text-[11.5px] text-muted-foreground">
            <MapPin size={12} weight="fill" className="shrink-0 text-primary" />
            {listing.city}, {listing.state} ·{" "}
            {listing.job
              ? "Apply now"
              : listing.service
                ? "Get a quote"
                : listing.home
                  ? listing.home.mode === "rent"
                    ? "Schedule a tour"
                    : listing.home.mode === "build"
                      ? "Explore new build"
                      : "Contact seller"
                  : formatFulfillmentLabel(listing.fulfillmentMode, Boolean(listing.vehicle))}
          </p>
          <p className="mt-1 text-[10.5px] text-muted-foreground">{postedAge(listing.createdAt)}</p>
        </div>
      </ListingLink>
      <Attribution listing={listing} />
    </article>
  );
}
