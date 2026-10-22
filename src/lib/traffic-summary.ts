/**
 * Pure aggregation behind the admin traffic page, kept free of app imports so
 * it can be unit-tested. See traffic.functions.ts for how events are loaded.
 */
export type TrafficRow = {
  channel: string;
  source: string;
  visits: number;
  listingViews: number;
  contacts: number;
  /** Distinct visits that contacted at least one seller. */
  contactingVisits: number;
};

export type TrafficSummary = {
  isAdmin: boolean;
  windowDays: number;
  totals: TrafficRow;
  byChannel: TrafficRow[];
  bySource: TrafficRow[];
  contactMethods: { method: string; count: number }[];
  topLandingPages: { path: string; visits: number; fromSearchOrAi: number }[];
  conversions: { inquiriesSent: number; saveActions: number; listingsSubmitted: number };
};

export type TrafficEvent = { name: string; props: unknown; user_id: string | null; occurred_at?: string };

function emptyRow(channel: string, source: string): TrafficRow {
  return { channel, source, visits: 0, listingViews: 0, contacts: 0, contactingVisits: 0 };
}

/** Exclude the whole staff/QA visit, including its anonymous pre-login events. */
export function eligibleTrafficEvents(
  events: TrafficEvent[],
  options: { staffIds: Set<string>; domain: string },
) {
  const excludedVisits = new Set<string>();
  const excluded = (event: TrafficEvent) => {
    const props = (event.props ?? {}) as Record<string, unknown>;
    const host = String(props.site_host ?? "").replace(/^www\./, "");
    return (
      Boolean(event.user_id && options.staffIds.has(event.user_id)) ||
      props.is_internal === true ||
      props.is_bot === true ||
      Boolean(host && host !== options.domain)
    );
  };
  for (const event of events) {
    const props = (event.props ?? {}) as Record<string, unknown>;
    if (excluded(event) && props.traffic_visit) excludedVisits.add(String(props.traffic_visit));
  }
  const seen = new Set<string>();
  return events.filter((event) => {
    const props = (event.props ?? {}) as Record<string, unknown>;
    if (excluded(event) || excludedVisits.has(String(props.traffic_visit))) return false;
    const id = props.event_id ?? (event.name === "visit_started" ? props.traffic_visit : undefined);
    if (!id) return true;
    const key = `${event.name}:${id}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export function summarizeTraffic(
  events: TrafficEvent[],
  options: { staffIds: Set<string>; domain: string; windowDays: number },
): Omit<TrafficSummary, "isAdmin"> {
  const { staffIds, domain } = options;
  const summary: Omit<TrafficSummary, "isAdmin"> = {
    windowDays: options.windowDays,
    totals: emptyRow("all", "all"),
    byChannel: [],
    bySource: [],
    contactMethods: [],
    topLandingPages: [],
    conversions: { inquiriesSent: 0, saveActions: 0, listingsSubmitted: 0 },
  };
  const channels = new Map<string, TrafficRow>();
  const sources = new Map<string, TrafficRow>();
  const contactingVisits = {
    all: new Set<string>(),
    channel: new Map<string, Set<string>>(),
    source: new Map<string, Set<string>>(),
  };
  const methods = new Map<string, number>();
  const landings = new Map<string, { visits: number; fromSearchOrAi: number }>();

  for (const event of eligibleTrafficEvents(events, options)) {
    if (event.name === "inquiry_completed") summary.conversions.inquiriesSent += 1;
    if (event.name === "watchlist_added") summary.conversions.saveActions += 1;
    if (event.name === "classified_listing_submit_succeeded")
      summary.conversions.listingsSubmitted += 1;
    if (!["visit_started", "listing_viewed", "seller_contacted"].includes(event.name)) continue;
    if (event.user_id && staffIds.has(event.user_id)) continue;
    const props = (event.props ?? {}) as Record<string, unknown>;
    const host = props["site_host"] ? String(props["site_host"]).replace(/^www\./, "") : null;
    if (host && host !== domain) continue;
    const channel = String(props["traffic_channel"] ?? "unknown");
    const source = String(props["traffic_source"] ?? "unknown");
    const visitId = props["traffic_visit"] ? String(props["traffic_visit"]) : null;
    const sourceKey = `${channel}\u0000${source}`;
    const channelRow = channels.get(channel) ?? emptyRow(channel, "all");
    const sourceRow = sources.get(sourceKey) ?? emptyRow(channel, source);
    channels.set(channel, channelRow);
    sources.set(sourceKey, sourceRow);
    const rows = [summary.totals, channelRow, sourceRow];

    if (event.name === "visit_started") {
      for (const row of rows) row.visits += 1;
      const path = String(props["landing_path"] ?? "unknown");
      const landing = landings.get(path) ?? { visits: 0, fromSearchOrAi: 0 };
      landing.visits += 1;
      if (channel === "search" || channel === "ai") landing.fromSearchOrAi += 1;
      landings.set(path, landing);
    } else if (event.name === "listing_viewed") {
      for (const row of rows) row.listingViews += 1;
    } else if (event.name === "seller_contacted") {
      for (const row of rows) row.contacts += 1;
      const method = String(props["method"] ?? "unknown");
      methods.set(method, (methods.get(method) ?? 0) + 1);
      if (visitId) {
        contactingVisits.all.add(visitId);
        const byChannel = contactingVisits.channel.get(channel) ?? new Set<string>();
        byChannel.add(visitId);
        contactingVisits.channel.set(channel, byChannel);
        const bySource = contactingVisits.source.get(sourceKey) ?? new Set<string>();
        bySource.add(visitId);
        contactingVisits.source.set(sourceKey, bySource);
      }
    }
  }

  summary.totals.contactingVisits = contactingVisits.all.size;
  for (const [channel, row] of channels)
    row.contactingVisits = contactingVisits.channel.get(channel)?.size ?? 0;
  for (const [key, row] of sources)
    row.contactingVisits = contactingVisits.source.get(key)?.size ?? 0;

  const byVisits = (a: TrafficRow, b: TrafficRow) =>
    b.visits - a.visits || b.contacts - a.contacts || a.source.localeCompare(b.source);
  summary.byChannel = [...channels.values()].sort(byVisits);
  summary.bySource = [...sources.values()].sort(byVisits).slice(0, 50);
  summary.contactMethods = [...methods.entries()]
    .map(([method, count]) => ({ method, count }))
    .sort((a, b) => b.count - a.count);
  summary.topLandingPages = [...landings.entries()]
    .map(([path, counts]) => ({ path, ...counts }))
    .sort((a, b) => b.visits - a.visits)
    .slice(0, 20);
  return summary;
}

