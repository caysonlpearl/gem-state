/* eslint-disable @typescript-eslint/no-explicit-any -- minimal private listing projection */
import { withCatalogReadDeadline } from "./catalog-read-deadline.ts";
import { MobileApiError } from "./mobile-api.ts";
import { mobileListingAllowed } from "./mobile-contract.ts";
export const isNativeConversationListing = (id: string) =>
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id);
/** Caller must already authorize the conversation participant. Expiry prevents
 * new shopping actions, not access to the participant's retained conversation. */
export async function mobileNativeConversationListings(db: any, ids: string[]) {
  const native = [...new Set(ids.filter(isNativeConversationListing))];
  if (!native.length) return new Set<string>();
  const r = await withCatalogReadDeadline<any>(
    db
      .from("asks")
      .select("id,is_demo,products(name,description,categories(slug))")
      .in("id", native),
    5000,
  );
  if (r.error)
    throw new MobileApiError(
      503,
      "conversation_unavailable",
      "Conversation details are temporarily unavailable. Please retry.",
    );
  return new Set<string>(
    (r.data ?? [])
      .filter(
        (row: any) =>
          !row.is_demo &&
          mobileListingAllowed({
            categorySlug: row.products?.categories?.slug,
            title: row.products?.name,
            description: row.products?.description,
          }),
      )
      .map((row: any) => row.id),
  );
}
