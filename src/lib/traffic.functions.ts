import { createServerFn } from "@tanstack/react-start";

import { brand } from "@/config/brand";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { summarizeTraffic, type TrafficEvent, type TrafficSummary } from "@/lib/traffic-summary";

export type { TrafficRow, TrafficSummary } from "@/lib/traffic-summary";

/**
 * Administrator-only traffic summary: where visits come from and how many of
 * them view a listing or contact a seller. Read through the caller's own
 * client, so the admin-only SELECT policy on analytics_events is the access
 * control (same as the validation summary). Demo events and events from
 * signed-in staff accounts are left out, and so are events from any host other
 * than the live site (dev servers, preview builds). Visits recorded before
 * source tracking shipped have no source and show as "unknown".
 */
const EVENTS = ["visit_started", "listing_viewed", "seller_contacted"] as const;

export const getTrafficSummary = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((input: { windowDays?: number }) => ({
    windowDays: Math.min(Math.max(Math.round(Number(input?.windowDays ?? 30)), 1), 180),
  }))
  .handler(async ({ data, context }): Promise<TrafficSummary> => {
    const { supabase, userId } = context;
    const { data: isAdmin } = await supabase.rpc("has_role", { _user_id: userId, _role: "admin" });
    if (isAdmin !== true) {
      return {
        isAdmin: false,
        ...summarizeTraffic([], {
          staffIds: new Set(),
          domain: brand.domain,
          windowDays: data.windowDays,
        }),
      };
    }

    const since = new Date(Date.now() - data.windowDays * 86_400_000).toISOString();
    const [{ data: events, error }, { data: staff }] = await Promise.all([
      supabase
        .from("analytics_events")
        .select("name, props, user_id")
        .in("name", [...EVENTS])
        .eq("is_demo", false)
        .gte("occurred_at", since)
        .limit(100_000),
      supabase.from("user_roles").select("user_id"),
    ]);
    if (error) throw new Error(error.message);
    return {
      isAdmin: true,
      ...summarizeTraffic((events ?? []) as TrafficEvent[], {
        staffIds: new Set((staff ?? []).map((row) => row.user_id as string)),
        domain: brand.domain,
        windowDays: data.windowDays,
      }),
    };
  });
