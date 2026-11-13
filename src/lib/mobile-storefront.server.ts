/* eslint-disable @typescript-eslint/no-explicit-any -- closed public and authenticated-owner database projections */
import { withCatalogReadDeadline } from "./catalog-read-deadline.ts";
import { MobileApiError } from "./mobile-api.ts";
import {
  mobileStorefrontIdentityAllowed,
  mobileStorefrontReviewAllowed,
} from "./mobile-storefront-contract.ts";
export async function mobileSellerIdentity(db: any, slug: string) {
  const r: any = await withCatalogReadDeadline(
    (signal) =>
      db
        .from("seller_storefronts")
        .select("user_id,slug,display_name,bio")
        .eq("slug", slug)
        .abortSignal(signal)
        .retry(false)
        .maybeSingle(),
    5000,
  );
  if (r.error)
    throw new MobileApiError(
      503,
      "seller_unavailable",
      "Seller details could not be loaded. Please retry.",
    );
  if (!r.data || !mobileStorefrontIdentityAllowed(r.data.display_name, r.data.bio))
    throw new MobileApiError(404, "seller_unavailable", "This seller is unavailable in the app.");
  return { userId: r.data.user_id as string, slug: r.data.slug as string };
}
export async function mobileReviewVisible(db: any, seller: string, id: string) {
  const r: any = await withCatalogReadDeadline(
    (signal) =>
      db
        .from("seller_reviews")
        .select("id,rating,comment")
        .eq("id", id)
        .eq("seller_id", seller)
        .abortSignal(signal)
        .retry(false)
        .maybeSingle(),
    5000,
  );
  if (r.error)
    throw new MobileApiError(
      503,
      "review_unavailable",
      "The review could not be checked. Please retry.",
    );
  if (!r.data || !mobileStorefrontReviewAllowed(r.data))
    throw new MobileApiError(404, "review_unavailable", "This review is unavailable in the app.");
}
export async function mobileReviewRelationship(db: any, user: string, seller: string) {
  if (user === seller)
    throw new MobileApiError(400, "invalid_review", "You cannot review your own profile.");
  const r: any = await withCatalogReadDeadline(
    db
      .from("conversations")
      .select("id,conversation_participants(blocked_at)")
      .or(
        `and(buyer_id.eq.${user},seller_id.eq.${seller}),and(buyer_id.eq.${seller},seller_id.eq.${user})`,
      ),
    5000,
  );
  if (r.error)
    throw new MobileApiError(
      503,
      "review_unavailable",
      "The review could not be saved. Please retry.",
    );
  if (
    (r.data ?? []).some((row: any) => row.conversation_participants?.some((p: any) => p.blocked_at))
  )
    throw new MobileApiError(
      403,
      "review_unavailable",
      "Reviews are unavailable for this member relationship.",
    );
}
/** General dealership threads created by the app are separate from unscoped website chats. */
export async function mobileGeneralDealerContexts(
  db: any,
  user: string,
  conversations: any[],
  ready: boolean,
) {
  const candidates = conversations.filter(
    (c) =>
      !(c.listingId ?? c.listing_id) &&
      !c.dealer_inventory_record_id &&
      [c.buyerId ?? c.buyer_id, c.sellerId ?? c.seller_id].includes(user),
  );
  if (!ready || !candidates.length) return new Set<string>();
  const ids = new Map(candidates.map((c) => [c.id, c]));
  const r: any = await withCatalogReadDeadline(
    db
      .from("mobile_dealer_conversations")
      .select("conversation_id,buyer_id,seller_id,dealer_id")
      .in("conversation_id", [...ids.keys()])
      .or(`buyer_id.eq.${user},seller_id.eq.${user}`),
    5000,
  );
  if (r.error)
    throw new MobileApiError(
      503,
      "conversation_unavailable",
      "Dealership conversations could not be checked. Please retry.",
    );
  return new Set<string>(
    (r.data ?? []).flatMap((row: any) => {
      const c = ids.get(row.conversation_id);
      return c &&
        row.dealer_id &&
        row.buyer_id === (c.buyerId ?? c.buyer_id) &&
        row.seller_id === (c.sellerId ?? c.seller_id)
        ? [row.conversation_id]
        : [];
    }),
  );
}
