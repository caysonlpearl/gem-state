/* eslint-disable @typescript-eslint/no-explicit-any -- server-only cached inventory */
import { shoppingExternalEligibility } from "./shopping.server.ts";
import { mobileListingAllowed } from "./mobile-contract.ts";
/** Phone delivery must not spend listing-provider requests, including details. */
export async function cachedMobilePushListing(db: any, id: string) {
  const result = await db
    .from("shopping_inventory")
    .select("card,valid_until")
    .eq("listing_id", id)
    .gt("valid_until", new Date().toISOString())
    .maybeSingle();
  if (result.error) throw Error("push_inventory_unavailable");
  if (!result.data || !mobileListingAllowed(result.data.card)) return null;
  if (/^[0-9a-f-]{36}$/i.test(id)) {
    const live = await db
      .from("asks")
      .select("id,products!inner(status)")
      .eq("id", id)
      .eq("status", "active")
      .eq("is_demo", false)
      .not("approved_at", "is", null)
      .gt("expires_at", new Date().toISOString())
      .eq("products.status", "published")
      .maybeSingle();
    if (live.error) throw Error("push_native_availability_unavailable");
    if (!live.data) return null;
  }
  if (!(await shoppingExternalEligibility(db, [id])).has(id)) return null;
  return { ...result.data.card, available: true };
}
