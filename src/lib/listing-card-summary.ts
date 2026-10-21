import type { ClassifiedCard } from "./classifieds.functions";

// Card rendering needs the source badge, not detail-page media/history/raw data.
export type ListingCardSummary = Omit<ClassifiedCard, "externalVehicle"> & {
  externalVehicle?: Pick<NonNullable<ClassifiedCard["externalVehicle"]>, "sourceKind">;
};

export function listingCardSummary(card: ClassifiedCard): ListingCardSummary {
  const { externalVehicle, ...summary } = card;
  return externalVehicle
    ? { ...summary, externalVehicle: { sourceKind: externalVehicle.sourceKind } }
    : summary;
}
