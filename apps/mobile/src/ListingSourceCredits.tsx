import { ListingSourceCreditsView } from "../../../src/components/classifieds/ListingSourceCreditsView";
import type { MobileListing } from "../../../src/lib/mobile-contract";
import { listingPresentation } from "./listing-presentation";
export function ListingSourceCredits({
  cards,
  showVehicleCredit = true,
}: {
  cards: readonly MobileListing[];
  showVehicleCredit?: boolean;
}) {
  return (
    <ListingSourceCreditsView
      listings={cards.map(listingPresentation)}
      showVehicleCredit={showVehicleCredit}
    />
  );
}
