export type SellerListingStateInput = {
  status: string;
  approvedAt: string | null;
  productStatus?: string | null;
  soldAt?: string | null;
};

/** One status rule for the account totals, filters and cards. */
export function sellerListingState(item: SellerListingStateInput): {
  group: "active" | "pending" | "inactive";
  label: string;
} {
  if (item.soldAt || item.status === "matched") return { group: "inactive", label: "Sold" };
  if (item.productStatus === "rejected") return { group: "inactive", label: "Needs changes" };
  if (item.status === "cancelled") return { group: "inactive", label: "Removed" };
  if (item.status === "expired") return { group: "inactive", label: "Expired" };
  if (item.status === "active" && item.approvedAt) return { group: "active", label: "Active" };
  if (item.status === "pending_review" || (item.status === "active" && !item.approvedAt)) {
    return { group: "pending", label: "Awaiting approval" };
  }
  return { group: "inactive", label: item.status };
}
