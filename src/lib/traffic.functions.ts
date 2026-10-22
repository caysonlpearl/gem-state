import { summarizeConversionVisits } from "./conversion-funnel";
import { createServerFn } from "@tanstack/react-start";
import type { SupabaseClient } from "@supabase/supabase-js";

import { brand } from "@/config/brand";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { eligibleTrafficEvents, summarizeTraffic, type TrafficEvent } from "@/lib/traffic-summary";
import { isOperationalTestRecord, summarizeVitals } from "@/lib/analytics-policy";

export type { TrafficRow, TrafficSummary } from "@/lib/traffic-summary";

/**
 * Administrator-only traffic summary: where visits come from and how many of
 * them view a listing or contact a seller. Event reads use the caller's RLS
 * policy; operational counts use the server client only after the admin check.
 * Demo events and events from
 * signed-in staff accounts are left out, and so are events from any host other
 * than the live site (dev servers, preview builds). Visits recorded before
 * source tracking shipped have no source and show as "unknown".
 */
const EVENTS = [
  "visit_started",
  "search_completed",
  "classified_listing_submit_started",
  "listing_viewed",
  "seller_contacted",
  "inquiry_completed",
  "watchlist_added",
  "classified_listing_submit_succeeded",
  "web_vital",
] as const;

export const getTrafficSummary = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((input: { windowDays?: number }) => ({
    windowDays: Math.min(Math.max(Math.round(Number(input?.windowDays ?? 30)), 1), 180),
  }))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: isAdmin } = await supabase.rpc("has_role", { _user_id: userId, _role: "admin" });
    if (isAdmin !== true) {
      return {
        isAdmin: false,
        vitals: [],
        funnel: summarizeConversionVisits([]),
        operations: { approvedListings: null, sellerSetups: null, claimedSellers: null },
        ...summarizeTraffic([], {
          staffIds: new Set(),
          domain: brand.domain,
          windowDays: data.windowDays,
        }),
      };
    }

    const since = new Date(Date.now() - data.windowDays * 86_400_000).toISOString();
    const until = new Date().toISOString();
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
    const options = { staffIds, domain: brand.domain, windowDays: data.windowDays };
    return {
      isAdmin: true,
      ...summarizeTraffic(events, options),
      vitals: summarizeVitals(eligibleTrafficEvents(events, options)),
      funnel: summarizeConversionVisits(eligibleTrafficEvents(events, options)),
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
  });

