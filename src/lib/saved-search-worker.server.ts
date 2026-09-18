/* eslint-disable @typescript-eslint/no-explicit-any -- saved-search JSON supports category-specific filters */
import { emailSavedSearchMatch } from "./email-notifications.server";

type SavedSearchRow = {
  id: string;
  user_id: string;
  name: string;
  search: Record<string, unknown>;
  email_alerts: boolean;
  paused: boolean;
};

type ListingRow = {
  id: string;
  created_at: string;
  price_cents: number | null;
  products?: { name?: string; description?: string; categories?: { slug?: string } | null } | null;
  classified_listing_details?: { region?: string; city?: string; state?: string } | null;
};

function text(value: unknown) {
  return String(value ?? "").trim().toLowerCase();
}

function priceCents(value: unknown) {
  const parsed = Number(String(value ?? "").replace(/[$,]/g, ""));
  if (!Number.isFinite(parsed)) return null;
  return parsed > 100_000 ? Math.round(parsed) : Math.round(parsed * 100);
}

function matches(search: Record<string, unknown>, listing: ListingRow) {
  const product = listing.products;
  const details = listing.classified_listing_details;
  const haystack = text(`${product?.name ?? ""} ${product?.description ?? ""}`);
  const query = text(search.q ?? search.query ?? search.keyword);
  if (query && !haystack.includes(query)) return false;

  const category = text(search.category ?? search.categorySlug ?? search.section);
  const listingCategory = text(product?.categories?.slug);
  if (category && category !== "all" && category !== listingCategory) return false;

  const location = text(search.city ?? search.region ?? search.state ?? search.location);
  const listingLocation = text(`${details?.city ?? ""} ${details?.region ?? ""} ${details?.state ?? ""}`);
  if (location && !listingLocation.includes(location)) return false;

  const minimum = priceCents(search.priceMin ?? search.minPrice);
  const maximum = priceCents(search.priceMax ?? search.maxPrice);
  const listingPrice = Number(listing.price_cents ?? 0);
  if (minimum !== null && listingPrice < minimum) return false;
  if (maximum !== null && listingPrice > maximum) return false;
  return true;
}

export async function processSavedSearchAlerts(listingId?: string) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const admin = supabaseAdmin as any;
  const [searchesResult, listingsResult] = await Promise.all([
    admin.from("saved_searches").select("id,user_id,name,search,email_alerts,paused").eq("paused", false).limit(1000),
    admin.from("asks").select("id,created_at,price_cents,products!inner(name,description,categories(slug)),classified_listing_details(region,city,state)").eq("status", "active").not("approved_at", "is", null).gte("created_at", new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString()).limit(500),
  ]);
  if (searchesResult.error) throw new Error(searchesResult.error.message);
  if (listingsResult.error) throw new Error(listingsResult.error.message);

  const listings = (listingsResult.data ?? []).filter((listing: ListingRow) => !listingId || listing.id === listingId) as ListingRow[];
  let matched = 0;
  let emailed = 0;
  for (const search of (searchesResult.data ?? []) as SavedSearchRow[]) {
    for (const listing of listings) {
      if (!matches(search.search ?? {}, listing)) continue;
      const { data: match, error: matchError } = await admin.from("saved_search_matches").upsert({ saved_search_id: search.id, listing_id: listing.id }, { onConflict: "saved_search_id,listing_id", ignoreDuplicates: true }).select("id").maybeSingle();
      if (matchError) throw new Error(matchError.message);
      if (!match?.id) continue;
      matched++;
      const itemName = listing.products?.name ?? "New marketplace listing";
      const listingPath = `/listings/${listing.id}`;
      await admin.from("notifications").insert({ user_id: search.user_id, kind: "saved_search_match", title: "New saved-search match", body: `${itemName} matches “${search.name}”.`, entity_type: "saved_search_match", entity_id: match.id, destination_url: listingPath });
      await admin.from("saved_searches").update({ last_match_at: new Date().toISOString() }).eq("id", search.id);
      if (search.email_alerts) {
        await emailSavedSearchMatch(search.user_id, { searchName: search.name, itemName, price: listing.price_cents == null ? undefined : `$${(Number(listing.price_cents) / 100).toFixed(2)}`, listingPath }, match.id);
        await admin.from("saved_search_matches").update({ emailed_at: new Date().toISOString() }).eq("id", match.id);
        emailed++;
      }
    }
  }
  return { listings: listings.length, matched, emailed };
}
