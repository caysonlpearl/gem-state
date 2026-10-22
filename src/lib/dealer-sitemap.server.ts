import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";

/** Only ready, agreement-accepted dealerships with public live inventory belong in the sitemap. */
type DealerListingReference = { dealer_id?: string | null; updated_at: string };

export async function dealerSitemapEntries(
  reader: Pick<SupabaseClient<Database>, "from">,
  liveListings: readonly DealerListingReference[],
): Promise<{ path: string; lastmod: string }[] | null> {
  // The caller already applied publication, approval, expiry and QA exclusions.
  const newest = new Map<string, string>();
  for (const row of liveListings) {
    if (
      row.dealer_id &&
      (!newest.has(row.dealer_id) || newest.get(row.dealer_id)! < row.updated_at)
    )
      newest.set(row.dealer_id, row.updated_at);
  }
  const ids = [...newest.keys()];
  const entries = new Map<string, string>();
  for (let offset = 0; offset < ids.length; offset += 500) {
    const { data, error } = await reader
      .from("dealer_profiles")
      .select("id,slug,updated_at")
      .in("id", ids.slice(offset, offset + 500))
      .eq("status", "ready")
      .not("agreements_accepted_at", "is", null);
    // A failed read is not proof that every dealership disappeared.
    if (error) return null;
    for (const dealer of data ?? []) {
      const listingUpdated = newest.get(dealer.id);
      if (!listingUpdated || !dealer.slug) continue;
      const lastmod = dealer.updated_at > listingUpdated ? dealer.updated_at : listingUpdated;
      const path = `/dealers/${encodeURIComponent(dealer.slug)}`;
      if (!entries.has(path) || entries.get(path)! < lastmod) entries.set(path, lastmod);
    }
  }
  return [...entries].map(([path, lastmod]) => ({ path, lastmod }));
}
