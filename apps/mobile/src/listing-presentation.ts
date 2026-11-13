import type { MobileListing } from "../../../src/lib/mobile-contract";
import type { ListingCardSummary } from "../../../src/lib/listing-card-summary";

/** Adapt the stable phone contract to the website's shared rendering model. */
export function listingPresentation(card: MobileListing): ListingCardSummary {
  return {
    productSlug: "",
    region: "",
    condition: "",
    fulfillmentMode: "local_pickup",
    isFeatured: false,
    vehicle: null,
    ...card.display,
    id: card.id,
    title: card.title,
    productId: card.productId,
    priceCents: card.priceCents,
    currency: card.currency,
    city: card.city,
    state: card.state,
    categorySlug: card.categorySlug,
    categoryName: card.categoryName,
    createdAt: card.createdAt,
    imageUrl: card.imageUrl,
  };
}
