import type { SupabaseClient } from "@supabase/supabase-js";
import { brand } from "@/config/brand";
import { eligibleTrafficEvents, summarizeTraffic, type TrafficEvent } from "./traffic-summary";
import { isOperationalTestRecord, summarizeVitals } from "./analytics-policy";
import { summarizeConversionVisits } from "./conversion-funnel";
import { summarizeEditorialTraffic } from "./editorial-traffic";

const EVENTS = [
  "media_article_viewed",
  "media_cta_clicked",
  "visit_started",
  "search_completed",
  "classified_listing_submit_started",
  "classified_listing_started",
  "listing_viewed",
  "seller_contacted",
  "inquiry_completed",
  "watchlist_added",
  "classified_listing_submit_succeeded",
  "web_vital",
] as const;

export async function loadTrafficReport(
  supabase: SupabaseClient,
  windowDays: number,
  untilTime = Date.now(),
) {
  const since = new Date(untilTime - windowDays * 86_400_000).toISOString();
  const until = new Date(untilTime).toISOString();
  const { data: staff, error: staffError } = await supabase
    .from("user_roles")
    .select("user_id")
    .in("role", ["admin", "moderator"]);
  if (staffError) throw new Error("Could not load staff exclusions. Please retry the report.");
  const events: TrafficEvent[] = [];
  for (let offset = 0; ; offset += 500) {
    const { data: batch, error } = await supabase
      .from("analytics_events")
      .select("id, name, props, user_id, occurred_at")
      .in("name", [...EVENTS])
      .eq("is_demo", false)
      .gte("occurred_at", since)
      .lt("occurred_at", until)
      .order("occurred_at", { ascending: true })
      .order("id", { ascending: true })
      .range(offset, offset + 499);
    if (error) throw new Error(error.message);
    events.push(...((batch ?? []) as TrafficEvent[]));
    if ((batch?.length ?? 0) < 500) break;
  }
  const staffIds = new Set((staff ?? []).map((row) => row.user_id as string));
  // Operational milestones come from saved records, not a click or a signup attempt.
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const admin = supabaseAdmin as unknown as SupabaseClient;
  const readAll = async (
    query: (offset: number) => PromiseLike<{
      data: unknown[] | null;
      error: unknown;
    }>,
  ) => {
    const rows: Record<string, unknown>[] = [];
    for (let offset = 0; ; offset += 500) {
      const result = await query(offset);
      if (result.error) return null;
      rows.push(...((result.data ?? []) as Record<string, unknown>[]));
      if ((result.data?.length ?? 0) < 500) return rows;
    }
  };
  const [approved, setups, claimed] = await Promise.all([
    readAll((offset) =>
      admin
        .from("asks")
        .select("id,seller_id,products!inner(name)")
        .eq("is_demo", false)
        .gte("approved_at", since)
        .lt("approved_at", until)
        .order("id")
        .range(offset, offset + 499),
    ),
    readAll((offset) =>
      admin
        .from("seller_profiles")
        .select("user_id,slug")
        .gte("terms_accepted_at", since)
        .lt("terms_accepted_at", until)
        .order("user_id")
        .range(offset, offset + 499),
    ),
    readAll((offset) =>
      admin
        .from("managed_import_sellers")
        .select("id,owner_user_id,display_name")
        .gte("claimed_at", since)
        .lt("claimed_at", until)
        .order("id")
        .range(offset, offset + 499),
    ),
  ]);
  const realSeller = (id: unknown) => !staffIds.has(String(id));
  const options = { staffIds, domain: brand.domain, windowDays: windowDays };
  return {
    isAdmin: true,
    period: { since, until },
    ...summarizeTraffic(events, options),
    vitals: summarizeVitals(eligibleTrafficEvents(events, options)),
    funnel: summarizeConversionVisits(eligibleTrafficEvents(events, options)),
    editorial: summarizeEditorialTraffic(eligibleTrafficEvents(events, options)),
    operations: {
      approvedListings:
        approved?.filter((row) => {
          const product = row.products as { name?: string } | null;
          return realSeller(row.seller_id) && !isOperationalTestRecord(product?.name);
        }).length ?? null,
      sellerSetups:
        setups?.filter((row) => realSeller(row.user_id) && !isOperationalTestRecord(row.slug))
          .length ?? null,
      claimedSellers:
        claimed?.filter(
          (row) => realSeller(row.owner_user_id) && !isOperationalTestRecord(row.display_name),
        ).length ?? null,
    },
  };
}
