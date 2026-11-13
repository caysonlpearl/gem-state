import { DealerStorefrontHeaderView } from "./DealerStorefrontHeaderView";
import { DealerContactPanel } from "@/components/classifieds/DealerContactPanel";
import { AdminBusinessPerformanceLink } from "./AdminBusinessPerformanceLink";
import { businessForListing } from "@/lib/business-performance";
import { trackBusinessEvent } from "@/lib/business-analytics";
import type { PublicDealerProfile } from "@/lib/dealer.functions";
export function DealerStorefrontHeader({ dealer }: { dealer: PublicDealerProfile }) {
  const business = businessForListing({
    id: "dealer-profile:" + dealer.slug,
    city: dealer.city ?? "",
    state: dealer.state ?? "",
    dealer: {
      slug: dealer.slug,
      displayName: dealer.displayName,
      website: dealer.website,
      city: dealer.city,
      state: dealer.state,
    },
  });
  return (
    <DealerStorefrontHeaderView
      dealer={dealer}
      onAction={(method) => trackBusinessEvent("business_action", business, { method })}
      ContactPanel={(props) => <DealerContactPanel {...props} business={business ?? undefined} />}
      AdminLink={AdminBusinessPerformanceLink}
    />
  );
}
