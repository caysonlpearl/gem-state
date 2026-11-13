import {
  mobileListingAllowed,
  mobileMediaUrl,
  mobileCatalogLinkAllowed,
} from "./mobile-contract.ts";
import type { ClassifiedCard } from "./classifieds.functions";
import type { PublicListing, PublicSeller, SellerReview } from "./seller.functions";
import type { PublicDealerProfile } from "./dealer.functions";
export const mobileStorefrontIdentityAllowed = (name: unknown, description: unknown) =>
  typeof name === "string" &&
  !!name.trim() &&
  mobileListingAllowed({
    categorySlug: "general",
    title: name,
    description: typeof description === "string" ? description : null,
  });
export const mobileStorefrontCardAllowed = (card: ClassifiedCard) => mobileListingAllowed(card);
type StorefrontAsk = {
  status?: unknown;
  approved_at?: unknown;
  is_demo?: unknown;
  expires_at?: string | null;
  products?: {
    status?: unknown;
    name?: unknown;
    description?: unknown;
    categories?: { slug?: unknown } | null;
  } | null;
};
export function mobileStorefrontAskAllowed(row: StorefrontAsk) {
  return (
    row.status === "active" &&
    Boolean(row.approved_at) &&
    row.is_demo === false &&
    Date.parse(row.expires_at ?? "") > Date.now() &&
    row.products?.status === "published" &&
    mobileListingAllowed({
      categorySlug: row.products?.categories?.slug,
      title: row.products?.name,
      description: row.products?.description,
    })
  );
}
export const mobileStorefrontReviewAllowed = (row: { rating: unknown; comment?: unknown }) =>
  Number.isFinite(Number(row.rating)) &&
  Number(row.rating) >= 1 &&
  Number(row.rating) <= 5 &&
  mobileListingAllowed({
    categorySlug: "general",
    title: typeof row.comment === "string" ? row.comment : "",
  });
export function mobilePublicReview(r: SellerReview): SellerReview {
  return {
    id: r.id,
    rating: r.rating,
    comment: r.comment,
    createdAt: r.createdAt,
    ...(r.reviewerName ? { reviewerName: r.reviewerName } : {}),
    ...(r.reviewerAvatarUrl ? { reviewerAvatarUrl: mobileMediaUrl(r.reviewerAvatarUrl) } : {}),
  };
}
export function mobilePublicSeller(s: PublicSeller): PublicSeller {
  return {
    userId: s.userId,
    slug: s.slug,
    displayName: s.displayName,
    avatarUrl: mobileMediaUrl(s.avatarUrl),
    bio: s.bio,
    memberSince: s.memberSince,
    payoutVerified: s.payoutVerified,
    managedByBluebird: s.managedByBluebird === true,
    completedSalesCount: s.completedSalesCount,
    reviewCount: s.reviewCount,
    ratingAverage: s.ratingAverage,
    activeListingCount: s.listings.length,
    listings: s.listings.map(mobilePublicSellerListing),
    reviews: s.reviews.filter(mobileStorefrontReviewAllowed).map(mobilePublicReview),
  };
}
export function mobilePublicSellerListing(r: PublicListing): PublicListing {
  return {
    id: r.id,
    categorySlug: r.categorySlug,
    productId: r.productId,
    variantId: r.variantId,
    productSlug: r.productSlug,
    productName: r.productName,
    variantLabel: r.variantLabel,
    priceCents: r.priceCents,
    currency: r.currency,
    condition: r.condition,
    note: r.note,
    sellerSlug: r.sellerSlug,
    sellerDisplayName: r.sellerDisplayName,
    payoutVerified: r.payoutVerified,
    sellerRating: r.sellerRating,
    imageUrls: r.imageUrls.flatMap((u) => {
      const safe = mobileMediaUrl(u);
      return safe ? [safe] : [];
    }),
    thumbnailUrl: mobileMediaUrl(r.thumbnailUrl) ?? undefined,
    createdAt: r.createdAt,
    shipFromCity: r.shipFromCity,
    shipFromRegion: r.shipFromRegion,
    shipFromCountry: r.shipFromCountry,
    shippingMethod: r.shippingMethod,
    handlingTimeDays: r.handlingTimeDays,
  };
}
const phone = (value: string | null) => (value && /^[+\d().\s-]{3,80}$/.test(value) ? value : null);
const website = (value: string | null) => {
  const safe = mobileMediaUrl(value && !/^[a-z]+:/i.test(value) ? `https://${value}` : value);
  return safe && mobileCatalogLinkAllowed(safe) ? safe : null;
};
export function mobilePublicDealer(
  d: PublicDealerProfile,
  cards: ClassifiedCard[],
): PublicDealerProfile {
  return {
    id: d.id,
    legalName: d.legalName,
    displayName: d.displayName,
    slug: d.slug,
    phone: phone(d.phone),
    email: d.email && /^[^@\s?&#]+@[^@\s?&#]+\.[^@\s?&#]+$/.test(d.email) ? d.email : null,
    website: website(d.website),
    addressLine1: d.addressLine1,
    city: d.city,
    state: d.state,
    postalCode: d.postalCode,
    logoUrl: mobileMediaUrl(d.logoUrl),
    description: d.description,
    listings: cards,
    listingCount: d.listingCount ?? cards.length,
    page: d.page ?? 1,
    pageCount: d.pageCount ?? 1,
    pageSize: d.pageSize,
    messagingEnabled: d.messagingEnabled === true,
    ownerUserId: d.ownerUserId,
  };
}
