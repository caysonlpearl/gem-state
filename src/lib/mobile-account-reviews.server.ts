/* eslint-disable @typescript-eslint/no-explicit-any -- closed private review projection */
import { MobileApiError } from "./mobile-api.ts";
import {
  mobileStorefrontReviewAllowed,
  mobileStorefrontIdentityAllowed,
} from "./mobile-storefront-contract.ts";
import type { SellerReview } from "./seller.functions";
export type MobileAccountReviews = {
  ownerId: string;
  reviews: SellerReview[];
  sellerSlug: string | null;
  ratingAverage: number | null;
};
const unavailable = () =>
  new MobileApiError(503, "reviews_unavailable", "Your reviews could not be loaded. Please retry.");
/** Same latest-20 window as the website, without payout, buyer or reviewer identity reads. */
export async function loadMobileAccountReviews(
  client: any,
  ownerId: string,
): Promise<MobileAccountReviews> {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(ownerId))
    throw unavailable();
  const signal = AbortSignal.timeout(8000);
  try {
    const [result, profile] = await Promise.all([
      client
        .from("seller_reviews")
        .select("id,seller_id,rating,comment,created_at", { count: "exact" })
        .eq("seller_id", ownerId)
        .order("created_at", { ascending: false })
        .order("id")
        .limit(20)
        .abortSignal(signal)
        .retry(false),
      client
        .from("seller_storefronts")
        .select("user_id,slug,display_name,bio")
        .eq("user_id", ownerId)
        .abortSignal(signal)
        .retry(false)
        .maybeSingle(),
    ]);
    signal.throwIfAborted();
    if (
      result.error !== null ||
      !Array.isArray(result.data) ||
      !Number.isSafeInteger(result.count) ||
      result.count < 0 ||
      result.data.length !== Math.min(result.count, 20)
    )
      throw unavailable();
    if (
      profile.error !== null ||
      profile.data === undefined ||
      (profile.data !== null &&
        (profile.data.user_id !== ownerId ||
          typeof profile.data.slug !== "string" ||
          !/^[a-z0-9][a-z0-9-]{0,59}$/.test(profile.data.slug)))
    )
      throw unavailable();
    const sellerSlug =
      profile.data && mobileStorefrontIdentityAllowed(profile.data.display_name, profile.data.bio)
        ? profile.data.slug
        : null;
    const seen = new Set<string>();
    const reviews: SellerReview[] = [];
    for (const row of result.data) {
      if (
        !row ||
        row.seller_id !== ownerId ||
        typeof row.id !== "string" ||
        !row.id ||
        seen.has(row.id) ||
        !Number.isInteger(row.rating) ||
        row.rating < 1 ||
        row.rating > 5 ||
        (row.comment !== null && typeof row.comment !== "string") ||
        typeof row.created_at !== "string" ||
        !Number.isFinite(Date.parse(row.created_at))
      )
        throw unavailable();
      seen.add(row.id);
      if (mobileStorefrontReviewAllowed(row))
        reviews.push({
          id: row.id,
          rating: row.rating,
          comment: row.comment,
          createdAt: row.created_at,
        });
    }
    return {
      ownerId,
      reviews,
      sellerSlug,
      ratingAverage: reviews.length
        ? reviews.reduce((sum, row) => sum + row.rating, 0) / reviews.length
        : null,
    };
  } catch {
    throw unavailable();
  }
}
