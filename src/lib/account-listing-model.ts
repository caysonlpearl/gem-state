/* eslint-disable @typescript-eslint/no-explicit-any -- shared website/native listing projection */
import type { MyListing } from "./market.functions";
export function listingVariantLabel(
  v: { size: string | null; color: string | null; edition: string | null } | null,
) {
  if (!v) return "One variation";
  const parts = [v.size, v.color, v.edition].filter(Boolean);
  return parts.length ? parts.join(" · ") : "One variation";
}
export function accountListingModel(
  row: Record<string, unknown>,
  context: {
    summary?: any;
    soldAt?: string;
    thumbnailUrl?: string;
    metrics?: any;
    leadCount?: number;
    upgradeStatus?: string | null;
  } = {},
): MyListing {
  const product = row["products"] as { slug: string; name: string; status?: string } | null;
  const summary = context.summary;
  return {
    id: row["id"] as string,
    variantId: row["variant_id"] as string,
    productSlug: product?.slug ?? "",
    productName: product?.name ?? "Unknown product",
    productStatus: (product as { status?: string } | null)?.status ?? null,
    variantLabel: listingVariantLabel(
      row["product_variants"] as {
        size: string | null;
        color: string | null;
        edition: string | null;
      } | null,
    ),
    priceCents: row["price_cents"] as number,
    currency: row["currency"] as string,
    status: row["status"] as string,
    approvedAt: (row["approved_at"] as string | null) ?? null,
    expiresAt: row["expires_at"] as string,
    createdAt: row["created_at"] as string,
    matchedOrderId: (row["matched_order_id"] as string | null) ?? null,
    ...(context.soldAt !== undefined ? { soldAt: context.soldAt } : {}),
    ...(context.thumbnailUrl ? { thumbnailUrl: context.thumbnailUrl } : {}),
    ...(summary
      ? {
          highestBidCents:
            summary.highest_bid_cents == null ? null : Number(summary.highest_bid_cents),
          activeBidCount: Number(summary.active_bid_count ?? 0),
          authorizedBidCount: Number(summary.authorized_bid_count ?? 0),
        }
      : {}),
    ...(context.metrics
      ? {
          impressions: Number(context.metrics?.impressions ?? 0),
          views: Number(context.metrics?.views ?? 0),
        }
      : { impressions: 0, views: 0 }),
    leadCount: context.leadCount ?? 0,
    upgradeStatus: context.upgradeStatus ?? null,
    ...(row["evidence_count"] != null ? { evidenceCount: row["evidence_count"] as number } : {}),
    ...(row["public_media_count"] != null
      ? { publicMediaCount: row["public_media_count"] as number }
      : {}),
    ...(row["payment_authorized"] != null
      ? { paymentAuthorized: row["payment_authorized"] as boolean }
      : {}),
  };
}
