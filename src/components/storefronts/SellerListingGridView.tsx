import type { ComponentType } from "react";
import { CheckCircle, Images } from "@phosphor-icons/react";
import { formatUsd } from "@/config/fees";
import { formatShippingOrigin } from "@/config/shipping";
import type { PublicListing } from "@/lib/seller.functions";
import { BluebirdEmptyState } from "@/components/layout/BluebirdEmptyState";
import type { StorefrontLinkProps } from "./storefront-types";
export const sellerListingConditions: Record<string, string> = {
  new_with_tags: "New with tags",
  new_without_tags: "New without tags",
  used_excellent: "Used · excellent",
  used_good: "Used · good",
};

export function SellerListingGridView({
  listings,
  showProduct = false,
  onOpen,
  Link,
  onSellerOpen = () => {},
}: {
  listings: PublicListing[];
  showProduct?: boolean;
  onOpen: (listing: PublicListing) => void;
  Link: ComponentType<StorefrontLinkProps>;
  onSellerOpen?: (listing: PublicListing) => void;
}) {
  if (listings.length === 0) {
    return (
      <BluebirdEmptyState
        title="No active seller listings yet."
        description="This seller will appear here as soon as an approved listing is available."
        className="max-w-2xl"
      />
    );
  }
  return (
    <>
      <div className="grid grid-cols-2 gap-x-3 gap-y-7 sm:grid-cols-3 xl:grid-cols-4">
        {listings.map((listing, index) => (
          <article key={listing.id} className="group min-w-0">
            <button
              type="button"
              onClick={() => onOpen(listing)}
              className="block w-full text-left outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
              aria-label={`View listing from ${listing.sellerDisplayName}`}
            >
              <span className="relative block aspect-square overflow-hidden bg-secondary/50">
                {listing.imageUrls[0] ? (
                  <img
                    src={listing.thumbnailUrl ?? listing.imageUrls[0]}
                    width={640}
                    height={640}
                    loading={index < 2 ? "eager" : "lazy"}
                    fetchPriority={index === 0 ? "high" : undefined}
                    alt={listing.productName ?? "Seller listing"}
                    className="h-full w-full object-contain p-3 transition-transform duration-200 group-hover:scale-[1.025]"
                  />
                ) : (
                  <span className="grid h-full place-items-center text-[11px] text-muted-foreground">
                    Photo unavailable
                  </span>
                )}
                <span className="absolute bottom-2 right-2 inline-flex items-center gap-1 bg-background/95 px-2 py-1 text-[9.5px] font-medium shadow-sm">
                  <Images size={12} /> {listing.imageUrls.length}
                </span>
              </span>
              <span className="mt-2.5 block">
                {showProduct && listing.productName ? (
                  <span className="line-clamp-2 block text-[12.5px] font-semibold leading-snug">
                    {listing.productName}
                  </span>
                ) : null}
                {showProduct && listing.variantLabel ? (
                  <span className="mt-0.5 block text-[10.5px] text-muted-foreground">
                    {listing.variantLabel}
                  </span>
                ) : null}
                <span className="mt-1 block text-[10.5px] text-muted-foreground">
                  {sellerListingConditions[listing.condition] ?? listing.condition}
                </span>
                <span className="mt-1 line-clamp-1 block text-[10px] text-muted-foreground">
                  Ships from{" "}
                  {formatShippingOrigin(
                    listing.shipFromCity,
                    listing.shipFromRegion,
                    listing.shipFromCountry,
                  )}
                </span>
                <span className="numeric mt-1 block text-[16px] font-semibold">
                  {formatUsd(listing.priceCents)}
                </span>
                <span className="mt-1 block text-[10px] font-medium text-primary opacity-80 group-hover:opacity-100">
                  View listing details
                </span>
              </span>
            </button>
            <Link
              to="/sellers/$slug"
              params={{ slug: listing.sellerSlug }}
              onClick={() => onSellerOpen(listing)}
              className="mt-1.5 inline-flex items-center gap-1 text-[10.5px] text-muted-foreground hover:text-foreground"
            >
              {listing.sellerDisplayName}
              {listing.payoutVerified ? (
                <CheckCircle
                  size={12}
                  weight="fill"
                  className="text-primary"
                  aria-label="Payout identity verified"
                />
              ) : null}
              {listing.sellerRating != null ? ` · ${listing.sellerRating.toFixed(1)}★` : ""}
            </Link>
          </article>
        ))}
      </div>
    </>
  );
}
