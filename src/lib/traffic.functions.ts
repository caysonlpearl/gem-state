import { summarizeConversionVisits } from "./conversion-funnel";
import { createServerFn } from "@tanstack/react-start";
import type { SupabaseClient } from "@supabase/supabase-js";

import { brand } from "@/config/brand";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { summarizeTraffic } from "@/lib/traffic-summary";

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
export const getTrafficSummary = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((input: { windowDays?: number }) => ({
    windowDays: Math.min(Math.max(Math.round(Number(input?.windowDays ?? 30)), 1), 180),
  }))
  .handler(async ({ data, context }) => {
    const { setResponseHeader } = await import("@tanstack/react-start/server");
    setResponseHeader("Cache-Control", "private, no-store");
    const { supabase, userId } = context;
    const { data: isAdmin } = await supabase.rpc("has_role", { _user_id: userId, _role: "admin" });
    if (isAdmin !== true) {
      return {
        isAdmin: false,
        vitals: [],
        funnel: summarizeConversionVisits([]),
        editorial: [],
        operations: { approvedListings: null, sellerSetups: null, claimedSellers: null },
        ...summarizeTraffic([], {
          staffIds: new Set(),
          domain: brand.domain,
          windowDays: data.windowDays,
        }),
      };
    }

    const { loadTrafficReport } = await import("./traffic-report.server");
    return loadTrafficReport(supabase as unknown as SupabaseClient, data.windowDays);
  });

async function requireTrafficAdmin(context: { supabase: SupabaseClient; userId: string }) {
  const { setResponseHeader } = await import("@tanstack/react-start/server");
  setResponseHeader("Cache-Control", "private, no-store");
  const { data } = await context.supabase.rpc("has_role", {
    _user_id: context.userId,
    _role: "admin",
  });
  if (data !== true) throw new Error("Administrator access required.");
}
export const getSeoReviewReports = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await requireTrafficAdmin(context);
    return (await import("./seo-review-reports.server")).savedSeoReviewReports();
  });
export const saveSeoBaseline = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await requireTrafficAdmin(context);
    return (await import("./seo-review-reports.server")).saveSeoReviewBaseline();
  });
