import { Link } from "@tanstack/react-router";
import { MapPin } from "@phosphor-icons/react";

import { formatUsd } from "@/config/fees";
import { WatchHeartButton } from "@/components/community/WatchHeartButton";
import {
  conditionLabels,
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
        className={`flex ${ratio} items-center justify-center bg-secondary text-[11px] text-muted-foreground`}
      >
        No photo yet
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

export function ListingCard({ listing }: { listing: ClassifiedCard }) {
  return (
    <article className="group relative min-w-0 rounded-md border border-border bg-card transition-colors hover:border-primary">
      <div className="relative">
        <Link to="/listings/$listingId" params={{ listingId: listing.id }} className="block">
          <Photo listing={listing} />
        </Link>
        <div className="absolute right-2 top-2 z-10">
          <WatchHeartButton
            productId={listing.productId}
            productSlug={listing.productSlug}
            productName={listing.title}
            isDemo={false}
          />
        </div>
      </div>
      <Link
        to="/listings/$listingId"
        params={{ listingId: listing.id }}
        className="block border-t border-border px-3 py-3"
      >
        <p className="numeric text-[17px] font-bold leading-none text-foreground">
          {formatUsd(listing.priceCents)}
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
          <span className="truncate">{fulfillmentLabels[listing.fulfillmentMode]}</span>
          <span className="shrink-0">{postedAge(listing.createdAt)}</span>
        </div>
      </Link>
    </article>
  );
}

export function ListingRow({ listing }: { listing: ClassifiedCard }) {
  return (
    <article className="group relative rounded-md border border-border bg-card transition-colors hover:border-primary">
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
              {formatUsd(listing.priceCents)}
            </p>
          </div>
          <Facts listing={listing} />
          <p className="mt-2 flex items-center gap-1 truncate text-[11.5px] text-muted-foreground">
            <MapPin size={12} weight="fill" className="shrink-0 text-primary" />
            {listing.city}, {listing.state} · {fulfillmentLabels[listing.fulfillmentMode]}
          </p>
          <p className="mt-1 text-[10.5px] text-muted-foreground">{postedAge(listing.createdAt)}</p>
        </div>
      </Link>
    </article>
  );
}
