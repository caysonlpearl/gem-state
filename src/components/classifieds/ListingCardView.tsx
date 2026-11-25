import { CompareToggle } from "@/components/marketplace/Comparison";
import { PhotoImage } from "@/components/marketplace/PhotoImage";
import { listingPreviewTitle, petPreviewFacts } from "@/lib/listing-preview";
import { dealerContactPriceLabel } from "@/lib/vehicle-shopping";
import { VerifiedDealerBadge } from "@/components/dealers/VerifiedDealerBadge";
import { hasApprovedDealer } from "@/lib/vehicle-shopping";
import { retailSavings } from "@/lib/retail-savings";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ReactNode,
  type ComponentType,
  type Ref,
} from "react";
import { MapPin, Truck } from "@phosphor-icons/react";
import { listingCardImageUrl } from "@/lib/listing-card-image";

import { CategoryArtwork } from "@/components/classifieds/CategoryIcon";
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
  postedAge,
  placeLabel,
} from "@/lib/classifieds-display";
import type { ListingCardSummary } from "@/lib/listing-card-summary";

export type ListingCardLinkProps = {
  listing: ListingCardSummary;
  className: string;
  children: ReactNode;
  ariaLabel?: string;
};
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
  if (!listings.some((listing) => listing.id.startsWith("marketcheck-") && listing.externalVehicle))
    return null;
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
function DirectoryRating({
  directory,
  compact = false,
}: {
  directory: NonNullable<ListingCardSummary["directory"]>;
  compact?: boolean;
}) {
  return (
    <div className={compact ? "h-7" : "min-h-[34px]"}>
      {directory.rating != null ? (
        <p
          aria-label={`${directory.rating.toFixed(1)} out of 5${directory.reviewCount != null ? ` from ${directory.reviewCount} Google reviews` : ""}`}
          className={`flex items-baseline ${compact ? "gap-1 leading-[14px]" : "gap-1.5 leading-none"}`}
        >
          <span
            className={`${compact ? "text-[12px]" : "text-[17px]"} text-brand-warm`}
            aria-hidden="true"
          >
            ★
          </span>
          <span
            className={`numeric font-bold text-foreground ${compact ? "text-[14px]" : "text-[19px]"}`}
          >
            {directory.rating.toFixed(1)}
          </span>
          {directory.reviewCount != null ? (
            <span
              className={`${compact ? "min-w-0 truncate text-[10px]" : "text-[11.5px]"} text-muted-foreground`}
            >
              {compact ? (
                `(${new Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 1 }).format(directory.reviewCount)}) Google`
              ) : (
                <>
                  {directory.reviewCount.toLocaleString()} Google review
                  {directory.reviewCount === 1 ? "" : "s"}
                </>
              )}
            </span>
          ) : null}
        </p>
      ) : null}
      <p
        className={`font-semibold text-primary ${compact ? "text-[11px] leading-[14px]" : `text-[12px] ${directory.rating != null ? "mt-1.5" : "pt-1"}`}`}
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
export function PlaceholderMark({
  listing,
  large,
}: {
  listing: ListingCardSummary;
  large?: boolean;
}) {
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
  shoppingContext,
}: {
  shoppingContext?: Record<string, unknown>;
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
  priority,
  shoppingContext,
  short = false,
}: {
  short?: boolean;
  shoppingContext?: Record<string, unknown>;
  listing: ListingCardSummary;
  tall?: boolean;
  priority?: boolean;
}) {
  const imageRef = useRef<HTMLImageElement>(null);
  const [failedUrl, setFailedUrl] = useState<string | null>(null);
  const recoverPhoto = useCallback(
    (image: HTMLImageElement) => {
      if (
        listing.imageUrl &&
        listingCardImageUrl(listing.imageUrl) !== listing.imageUrl &&
        image.dataset.originalFallback !== "1"
      ) {
        image.dataset.originalFallback = "1";
        image.src = listing.imageUrl;
        return;
      }
      setFailedUrl(listing.imageUrl);
    },
    [listing.imageUrl],
  );
  // An SSR photo may have failed before React attached its error handler.
  useEffect(() => {
    const image = imageRef.current;
    if (image?.complete && image.naturalWidth === 0) recoverPhoto(image);
  }, [recoverPhoto]);
  const ratio = short ? "aspect-[3/2]" : "aspect-[4/3]";
  const logoUrl = listingLogoUrl(listing);
  if (!listing.imageUrl && logoUrl) {
    return <LogoPhoto listing={listing} logoUrl={logoUrl} ratio={ratio} priority={priority} />;
  }
  if (!listing.imageUrl || failedUrl === listing.imageUrl) {
    return <PlaceholderPhoto listing={listing} ratio={ratio} />;
  }
  return (
    <div className={`relative ${ratio} overflow-hidden bg-secondary`}>
      <PhotoImage
        key={listing.imageUrl}
        ref={imageRef}
        src={listingCardImageUrl(listing.imageUrl)}
        decoding="async"
        onError={(event) => recoverPhoto(event.currentTarget)}
        alt={listingPreviewTitle(listing)}
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
      ) : retailSavings(listing) ? (
        <span className="absolute left-2 top-2 z-10 rounded-full bg-destructive px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide text-destructive-foreground shadow-sm">
          {retailSavings(listing)!.percent}% off
        </span>
      ) : null}
    </div>
  );
}

function Facts({ listing }: { listing: ListingCardSummary }) {
  if (listing.job || listing.service || listing.pet) {
    const facts = previewFacts(listing);
    return facts ? (
      <p className="mt-1 truncate text-[11.5px] text-muted-foreground">{facts}</p>
    ) : null;
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
    return listing.dealer?.displayName ?? "Dealer";
  }
  return listing.dealer?.displayName ?? null;
}

function Price({
  listing,
  showRetail = true,
}: {
  listing: ListingCardSummary;
  showRetail?: boolean;
}) {
  const savings = showRetail ? retailSavings(listing) : null;
  return (
    <>
      {listing.job
        ? formatJobPay(listing.job)
        : (listing.service?.pricing ??
          dealerContactPriceLabel(listing) ??
          adoptionPriceLabel(listing) ??
          formatClassifiedPrice(listing.priceCents, {
            wholeDollars: Boolean(listing.vehicle || listing.home || savings),
            monthly: listing.home?.mode === "rent",
          }))}
      {savings ? (
        <s className="ml-1.5 text-[0.75em] font-medium text-muted-foreground">
          <span className="sr-only">Retail price </span>
          {formatClassifiedPrice(savings.retailCents, { wholeDollars: true })}
        </s>
      ) : null}
    </>
  );
}

/** soldAt marks a card in a Recently sold section: a Sold tag, the last asking price, no save button. */
export function ListingCardView({
  listing,
  soldAt,
  priority,
  shoppingContext,
  renderLink: ListingLink,
  saveAction,
  elementRef,
  className = "",
  density = "standard",
}: {
  renderLink: ComponentType<ListingCardLinkProps>;
  saveAction?: ReactNode;
  elementRef?: Ref<HTMLElement>;
  className?: string;
  shoppingContext?: Record<string, unknown>;
  listing: ListingCardSummary;
  soldAt?: string;
  /** Load this card's photo eagerly at high priority (the first cards above the fold). */
  priority?: boolean;
  /** Native home discovery uses the same photos/actions with a shorter body. */
  density?: "standard" | "compact" | "browse" | "mobile-compact";
}) {
  const hasStandardBody = density === "standard" || density === "mobile-compact";
  return (
    <article
      ref={elementRef}
      data-preview-kind={
        listing.vehicle
          ? "vehicle"
          : listing.job
            ? "job"
            : listing.pet
              ? "pet"
              : listing.home
                ? "home"
                : "item"
      }
      data-listing-density={density === "standard" ? undefined : density}
      className={`group relative min-w-0 overflow-hidden rounded-2xl border border-transparent bg-card shadow-sm transition-shadow hover:shadow-md ${hasStandardBody ? "listing-preview-card flex flex-col" : ""} ${className}`}
    >
      <div className="relative">
        <ListingLink
          listing={listing}
          className="block"
          ariaLabel={"View listing: " + listingPreviewTitle(listing)}
        >
          <ListingCardPhoto listing={listing} priority={priority} short={density === "browse"} />
        </ListingLink>
        {soldAt ? (
          <span className="absolute left-2 top-2 z-10 inline-flex rounded-full bg-foreground px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.08em] text-background shadow-sm">
            Sold
          </span>
        ) : (
          <div className="absolute right-2 top-2 z-10">{saveAction}</div>
        )}
        {!soldAt && (
          <div
            className={`absolute bottom-2 right-2 z-10 opacity-100 transition-opacity md:opacity-0 md:group-hover:opacity-100 md:group-focus-within:opacity-100 ${density === "compact" || density === "browse" ? "hidden md:block" : ""}`}
          >
            <CompareToggle listing={listing} compact />
          </div>
        )}
      </div>
      {!hasStandardBody ? (
        <ListingLink listing={listing} className="block px-2.5 pb-2.5 pt-2">
          <h3 className="line-clamp-2 text-[12.5px] font-semibold leading-4 group-hover:text-primary">
            {listing.vehicle
              ? [listing.vehicle.year, listing.vehicle.make, listing.vehicle.model]
                  .filter(Boolean)
                  .join(" ") || listing.title
              : listingPreviewTitle(listing)}
          </h3>
          <div
            className={
              listing.directory
                ? "native-directory-summary"
                : "mt-1 numeric text-[17px] font-bold leading-5 text-primary"
            }
          >
            {listing.directory ? (
              <DirectoryRating directory={listing.directory} compact />
            ) : (
              <Price listing={listing} showRetail={false} />
            )}
          </div>
          {density === "browse" ? (
            <div className="native-browse-card-meta mt-1 flex min-w-0 items-baseline justify-between gap-1 text-muted-foreground">
              <span className="min-w-0 truncate" title={placeLabel(listing.city, listing.state)}>
                {listing.externalMerchandise ? "Shipping" : placeLabel(listing.city, listing.state)}
              </span>
              <span className="shrink-0" aria-label={postedAge(soldAt ?? listing.createdAt)}>
                {postedAge(soldAt ?? listing.createdAt)
                  .replace(/^Posted\s*/i, "")
                  .replace(/Yesterday/i, "1d")
                  .replace(/(\d+)\s+days?(\s+ago)?/i, "$1d")
                  .replace(/(\d+)\s+weeks?(\s+ago)?/i, "$1w")
                  .replace(/(\d+)\s+hours?(\s+ago)?/i, "$1h")}
              </span>
            </div>
          ) : (
            <p
              className={`${listing.directory ? "" : "mt-1"} truncate text-[11px] leading-4 text-muted-foreground`}
            >
              {listing.externalMerchandise
                ? "Shipping Only"
                : placeLabel(listing.city, listing.state)}
            </p>
          )}
        </ListingLink>
      ) : (
        <ListingLink
          listing={listing}
          className="listing-preview-body flex flex-1 flex-col gap-0.5 px-3.5 pb-3 pt-2.5"
        >
          <ListingPreviewBody listing={listing} soldAt={soldAt} />
        </ListingLink>
      )}
    </article>
  );
}

function ListingPreviewBody({ listing, soldAt }: { listing: ListingCardSummary; soldAt?: string }) {
  const location = listing.externalMerchandise
    ? "Shipping Only"
    : placeLabel(listing.city, listing.state);
  const LocationIcon = listing.externalMerchandise ? Truck : MapPin;
  const date = soldAt ?? listing.createdAt;
  const age = postedAge(date);
  const shortAge = age
    .replace("Yesterday", "1d ago")
    .replace(/(\d+) days? ago/, "$1d ago")
    .replace(/(\d+) months? ago/, "$1mo ago");
  const seller = vehicleSourceLabel(listing);
  const facts = seller ?? previewFacts(listing);
  return (
    <>
      <h3 className="line-clamp-2 text-[14px] font-semibold leading-[1.25] group-hover:text-primary">
        {listingPreviewTitle(listing)}
      </h3>
      {location || age ? (
        <p className="listing-preview-location flex min-w-0 items-center gap-1 text-[11.5px] leading-4 text-muted-foreground">
          {location ? (
            <>
              <LocationIcon
                size={12}
                weight="fill"
                className="listing-preview-location-icon shrink-0 text-primary"
                aria-hidden="true"
              />
              <span className="truncate" title={location}>
                {location}
              </span>
            </>
          ) : null}
          {location && age ? <span aria-hidden="true">·</span> : null}
          {age ? (
            <time
              dateTime={date}
              title={age}
              aria-label={age}
              className="shrink-0 whitespace-nowrap text-[10.5px]"
            >
              <span className="listing-preview-age-full">{age}</span>
              <span className="listing-preview-age-short hidden" aria-hidden="true">
                {shortAge}
              </span>
            </time>
          ) : null}
        </p>
      ) : null}
      {facts ? (
        <p
          className={`flex min-w-0 items-center gap-1 text-[11.5px] leading-4 ${seller ? "font-medium text-primary" : "text-muted-foreground"}`}
        >
          <span className="truncate" title={facts}>
            {facts}
          </span>
          {seller && hasApprovedDealer(listing) ? <VerifiedDealerBadge size={15} /> : null}
        </p>
      ) : null}
      {listing.directory ? (
        <DirectoryRating directory={listing.directory} />
      ) : (
        <p className="numeric py-0.5 text-[18px] font-bold leading-5 tracking-tight text-primary sm:text-[20px]">
          {soldAt ? (
            <span className="mr-1 text-[11px] font-semibold text-muted-foreground">Asked</span>
          ) : null}
          <Price listing={listing} />
        </p>
      )}
    </>
  );
}

function previewFacts(listing: ListingCardSummary) {
  if (listing.job) {
    return [
      listing.job.employerName,
      listing.job.employmentType === "Not specified" ? null : listing.job.employmentType,
    ]
      .filter(Boolean)
      .join(" · ");
  }
  if (listing.service) return listing.service.subcategory;
  if (listing.pet) return petPreviewFacts(listing).join(" · ");
  const home = listing.home;
  if (!home) return null;
  return [
    home.bedrooms === 0 ? "Studio" : home.bedrooms != null ? `${home.bedrooms} bds` : null,
    home.bathrooms != null ? `${home.bathrooms} ba` : null,
    home.squareFeet != null ? `${home.squareFeet.toLocaleString()} sqft` : null,
    homeStatusLabel(home),
  ]
    .filter(Boolean)
    .join(" · ");
}

export function ListingRowView({
  listing,
  renderLink: ListingLink,
}: {
  listing: ListingCardSummary;
  renderLink: ComponentType<ListingCardLinkProps>;
}) {
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
            <p className="mt-1 flex min-w-0 items-center gap-1 text-[11.5px] font-medium text-primary">
              <span className="truncate">{vehicleSourceLabel(listing)}</span>
              {hasApprovedDealer(listing) ? <VerifiedDealerBadge size={15} /> : null}
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
