/* eslint-disable @typescript-eslint/no-explicit-any -- minimal aggregate database projections */
import { withCatalogReadDeadline } from "./catalog-read-deadline.ts";
import type { ClassifiedDetail } from "./classifieds.functions";
/** Public aggregates only. Native requests never invoke the website's IP/browser view recorder. */
export async function mobileListingStats(db: any, card: ClassifiedDetail) {
  const query = (q: any) => withCatalogReadDeadline<any>(q, 5000);
  const partner = /^(adzuna-|fsq-|rescuegroups-)/.test(card.id)
    ? "saved_partner_jobs"
    : /^(openwebninja-|mashvisor-)/.test(card.id)
      ? "saved_partner_homes"
      : /^(marketcheck-|dealerfeed-)/.test(card.id)
        ? "saved_partner_vehicles"
        : null;
  try {
    const [views, favorites] = await Promise.all([
      query(db.from("listing_view_counts").select("views").eq("listing_id", card.id).limit(1)),
      partner
        ? query(
            db
              .from(partner)
              .select("listing_id", { count: "exact", head: true })
              .eq("listing_id", card.id),
          )
        : card.variantId
          ? query(
              db
                .from("watchlist")
                .select("variant_id", { count: "exact", head: true })
                .eq("variant_id", card.variantId),
            )
          : Promise.resolve({ error: true }),
    ]);
    if (views.error || favorites.error || !Number.isFinite(favorites.count)) return null;
    return { views: Number(views.data?.[0]?.views ?? 0), favorites: Number(favorites.count ?? 0) };
  } catch {
    return null;
  }
}

export async function mobileOwnListingClaim(client: any, user: string, card: ClassifiedDetail) {
  const { MobileApiError } = await import("./mobile-api.ts");
  let query;
  if (card.directory && card.categorySlug === "services")
    query = client
      .from("service_directory_claims")
      .select("status,created_at")
      .eq("directory_id", card.id)
      .eq("user_id", user);
  else if (card.externalJob && card.categorySlug === "jobs" && card.job?.employerName) {
    const { employerKey } = await import("./employer-logo-match.ts");
    query = client
      .from("employer_claims")
      .select("status,created_at")
      .eq("employer_key", employerKey(card.job.employerName))
      .eq("user_id", user);
  } else
    throw new MobileApiError(404, "claim_unavailable", "This business cannot be claimed here.");
  const result = await withCatalogReadDeadline<any>(
    (signal) => query.abortSignal(signal).retry(false).maybeSingle(),
    5000,
  );
  if (
    result.error ||
    (result.data && !["pending", "approved", "rejected"].includes(result.data.status))
  )
    throw new MobileApiError(
      503,
      "claim_unavailable",
      "Your claim status could not be checked. Please retry.",
    );
  return result.data
    ? {
        status: result.data.status as "pending" | "approved" | "rejected",
        createdAt: result.data.created_at,
      }
    : null;
}
