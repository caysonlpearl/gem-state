import { businessForListing, type BusinessIdentity } from "./business-performance.ts";
import type { ClassifiedCard } from "./classifieds.functions";

// Card rendering needs the source badge, not detail-page media/history/raw data.
export type ListingCardSummary = Omit<ClassifiedCard, "externalVehicle"> & {
  landingKeywords?: string[];
  businessAttribution?: BusinessIdentity;
  externalVehicle?: Pick<NonNullable<ClassifiedCard["externalVehicle"]>, "sourceKind">;
};

export function listingCardSummary(card: ClassifiedCard): ListingCardSummary {
  const { externalVehicle, ...summary } = card;
  const business = businessForListing(card);
  const attribution = business ? { businessAttribution: business } : {};
  return externalVehicle
    ? {
        ...summary,
        ...attribution,
        externalVehicle: { sourceKind: externalVehicle.sourceKind },
      }
    : { ...summary, ...attribution };
}
