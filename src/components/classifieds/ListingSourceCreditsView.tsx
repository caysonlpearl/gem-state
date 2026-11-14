import {
  PartnerJobsCredit,
  PartnerHomesCredit,
  PartnerVehiclesCredit,
  LogoDevCredit,
} from "./ListingCardView";
import type { ListingCardSummary } from "@/lib/listing-card-summary";

/** Attribute the public listings actually rendered in a group, without provider reads. */
export function ListingSourceCreditsView({
  listings,
  showVehicleCredit = true,
}: {
  listings: readonly ListingCardSummary[];
  showVehicleCredit?: boolean;
}) {
  return (
    <>
      <PartnerJobsCredit listings={listings} />
      <PartnerHomesCredit listings={listings} />
      {showVehicleCredit && <PartnerVehiclesCredit listings={listings} />}
      {listings.some((listing) => listing.id.startsWith("rescuegroups-")) && (
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
      {listings.some((listing) => listing.directory?.logoUrl) && (
        <div className="mt-2 text-right">
          <LogoDevCredit />
        </div>
      )}
    </>
  );
}
