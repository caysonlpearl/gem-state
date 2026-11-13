import type { ListingCardSummary } from "../../../src/lib/listing-card-summary";
import type { MobileListing } from "../../../src/lib/mobile-contract";
export function detailCard(card: ListingCardSummary, canSave = true): MobileListing {
  return {
    id: card.id,
    productId: card.productId,
    title: card.title,
    categorySlug: card.categorySlug ?? "general",
    categoryName: card.categoryName ?? "",
    priceCents: card.priceCents,
    currency: card.currency,
    city: card.city,
    state: card.state,
    imageUrl: card.imageUrl,
    createdAt: card.createdAt,
    canSave,
    display: {
      productSlug: card.productSlug,
      region: card.region,
      condition: card.condition,
      fulfillmentMode: card.fulfillmentMode,
      isFeatured: card.isFeatured,
      vehicle: card.vehicle,
      pet: card.pet,
      home: card.home,
      job: card.job,
      service: card.service,
      dealer: card.dealer,
      vehiclePricing: card.vehiclePricing,
      externalVehicle: card.externalVehicle
        ? { sourceKind: card.externalVehicle.sourceKind }
        : undefined,
      externalHome: card.externalHome,
      externalPet: card.externalPet,
      externalJob: card.externalJob,
      directory: card.directory,
    },
  };
}
