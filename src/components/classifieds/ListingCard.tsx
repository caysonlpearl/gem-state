import { useEffect, useRef } from "react";
import { Link } from "@tanstack/react-router";
import { listingParam } from "@/lib/listing-url";
import { trackBusinessListingOpen } from "@/lib/business-analytics";
import { observeShoppingCard } from "@/lib/shopping-client";
import { PartnerJobHeartButton } from "@/components/community/PartnerJobHeartButton";
import { PartnerHomeHeartButton } from "@/components/community/PartnerHomeHeartButton";
import { PartnerVehicleHeartButton } from "@/components/community/PartnerVehicleHeartButton";
import { WatchHeartButton } from "@/components/community/WatchHeartButton";
import type { ListingCardSummary } from "@/lib/listing-card-summary";
import { ListingCardView, ListingRowView, type ListingCardLinkProps } from "./ListingCardView";
export {
  PartnerJobsCredit,
  PartnerHomesCredit,
  PartnerVehiclesCredit,
  LogoDevCredit,
  EmployerTile,
  PlaceholderMark,
  ListingCardPhoto,
} from "./ListingCardView";
function ListingLink({ listing, className, children, ariaLabel }: ListingCardLinkProps) {
  // Partner (Adzuna) jobs open on Bluebird's own job page like any listing;
  // the visitor leaves for Adzuna only from that page's Apply button.
  return (
    <Link
      to="/listings/$listingId"
      params={{ listingId: listingParam(listing) }}
      className={className}
      aria-label={ariaLabel}
      onClick={() => trackBusinessListingOpen(listing)}
    >
      {children}
    </Link>
  );
}

export function ListingCard({
  listing,
  soldAt,
  priority,
  shoppingContext,
}: {
  listing: ListingCardSummary;
  soldAt?: string;
  priority?: boolean;
  shoppingContext?: Record<string, unknown>;
}) {
  const shoppingRef = useRef<HTMLElement>(null);
  const shoppingKey = JSON.stringify(shoppingContext ?? {});
  useEffect(
    () =>
      shoppingRef.current && !listing.isMock && !soldAt
        ? observeShoppingCard(shoppingRef.current, listing.id, JSON.parse(shoppingKey))
        : undefined,
    [listing.id, listing.isMock, soldAt, shoppingKey],
  );
  const saveAction =
    listing.externalJob ||
    listing.directory ||
    listing.externalPet ||
    listing.externalMerchandise ? (
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
    );
  return (
    <ListingCardView
      listing={listing}
      soldAt={soldAt}
      priority={priority}
      shoppingContext={shoppingContext}
      elementRef={shoppingRef}
      renderLink={ListingLink}
      saveAction={soldAt ? undefined : saveAction}
    />
  );
}
export function ListingRow({ listing }: { listing: ListingCardSummary }) {
  return <ListingRowView listing={listing} renderLink={ListingLink} />;
}
