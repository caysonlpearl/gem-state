import type { SupabaseClient } from "@supabase/supabase-js";
import { brand } from "@/config/brand";
import { eligibleTrafficEvents, summarizeTraffic, type TrafficEvent } from "./traffic-summary";
import { isOperationalTestRecord, summarizeVitals } from "./analytics-policy";
import { summarizeConversionVisits } from "./conversion-funnel";
import { summarizeEditorialTraffic } from "./editorial-traffic";

const EVENTS = [
  "media_article_viewed",
  "media_cta_clicked",
  "visit_engaged",
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
const EVENT_PAGE_SIZE = 6000;

async function readTrafficEvents(
  supabase: SupabaseClient,
  since: string,
  until: string,
  signal: AbortSignal,
) {
  const events: TrafficEvent[] = [];
  let cursor: TrafficEvent | undefined;
  for (;;) {
    const { data, error } = await supabase
      .rpc("traffic_report_event_page", {
        p_since: since,
        p_until: until,
        p_names: [...EVENTS],
        p_limit: EVENT_PAGE_SIZE,
        ...(cursor ? { p_after_at: cursor.occurred_at, p_after_id: cursor.id } : {}),
      })
      .abortSignal(signal)
      .retry(false);
    if (error || !Array.isArray(data))
      throw new Error("Could not read traffic events. Please retry the report.");
    const batch = data as TrafficEvent[];
    events.push(...batch);
    if (batch.length < EVENT_PAGE_SIZE) return events;
    const last = batch[batch.length - 1];
    if (!last.id || !last.occurred_at || last.id === cursor?.id)
      throw new Error("Could not continue reading traffic events. Please retry the report.");
    cursor = last;
  }
}

export async function loadTrafficReport(
  supabase: SupabaseClient,
  windowDays: number,
  untilTime = Date.now(),
  requestSignal?: AbortSignal,
) {
  const deadline = AbortSignal.timeout(35_000);
  const signal = requestSignal ? AbortSignal.any([requestSignal, deadline]) : deadline;
  const sinceTime = untilTime - windowDays * 86_400_000;
  const since = new Date(sinceTime).toISOString();
  const until = new Date(untilTime).toISOString();
  const { data: staff, error: staffError } = await supabase
    .from("user_roles")
    .select("user_id")
    .in("role", ["admin", "moderator"])
    .abortSignal(signal)
    .retry(false);
  if (staffError) throw new Error("Could not load staff exclusions. Please retry the report.");
  const staffIds = new Set((staff ?? []).map((row) => row.user_id as string));
  // Each half-open range is independently ordered. Several reads can move
  // forward together without offset scans or overlapping boundary events.
  const rangeCount = Math.min(4, Math.ceil(windowDays / 4));
  const rangeBoundary = (index: number) =>
    new Date(sinceTime + Math.floor(((untilTime - sinceTime) * index) / rangeCount)).toISOString();
  const eventRanges = Array.from({ length: rangeCount }, (_, index) =>
    readTrafficEvents(supabase, rangeBoundary(index), rangeBoundary(index + 1), signal),
  );
  const [{ data: exclusions, error: exclusionError }, batches] = await Promise.all([
    supabase
      .rpc("traffic_report_staff_exclusions", { p_until: until, p_staff_ids: [...staffIds] })
      .abortSignal(signal)
      .retry(false),
    Promise.all(eventRanges),
  ]);
  if (
    exclusionError ||
    !Array.isArray(exclusions?.browserIds) ||
    !Array.isArray(exclusions?.visitIds)
  )
    throw new Error("Could not verify staff-browser exclusions. Please retry the report.");
  const events = batches.flat();
  // Operational milestones come from saved records, not a click or a signup attempt.
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
      supabase
        .from("asks")
        .select("id,seller_id,products!inner(name)")
        .eq("is_demo", false)
        .gte("approved_at", since)
        .lt("approved_at", until)
        .order("id")
        .range(offset, offset + 499)
        .abortSignal(signal)
        .retry(false),
    ),
    readAll((offset) =>
      supabase
        .from("seller_profiles")
        .select("user_id,slug")
        .gte("terms_accepted_at", since)
        .lt("terms_accepted_at", until)
        .order("user_id")
        .range(offset, offset + 499)
        .abortSignal(signal)
        .retry(false),
    ),
    readAll((offset) =>
      supabase
        .from("managed_import_sellers")
        .select("id,owner_user_id,display_name")
        .gte("claimed_at", since)
        .lt("claimed_at", until)
        .order("id")
        .range(offset, offset + 499)
        .abortSignal(signal)
        .retry(false),
    ),
  ]);
  const realSeller = (id: unknown) => !staffIds.has(String(id));
  const options = {
    staffIds,
    excludedBrowserIds: new Set<string>(exclusions.browserIds),
    excludedVisitIds: new Set<string>(exclusions.visitIds),
    domain: brand.domain,
    windowDays,
  };
  const eligible = eligibleTrafficEvents(events, options);
  return {
    isAdmin: true,
    period: { since, until },
    ...summarizeTraffic(events, options, eligible),
    vitals: summarizeVitals(eligible),
    funnel: summarizeConversionVisits(eligible),
    editorial: summarizeEditorialTraffic(eligible),
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
