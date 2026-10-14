import { brand } from "@/config/brand";

/**
 * A seller's shareable storefront link and website badge. The short ref tag
 * lets the admin traffic page credit visits and contacts to the seller's own
 * sharing ("Seller share links", source = the seller); canonical tags drop
 * it, so search engines still see one clean URL.
 */
export function sellerShareUrl(slug: string, ref: "share" | "badge" = "share") {
  return `${brand.urls.siteUrl}/sellers/${encodeURIComponent(slug)}?ref=${ref}`;
}

export const SELLER_SHARE_IMAGE = "/images/share/seller-share.jpg";
export const SELLER_BADGE_IMAGE = "/images/share/shop-on-bluebird-badge.png";

function escapeAttribute(value: string) {
  return value.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");
}

/** HTML a seller can paste into their own website. */
export function sellerBadgeHtml(slug: string, displayName: string) {
  const label = escapeAttribute(`Shop ${displayName}'s listings on ${brand.name}`);
  return `<a href="${escapeAttribute(sellerShareUrl(slug, "badge"))}" title="${label}"><img src="${brand.urls.siteUrl}${SELLER_BADGE_IMAGE}" alt="${label}" width="220" height="64"></a>`;
}

/** A ready-to-post caption for social media. */
export function sellerShareCaption(activeListingCount: number) {
  const count =
    activeListingCount === 1
      ? "a listing"
      : activeListingCount > 1
        ? `${activeListingCount} listings`
        : "my listings";
  return `I've got ${count} up on Bluebird, Idaho's local marketplace. Take a look and message me there if anything catches your eye:`;
}
