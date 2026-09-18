import { Link } from "@tanstack/react-router";
import { MapPin } from "@phosphor-icons/react";

import { formatUsd } from "@/config/fees";
import { CategoryArtwork } from "@/components/classifieds/CategoryIcon";
import { WatchHeartButton } from "@/components/community/WatchHeartButton";
import {
  conditionLabels,
  formatJobPay,
  formatMileage,
  fulfillmentLabels,
  postedAge,
} from "@/lib/classifieds-display";
import type { ClassifiedCard } from "@/lib/classifieds.functions";

function Photo({ listing, tall }: { listing: ClassifiedCard; tall?: boolean }) {
  const ratio = tall ? "aspect-[4/3]" : "aspect-[4/3]";
  if (!listing.imageUrl) {
    return (
      <div
        className={`relative flex ${ratio} items-center justify-center overflow-hidden bg-gradient-to-br from-secondary via-card to-accent/25 text-muted-foreground`}
      >
        <span className="absolute -right-6 -top-8 h-28 w-28 rounded-full bg-primary/5" />
        <span className="absolute -bottom-10 -left-5 h-28 w-28 rounded-full bg-brand-warm/10" />
        <span className="relative grid h-14 w-14 place-items-center rounded-2xl bg-card/75 text-primary shadow-sm backdrop-blur">
          <CategoryArtwork slug={listing.categorySlug ?? "general"} size={84} />
        </span>
      </div>
    );
  }
  return (
    <div className={`${ratio} overflow-hidden bg-secondary`}>
      <img
        src={listing.imageUrl}
        alt={listing.title}
        loading="lazy"
        className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.03]"
      />
    </div>
  );
}

function Facts({ listing }: { listing: ClassifiedCard }) {
  if (listing.job) {
    return (
      <p className="mt-1 truncate text-[11.5px] text-muted-foreground">
        {listing.job.employerName} · {listing.job.employmentType}
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
        : listing.service?.pricing ?? formatUsd(listing.priceCents)}
    </>
  );
}

export function ListingCard({ listing }: { listing: ClassifiedCard }) {
  return (
    <article className="group relative min-w-0 overflow-hidden rounded-2xl border border-transparent bg-card shadow-sm transition-shadow hover:shadow-md">
      <div className="relative">
        <Link to="/listings/$listingId" params={{ listingId: listing.id }} className="block">
          <Photo listing={listing} />
        </Link>
        <div className="absolute right-2 top-2 z-10">
          <WatchHeartButton
            productId={listing.productId}
            productSlug={listing.productSlug}
            productName={listing.title}
            isDemo={listing.isMock === true}
          />
        </div>
      </div>
      <Link
        to="/listings/$listingId"
        params={{ listingId: listing.id }}
        className="block px-3.5 pb-4 pt-3.5"
      >
        <p className="numeric text-[17px] font-bold leading-none text-foreground">
          <Price listing={listing} />
        </p>
        <h3 className="mt-1.5 line-clamp-2 min-h-[34px] text-[13px] font-semibold leading-[1.3] group-hover:text-primary">
          {listing.title}
        </h3>
        <Facts listing={listing} />
        <p className="mt-2 flex items-center gap-1 truncate text-[11.5px] text-muted-foreground">
          <MapPin size={12} weight="fill" className="shrink-0 text-primary" />
          {listing.city}, {listing.state}
        </p>
        <div className="mt-2 flex items-center justify-between gap-2 text-[10.5px] text-muted-foreground">
          <span className="truncate">
            {listing.job ? "Apply now" : fulfillmentLabels[listing.fulfillmentMode]}
          </span>
          <span className="shrink-0">{postedAge(listing.createdAt)}</span>
        </div>
      </Link>
    </article>
  );
}

export function ListingRow({ listing }: { listing: ClassifiedCard }) {
  return (
    <article className="group relative overflow-hidden rounded-2xl border border-transparent bg-card shadow-sm transition-shadow hover:shadow-md">
      <Link
        to="/listings/$listingId"
        params={{ listingId: listing.id }}
        className="grid grid-cols-[130px_minmax(0,1fr)] gap-3 sm:grid-cols-[210px_minmax(0,1fr)]"
      >
        <Photo listing={listing} />
        <div className="min-w-0 py-3 pr-3">
          <div className="flex flex-wrap items-baseline justify-between gap-x-3">
            <h3 className="min-w-0 flex-1 truncate text-[14px] font-semibold group-hover:text-primary">
              {listing.title}
            </h3>
            <p className="numeric text-[17px] font-bold leading-none">
              <Price listing={listing} />
            </p>
          </div>
          <Facts listing={listing} />
          <p className="mt-2 flex items-center gap-1 truncate text-[11.5px] text-muted-foreground">
            <MapPin size={12} weight="fill" className="shrink-0 text-primary" />
            {listing.city}, {listing.state} ·{" "}
            {listing.job ? "Apply now" : fulfillmentLabels[listing.fulfillmentMode]}
          </p>
          <p className="mt-1 text-[10.5px] text-muted-foreground">{postedAge(listing.createdAt)}</p>
        </div>
      </Link>
    </article>
  );
}
