import { withCatalogReadDeadline } from "./catalog-read-deadline.ts";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "../integrations/supabase/types.ts";
import {
  productForFeed,
  serializeProductFeed,
  type FeedListing,
  type FeedSeller,
  CHATGPT_FEED_STATES,
} from "./chatgpt-product-feed.ts";

const PAGE_SIZE = 500;
const MAX_ROWS = 10_000;
/** Only the approved native catalog. No calls to providers, writes, or paid API usage. */
export async function readChatgptProductFeed(db: SupabaseClient<Database>, now = Date.now()) {
  const listings: FeedListing[] = [];
  const deadline = now + 30_000;
  for (let offset = 0; ; offset += PAGE_SIZE) {
    if (offset >= MAX_ROWS || Date.now() > deadline) throw new Error("Feed read limit reached");
    const { data, error } = await withCatalogReadDeadline<{ data: unknown; error: unknown }>(
      db
        .from("asks")
        .select(
          "id,seller_id,price_cents,currency,item_condition,status,approved_at,expires_at,is_demo," +
            "products!inner(name,description,status,is_demo,brands(name),categories!inner(slug,name))," +
            "classified_listing_details!inner(city,state,item_details,vehicle_make),listing_media(position)",
        )
        .eq("status", "active")
        .eq("is_demo", false)
        .not("approved_at", "is", null)
        .gt("expires_at", new Date(now).toISOString())
        .eq("products.status", "published")
        .eq("products.is_demo", false)
        .in("classified_listing_details.state", [...CHATGPT_FEED_STATES])
        .order("id", { ascending: true })
        .range(offset, offset + PAGE_SIZE - 1),
    );
    if (error || !Array.isArray(data)) throw new Error("Feed inventory unavailable");
    listings.push(...(data as FeedListing[]));
    if (data.length < PAGE_SIZE) break;
  }
  const sellers = new Map<string, FeedSeller>();
  const ids = [...new Set(listings.map((row) => row.seller_id))];
  for (let offset = 0; offset < ids.length; offset += PAGE_SIZE) {
    if (Date.now() > deadline) throw new Error("Feed read deadline reached");
    const { data, error } = await withCatalogReadDeadline<{ data: unknown; error: unknown }>(
      db
        .from("seller_storefronts")
        .select("user_id,display_name,slug")
        .in("user_id", ids.slice(offset, offset + PAGE_SIZE)),
    );
    if (error || !Array.isArray(data)) throw new Error("Feed sellers unavailable");
    for (const seller of data as FeedSeller[])
      if (seller.user_id) sellers.set(seller.user_id, seller);
  }
  const products = [];
  const excluded: Record<string, number> = {};
  for (const row of listings) {
    const decision = productForFeed(row, sellers, now);
    if ("product" in decision) products.push(decision.product);
    else excluded[decision.excluded] = (excluded[decision.excluded] ?? 0) + 1;
  }
  return {
    csv: serializeProductFeed(products),
    count: products.length,
    scanned: listings.length,
    excluded,
  };
}

export async function chatgptFeedResponse(db: SupabaseClient<Database>) {
  try {
    const feed = await readChatgptProductFeed(db);
    return new Response(feed.csv, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Cache-Control": "public, max-age=300, must-revalidate",
        "Content-Disposition": 'inline; filename="bluebird-chatgpt-products.csv"',
        "X-Content-Type-Options": "nosniff",
        "X-Robots-Tag": "noindex",
        "X-Bluebird-Feed-Version": "2026-11-13-v1",
        "X-Bluebird-Feed-Items": String(feed.count),
      },
    });
  } catch {
    // Never cache an incomplete snapshot or disclose database errors/credentials.
    return new Response("Product feed temporarily unavailable", {
      status: 503,
      headers: {
        "Cache-Control": "no-store",
        "Retry-After": "120",
        "Content-Type": "text/plain; charset=utf-8",
      },
    });
  }
}
