/* eslint-disable @typescript-eslint/no-explicit-any -- tables added after the generated types */
import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { serverEnv } from "./runtime-env.server";

export type ListingStats = { views: number; favorites: number };

const LISTING_ID =
  /^([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}|adzuna-\d{1,20}|mashvisor-\d{1,15}|openwebninja-\d{1,20})$/;
const BOT = /bot|crawl|spider|slurp|preview|lighthouse|headless|monitor|curl|wget|python/i;

async function sha256(text: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/**
 * Counts this page view (once per visitor per listing per day; crawlers
 * don't count) and returns the listing's views and how many members saved
 * it. The visitor is a salted hash of IP, browser and date; none of those
 * are stored.
 */
export const recordListingView = createServerFn({ method: "POST" })
  .validator((input: { listingId: string }) => {
    const listingId = String(input?.listingId ?? "");
    if (!LISTING_ID.test(listingId)) throw new Error("Listing not found.");
    return { listingId };
  })
  .handler(async ({ data }): Promise<ListingStats> => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const db = supabaseAdmin as any;
    const headers = getRequest()?.headers;
    const agent = headers?.get("user-agent") ?? "";
    const ip =
      headers?.get("cf-connecting-ip") ??
      headers?.get("x-forwarded-for")?.split(",")[0]?.trim() ??
      "";

    let views = 0;
    if (ip && agent && !BOT.test(agent)) {
      const salt = serverEnv("VIEW_HASH_SALT") || serverEnv("SUPABASE_SERVICE_ROLE_KEY");
      const day = new Date().toISOString().slice(0, 10);
      const visitor = await sha256(`${salt}|${day}|${ip}|${agent}`);
      const { data: total } = await db.rpc("record_listing_view", {
        _listing_id: data.listingId,
        _visitor_hash: visitor,
      });
      views = Number(total ?? 0);
    } else {
      const { data: row } = await db
        .from("listing_view_counts")
        .select("views")
        .eq("listing_id", data.listingId)
        .maybeSingle();
      views = Number(row?.views ?? 0);
    }

    let favorites = 0;
    if (data.listingId.startsWith("adzuna-")) {
      const { count } = await db
        .from("saved_partner_jobs")
        .select("listing_id", { count: "exact", head: true })
        .eq("listing_id", data.listingId);
      favorites = count ?? 0;
    } else if (
      data.listingId.startsWith("mashvisor-") ||
      data.listingId.startsWith("openwebninja-")
    ) {
      const { count } = await db
        .from("saved_partner_homes")
        .select("listing_id", { count: "exact", head: true })
        .eq("listing_id", data.listingId);
      favorites = count ?? 0;
    } else {
      const { data: ask } = await db
        .from("asks")
        .select("variant_id")
        .eq("id", data.listingId)
        .maybeSingle();
      if (ask?.variant_id) {
        const { count } = await db
          .from("watchlist")
          .select("variant_id", { count: "exact", head: true })
          .eq("variant_id", ask.variant_id);
        favorites = count ?? 0;
      }
    }
    return { views, favorites };
  });
