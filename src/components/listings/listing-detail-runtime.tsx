import type { ListingActions as WebsiteListingActions } from "@/components/classifieds/ListingActions";
import type { ListingCard as WebsiteListingCard } from "@/components/classifieds/ListingCard";
import type { PartnerHomeHeartButton as WebsiteHomeHeart } from "@/components/community/PartnerHomeHeartButton";
import type { PartnerJobHeartButton as WebsiteJobHeart } from "@/components/community/PartnerJobHeartButton";
import type { PartnerVehicleHeartButton as WebsiteVehicleHeart } from "@/components/community/PartnerVehicleHeartButton";
import type { WatchHeartButton as WebsiteWatchHeart } from "@/components/community/WatchHeartButton";
import type { VehiclePriceInsight as WebsiteVehiclePriceInsight } from "@/components/dealers/VehiclePriceInsight";
import type { trackSellerContact } from "@/lib/analytics";
import type { ClassifiedDetail } from "@/lib/classifieds.functions";
import {
  createContext,
  useContext,
  type AnchorHTMLAttributes,
  type ComponentProps,
  type ComponentType,
} from "react";
export type DetailLinkProps = Omit<AnchorHTMLAttributes<HTMLAnchorElement>, "href"> & {
  to: string;
  search?: Record<string, unknown>;
  params?: Record<string, string>;
};
/** Platform adapters supply behavior; the category layouts remain shared with the website. */
export type ListingDetailRuntime = {
  Link: ComponentType<DetailLinkProps>;
  ListingActions: ComponentType<ComponentProps<typeof WebsiteListingActions>>;
  VehiclePriceInsight: ComponentType<ComponentProps<typeof WebsiteVehiclePriceInsight>>;
  ListingCard: ComponentType<ComponentProps<typeof WebsiteListingCard>>;
  PartnerHomeHeartButton: ComponentType<ComponentProps<typeof WebsiteHomeHeart>>;
  PartnerJobHeartButton: ComponentType<ComponentProps<typeof WebsiteJobHeart>>;
  PartnerVehicleHeartButton: ComponentType<ComponentProps<typeof WebsiteVehicleHeart>>;
  WatchHeartButton: ComponentType<ComponentProps<typeof WebsiteWatchHeart>>;
  AdminBusinessPerformanceLink: ComponentType<{
    sellerSlug?: string;
    dealerSlug?: string;
    businessKey?: string;
  }>;
  FlagListingDialog: ComponentType<{ listingId: string; isMock?: boolean }>;
  ClaimEmployerPanel: ComponentType<{ listing: ClassifiedDetail; employerName: string }>;
  ClaimBusinessPanel: ComponentType<{ listing: ClassifiedDetail }>;
  stats?: { views: number; favorites: number };
  onPhoto: (photo: number) => void;
  onContact: typeof trackSellerContact;
  onPrint?: () => void;
  pageElement?: "main" | "article";
  vehicleHistoryPurchases?: boolean;
};
const Runtime = createContext<ListingDetailRuntime | null>(null);
export const ListingDetailRuntimeProvider = Runtime.Provider;
export function useListingDetailRuntime() {
  const r = useContext(Runtime);
  if (!r) throw Error("Missing listing detail adapter");
  return r;
}
export function DetailLink(props: DetailLinkProps) {
  const C = useListingDetailRuntime().Link;
  return <C {...props} />;
}

export function ListingActions(props: ComponentProps<ListingDetailRuntime["ListingActions"]>) {
  const C = useListingDetailRuntime().ListingActions;
  return <C {...props} />;
}

export function VehiclePriceInsight(
  props: ComponentProps<ListingDetailRuntime["VehiclePriceInsight"]>,
) {
  const C = useListingDetailRuntime().VehiclePriceInsight;
  return <C {...props} />;
}

export function ListingCard(props: ComponentProps<ListingDetailRuntime["ListingCard"]>) {
  const C = useListingDetailRuntime().ListingCard;
  return <C {...props} />;
}

export function PartnerHomeHeartButton(
  props: ComponentProps<ListingDetailRuntime["PartnerHomeHeartButton"]>,
) {
  const C = useListingDetailRuntime().PartnerHomeHeartButton;
  return <C {...props} />;
}

export function PartnerJobHeartButton(
  props: ComponentProps<ListingDetailRuntime["PartnerJobHeartButton"]>,
) {
  const C = useListingDetailRuntime().PartnerJobHeartButton;
  return <C {...props} />;
}

export function PartnerVehicleHeartButton(
  props: ComponentProps<ListingDetailRuntime["PartnerVehicleHeartButton"]>,
) {
  const C = useListingDetailRuntime().PartnerVehicleHeartButton;
  return <C {...props} />;
}

export function WatchHeartButton(props: ComponentProps<ListingDetailRuntime["WatchHeartButton"]>) {
  const C = useListingDetailRuntime().WatchHeartButton;
  return <C {...props} />;
}

export function AdminBusinessPerformanceLink(
  props: ComponentProps<ListingDetailRuntime["AdminBusinessPerformanceLink"]>,
) {
  const C = useListingDetailRuntime().AdminBusinessPerformanceLink;
  return <C {...props} />;
}

export function FlagListingDialog(
  props: ComponentProps<ListingDetailRuntime["FlagListingDialog"]>,
) {
  const C = useListingDetailRuntime().FlagListingDialog;
  return <C {...props} />;
}

export function ClaimEmployerPanel(
  props: ComponentProps<ListingDetailRuntime["ClaimEmployerPanel"]>,
) {
  const C = useListingDetailRuntime().ClaimEmployerPanel;
  return <C {...props} />;
}

export function ClaimBusinessPanel(
  props: ComponentProps<ListingDetailRuntime["ClaimBusinessPanel"]>,
) {
  const C = useListingDetailRuntime().ClaimBusinessPanel;
  return <C {...props} />;
}

/** Preserve one main landmark: native already owns the page's outer main element. */
export function DetailPage(props: import("react").HTMLAttributes<HTMLElement>) {
  const Tag = useListingDetailRuntime().pageElement ?? "main";
  return <Tag {...props} />;
}
