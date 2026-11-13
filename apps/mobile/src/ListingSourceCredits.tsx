import {
  PartnerJobsCredit,
  PartnerHomesCredit,
  PartnerVehiclesCredit,
  LogoDevCredit,
} from "../../../src/components/classifieds/ListingCardView";
import type { MobileListing } from "../../../src/lib/mobile-contract";
import { listingPresentation } from "./listing-presentation";
export function ListingSourceCredits({ cards }: { cards: MobileListing[] }) {
  const listings = cards.map(listingPresentation);
  return (
    <>
      <PartnerJobsCredit listings={listings} />
      <PartnerHomesCredit listings={listings} />
      <PartnerVehiclesCredit listings={listings} />
      {cards.some((card) => card.source === "RescueGroups.org") && (
        <p className="mt-3 text-right text-[11px] text-muted-foreground">
          Adoptable pets from{" "}
          <a
            href="https://rescuegroups.org"
            target="_blank"
            rel="noreferrer"
            className="font-semibold text-primary"
          >
            RescueGroups.org
          </a>
        </p>
      )}
      {cards.some((card) => card.display?.directory?.logoUrl) && (
        <div className="mt-2 text-right">
          <LogoDevCredit />
        </div>
      )}
    </>
  );
}
