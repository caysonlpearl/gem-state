import { useEffect, useRef, useState, type ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import { MapPin } from "@phosphor-icons/react";
import { listingParam } from "@/lib/listing-url";
import { listingCardImageUrl } from "@/lib/listing-card-image";

import { CategoryArtwork } from "@/components/classifieds/CategoryIcon";
import { PartnerJobHeartButton } from "@/components/community/PartnerJobHeartButton";
import { PartnerHomeHeartButton } from "@/components/community/PartnerHomeHeartButton";
import { PartnerVehicleHeartButton } from "@/components/community/PartnerVehicleHeartButton";
import { WatchHeartButton } from "@/components/community/WatchHeartButton";
import {
  conditionLabels,
  formatClassifiedPrice,
  adoptionPriceLabel,
  formatFulfillmentLabel,
  formatJobPay,
  homeStatusLabel,
  listingLogoUrl,
  withoutLogo,
  formatMileage,
  petPlacementLabels,
  postedAge,
  placeLabel,
} from "@/lib/classifieds-display";
import type { ListingCardSummary } from "@/lib/listing-card-summary";

function ListingLink({
  listing,
  className,
  children,
  ariaLabel,
}: {
  listing: ListingCardSummary;
  className: string;
  children: ReactNode;
  ariaLabel?: string;
}) {
  // Partner (Adzuna) jobs open on Bluebird's own job page like any listing;
  // the visitor leaves for Adzuna only from that page's Apply button.
  return (
    <Link
      to="/listings/$listingId"
      params={{ listingId: listingParam(listing) }}
      className={className}
      aria-label={ariaLabel}
    >
      {children}
    </Link>
  );
}
/**
 * "Jobs by Adzuna" once under a group of cards that includes Adzuna jobs.
 * Adzuna's terms ask for it on pages showing their results; once per group
 * keeps the cards themselves clean. Job pages carry their own.
 */
export function PartnerJobsCredit({ listings }: { listings: readonly ListingCardSummary[] }) {
  if (!listings.some((listing) => listing.externalJob)) return null;
  return (
    <p className="mt-3 text-right text-[10px] text-muted-foreground">
      Jobs by{" "}
      <a
        href="https://www.adzuna.com"
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex min-h-[23px] min-w-[116px] items-center justify-end text-[23px] font-bold leading-none text-primary"
      >
        Adzuna
      </a>
      {listings.some((listing) => listing.externalJob?.logoUrl) ? (
        <>
          <br />
          <LogoDevCredit />
        </>
      ) : null}
    </p>
  );
}

/** A single source credit once under a group that includes feed homes. */
export function PartnerHomesCredit({ listings }: { listings: readonly ListingCardSummary[] }) {
  const source = listings.find((listing) => listing.externalHome)?.externalHome;
  if (!source) return null;
  const providerUrl =
    source.source === "Mashvisor"
      ? "https://www.mashvisor.com"
      : "https://www.openwebninja.com/api/real-time-zillow-data";
  return (
    <p className="mt-3 text-right text-[11px] text-muted-foreground">
      Some home listing data from{" "}
      <a
        href={providerUrl}
        target="_blank"
        rel="noopener noreferrer"
        className="font-semibold text-primary"
      >
        {source.source}
      </a>
    </p>
  );
}

/** A single source credit once under a group that includes MarketCheck vehicles. */
export function PartnerVehiclesCredit({ listings }: { listings: readonly ListingCardSummary[] }) {
  if (!listings.some((listing) => listing.externalVehicle)) return null;
  return (
    <p className="mt-3 text-right text-[11px] text-muted-foreground">
      Some vehicle listing data from{" "}
      <a
        href="https://www.marketcheck.com"
        target="_blank"
        rel="noopener noreferrer"
        className="font-semibold text-primary"
      >
        MarketCheck
      </a>
    </p>
  );
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
 * An employer's logo when there's one (logo.dev, for partner jobs), otherwise
 * their initials on a soft colored tile. Used in the apply box on partner
 * job pages.
 */
/** logo.dev's free plan asks for this link wherever its logos show. */
export function LogoDevCredit() {
  return (
    <a
      href="https://logo.dev"
      target="_blank"
      rel="noopener noreferrer"
      className="text-[10px] text-muted-foreground hover:underline"
    >
      Logos provided by Logo.dev
    </a>
  );
}

/**
 * A logo that reports when it can't load (logo.dev answers 404 when it has
 * none). Also catches a failure that happened before hydration, which
 * React's onError never sees.
 */
function LogoImage({
  src,
  className,
  onMissing,
  priority,
}: {
  src: string;
  className: string;
  onMissing: () => void;
  priority?: boolean;
}) {
  const ref = useRef<HTMLImageElement>(null);
  useEffect(() => {
    const img = ref.current;
    if (img?.complete && img.naturalWidth === 0) onMissing();
  }, [onMissing]);
  return (
    <img
      ref={ref}
      src={src}
      alt=""
      loading={priority ? "eager" : "lazy"}
      fetchPriority={priority ? "high" : undefined}
      onError={onMissing}
      className={className}
    />
  );
}

export function EmployerTile({
  name,
  imageUrl,
  size = "md",
}: {
  name: string;
  imageUrl?: string | null;
  size?: "md" | "lg";
}) {
  const [missing, setMissing] = useState(false);
  const box =
    size === "lg" ? "h-16 w-16 rounded-2xl text-[20px]" : "h-12 w-12 rounded-xl text-[15px]";
  if (imageUrl && !missing) {
    return (
      <span className={`${box} shrink-0 overflow-hidden border border-border bg-white p-1.5`}>
        <LogoImage
          src={imageUrl}
          onMissing={() => setMissing(true)}
          className="h-full w-full object-contain"
        />
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

/**
 * A directory business has no prices, so its card leads with its Google
 * rating when we have one, and "Call for a quote" as the smaller line.
 */
function DirectoryRating({ directory }: { directory: NonNullable<ListingCardSummary["directory"]> }) {
  return (
    <div className="min-h-[34px]">
      {directory.rating != null ? (
        <p className="flex items-baseline gap-1.5 leading-none">
          <span className="text-[17px] text-brand-warm" aria-hidden="true">
            ★
          </span>
          <span className="numeric text-[19px] font-bold text-foreground">
            {directory.rating.toFixed(1)}
          </span>
          {directory.reviewCount != null ? (
            <span className="text-[11.5px] text-muted-foreground">
              {directory.reviewCount.toLocaleString()} Google review
              {directory.reviewCount === 1 ? "" : "s"}
            </span>
          ) : null}
        </p>
      ) : null}
      <p
        className={`text-[12px] font-semibold text-primary ${directory.rating != null ? "mt-1.5" : "pt-1"}`}
      >
        Call for a quote
      </p>
    </div>
  );
}

/**
 * The center of a photo-less card or listing gallery: the employer's logo
 * for a partner job when there is one, else the category art.
 */
export function PlaceholderMark({ listing, large }: { listing: ListingCardSummary; large?: boolean }) {
  const [missing, setMissing] = useState(false);
  const logoUrl = listingLogoUrl(listing);
  if (logoUrl && !missing) {
    return (
      <span
        className={`relative grid place-items-center overflow-hidden bg-white shadow-sm ${large ? "h-28 w-28 rounded-3xl p-4" : "h-20 w-20 rounded-2xl p-2.5"}`}
      >
        <LogoImage
          src={logoUrl}
          onMissing={() => setMissing(true)}
          className="h-full w-full object-contain"
        />
      </span>
    );
  }
  return large ? (
    <span className="grid h-20 w-20 place-items-center rounded-3xl bg-card text-primary">
      <CategoryArtwork slug={listing.categorySlug ?? "general"} size={110} />
    </span>
  ) : (
    <span className="relative grid h-14 w-14 place-items-center rounded-2xl bg-card/75 text-primary shadow-sm backdrop-blur">
      <CategoryArtwork slug={listing.categorySlug ?? "general"} size={84} />
    </span>
  );
}

/** A photo-less listing: category art on a soft gradient. */
function PlaceholderPhoto({ listing, ratio }: { listing: ListingCardSummary; ratio: string }) {
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
      <PlaceholderMark listing={listing} />
    </div>
  );
}

/** A partner job's employer logo filling the photo area, on white. */
function LogoPhoto({
  listing,
  logoUrl,
  ratio,
  priority,
}: {
  listing: ListingCardSummary;
  logoUrl: string;
  ratio: string;
  priority?: boolean;
}) {
  const [missing, setMissing] = useState(false);
  if (missing) return <PlaceholderPhoto listing={withoutLogo(listing)} ratio={ratio} />;
  return (
    <div className={`relative ${ratio} overflow-hidden border-b border-border/60 bg-white p-3`}>
      <LogoImage
        src={logoUrl}
        priority={priority}
        onMissing={() => setMissing(true)}
        className="h-full w-full object-contain transition-transform duration-300 group-hover:scale-[1.03]"
      />
    </div>
  );
}

export function ListingCardPhoto({
  listing,
  tall,
  priority,
}: {
  listing: ListingCardSummary;
  tall?: boolean;
  priority?: boolean;
}) {
  const ratio = tall ? "aspect-[4/3]" : "aspect-[4/3]";
  const logoUrl = listingLogoUrl(listing);
  if (!listing.imageUrl && logoUrl) {
    return <LogoPhoto listing={listing} logoUrl={logoUrl} ratio={ratio} priority={priority} />;
  }
  if (!listing.imageUrl) {
    return <PlaceholderPhoto listing={listing} ratio={ratio} />;
  }
  return (
    <div className={`relative ${ratio} overflow-hidden bg-secondary`}>
      <img
        src={listingCardImageUrl(listing.imageUrl)}
        decoding="async"
        onError={(event) => {
          const image = event.currentTarget;
          // A removed thumbnail must not hide an original image that still works.
          if (
            listingCardImageUrl(listing.imageUrl!) !== listing.imageUrl &&
            image.dataset.originalFallback !== "1"
          ) {
            image.dataset.originalFallback = "1";
            image.src = listing.imageUrl!;
          }
        }}
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

function Facts({ listing }: { listing: ListingCardSummary }) {
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
    listing.vehicle?.year != null ? String(listing.vehicle.year) : null,
    mileage,
    listing.vehicle?.transmission ?? null,
    listing.vehicle?.drivetrain ?? null,
    listing.vehicle ? null : (conditionLabels[listing.condition] ?? null),
  ].filter(Boolean) as string[];
  if (bits.length === 0) return null;
  return <p className="mt-1 truncate text-[11.5px] text-muted-foreground">{bits.join(" · ")}</p>;
}

function vehicleSourceLabel(listing: ListingCardSummary) {
  if (listing.externalVehicle?.sourceKind === "fsbo") return "Private seller";
  if (listing.externalVehicle?.sourceKind === "dealer") {
    return `${listing.dealer?.displayName ?? "Dealer"} · Dealer inventory`;
  }
  return listing.dealer ? `${listing.dealer.displayName} · Dealer inventory` : null;
}

function Price({ listing }: { listing: ListingCardSummary }) {
  return (
    <>
      {listing.job
        ? formatJobPay(listing.job)
        : (listing.service?.pricing ??
          adoptionPriceLabel(listing) ??
          formatClassifiedPrice(listing.priceCents, {
            wholeDollars: Boolean(listing.vehicle || listing.home),
            monthly: listing.home?.mode === "rent",
          }))}
    </>
  );
}

function cardActionLabel(listing: ListingCardSummary) {
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

/** soldAt marks a card in a Recently sold section: a Sold tag, the last asking price, no save button. */
export function ListingCard({
  listing,
  soldAt,
  priority,
}: {
  listing: ListingCardSummary;
  soldAt?: string;
  /** Load this card's photo eagerly at high priority (the first cards above the fold). */
  priority?: boolean;
}) {
  return (
    <article className="group relative min-w-0 overflow-hidden rounded-2xl border border-transparent bg-card shadow-sm transition-shadow hover:shadow-md">
      <div className="relative">
        <ListingLink
          listing={listing}
          className="block"
          ariaLabel={"View listing: " + listing.title}
        >
          <ListingCardPhoto listing={listing} priority={priority} />
        </ListingLink>
        {soldAt ? (
          <span className="absolute left-2 top-2 z-10 inline-flex rounded-full bg-foreground px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.08em] text-background shadow-sm">
            Sold
          </span>
        ) : (
          <div className="absolute right-2 top-2 z-10">
            {listing.externalJob || listing.directory || listing.externalPet ? (
              <PartnerJobHeartButton listingId={listing.id} title={listing.title} />
            ) : listing.externalHome ? (
              <PartnerHomeHeartButton listingId={listing.id} title={listing.title} />
            ) : listing.externalVehicle ? (
              <PartnerVehicleHeartButton listingId={listing.id} title={listing.title} />
            ) : (
              <WatchHeartButton
                productId={listing.productId}
                productSlug={listing.productSlug}
                productName={listing.title}
                isDemo={listing.isMock === true}
              />
            )}
          </div>
        )}
      </div>
      {listing.home ? (
        <ListingLink listing={listing} className="block px-3.5 pb-4 pt-3.5">
          <HomeCardBody listing={listing} soldAt={soldAt} />
        </ListingLink>
      ) : (
        <ListingLink listing={listing} className="block px-3.5 pb-4 pt-3.5">
          {listing.directory ? (
            <DirectoryRating directory={listing.directory} />
          ) : (
            <p className="numeric text-[17px] font-bold leading-none text-foreground">
              {soldAt ? (
                <span className="mr-1 text-[11px] font-semibold text-muted-foreground">Asked</span>
              ) : null}
              <Price listing={listing} />
            </p>
          )}
          <h3 className="mt-1.5 line-clamp-2 min-h-[34px] text-[13px] font-semibold leading-[1.3] group-hover:text-primary">
            {listing.title}
          </h3>
          <Facts listing={listing} />
          {vehicleSourceLabel(listing) ? (
            <p className="mt-1 truncate text-[11.5px] font-medium text-primary">
              {vehicleSourceLabel(listing)}
            </p>
          ) : null}
          <p className="mt-2 flex items-center gap-1 truncate text-[11.5px] text-muted-foreground">
            <MapPin size={12} weight="fill" className="shrink-0 text-primary" />
            {placeLabel(listing.city, listing.state)}
          </p>
          <div className="mt-2 flex items-center justify-between gap-2 text-[10.5px] text-muted-foreground">
            <span className="truncate">
              {soldAt
                ? "Sold"
                : listing.directory
                  ? (listing.directory.phone ?? "Call for details")
                  : cardActionLabel(listing)}
            </span>
            <span className="shrink-0">
              {listing.directory
                ? listing.directory.claimed
                  ? "Owner verified"
                  : "Local business"
                : postedAge(soldAt ?? listing.createdAt)}
            </span>
          </div>
        </ListingLink>
      )}
    </article>
  );
}

/**
 * Home cards read like Zillow's and KSL's: price, then "3 bds | 2 ba |
 * 1,487 sqft - House for sale", then the address.
 */
function HomeCardBody({ listing, soldAt }: { listing: ListingCardSummary; soldAt?: string }) {
  const home = listing.home!;
  const facts = [
    home.bedrooms != null
      ? [home.bedrooms === 0 ? "Studio" : String(home.bedrooms), home.bedrooms === 0 ? "" : "bds"]
      : null,
    home.bathrooms != null ? [String(home.bathrooms), "ba"] : null,
    home.squareFeet != null ? [home.squareFeet.toLocaleString(), "sqft"] : null,
  ].filter((fact): fact is string[] => fact != null);
  return (
    <>
      <p className="numeric text-[19px] font-bold leading-none text-foreground">
        {soldAt ? (
          <span className="mr-1 text-[11px] font-semibold text-muted-foreground">Asked</span>
        ) : null}
        <Price listing={listing} />
      </p>
      <p className="mt-2 truncate text-[12.5px] text-foreground">
        {facts.map(([value, unit], index) => (
          <span key={unit || value}>
            {index > 0 ? <span className="mx-1.5 text-border">|</span> : null}
            <span className="font-bold">{value}</span>
            {unit ? ` ${unit}` : ""}
          </span>
        ))}
        {facts.length ? <span className="mx-1.5 text-muted-foreground">-</span> : null}
        <span className="text-muted-foreground">{soldAt ? "Sold" : homeStatusLabel(home)}</span>
      </p>
      <h3 className="mt-1.5 truncate text-[12.5px] font-semibold group-hover:text-primary">
        {listing.title}
      </h3>
      <div className="mt-1 flex items-center justify-between gap-2 text-[11.5px] text-muted-foreground">
        <span className="flex min-w-0 items-center gap-1 truncate">
          <MapPin size={12} weight="fill" className="shrink-0 text-primary" />
          {placeLabel(listing.city, listing.state)}
        </span>
        <span className="shrink-0 text-[10.5px]">{postedAge(soldAt ?? listing.createdAt)}</span>
      </div>
    </>
  );
}

export function ListingRow({ listing }: { listing: ListingCardSummary }) {
  return (
    <article className="group relative overflow-hidden rounded-2xl border border-transparent bg-card shadow-sm transition-shadow hover:shadow-md">
      <ListingLink
        listing={listing}
        className="grid grid-cols-[130px_minmax(0,1fr)] gap-3 sm:grid-cols-[210px_minmax(0,1fr)]"
      >
        <ListingCardPhoto listing={listing} />
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
          {vehicleSourceLabel(listing) ? (
            <p className="mt-1 truncate text-[11.5px] font-medium text-primary">
              {vehicleSourceLabel(listing)}
            </p>
          ) : null}
          <p className="mt-2 flex items-center gap-1 truncate text-[11.5px] text-muted-foreground">
            <MapPin size={12} weight="fill" className="shrink-0 text-primary" />
            {placeLabel(listing.city, listing.state)} ·{" "}
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
    </article>
  );
}
