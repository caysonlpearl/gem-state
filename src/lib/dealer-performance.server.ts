import type { SupabaseClient } from "@supabase/supabase-js";
import { loadBusinessPerformance } from "./business-performance.server";
import { dealerPerformanceView } from "./dealer-performance";

/** Caller must authorize dealership access before loading this server-only report. */
export async function loadDealerPerformance(admin: SupabaseClient, dealerId: string, days: number) {
  const { data: dealer, error } = await admin
    .from("dealer_profiles")
    .select("slug")
    .eq("id", dealerId)
    .maybeSingle();
  if (error || !dealer) throw Error("Dealership not found.");
  const report = await loadBusinessPerformance(admin, days, { persistAttribution: false });
  return dealerPerformanceView(report, dealer.slug);
}
