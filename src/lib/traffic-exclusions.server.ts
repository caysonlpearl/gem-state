import type { SupabaseClient } from "@supabase/supabase-js";

/** Server-only: do not expose these browser or visit identifiers in report output. */
export async function loadStaffTrafficExclusions(
  client: SupabaseClient,
  staffIds: Set<string>,
  untilTime = Date.now(),
) {
  const excludedBrowserIds = new Set<string>();
  const excludedVisitIds = new Set<string>();
  if (!staffIds.size) return { excludedBrowserIds, excludedVisitIds };
  const since = new Date(untilTime - 180 * 86400000).toISOString();
  for (let offset = 0; ; offset += 500) {
    const { data, error } = await client
      .from("analytics_events")
      .select("id,session_id,props")
      .in("user_id", [...staffIds])
      .gte("occurred_at", since)
      .lt("occurred_at", new Date(untilTime).toISOString())
      .order("id", { ascending: true })
      .range(offset, offset + 499);
    if (error)
      throw new Error("Could not verify staff-browser exclusions. Please retry the report.");
    for (const event of data ?? []) {
      if (event.session_id) excludedBrowserIds.add(String(event.session_id));
      const visit = (event.props as Record<string, unknown> | null)?.traffic_visit;
      if (typeof visit === "string" && visit) excludedVisitIds.add(visit);
    }
    if ((data?.length ?? 0) < 500) break;
  }
  return { excludedBrowserIds, excludedVisitIds };
}
