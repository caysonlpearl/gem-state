import { isNewListingAction, isKnownAutomatedAgent } from "./analytics-policy.ts";

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
  audience: {
    visitors: number;
    engagedVisitors: number;
    engagedListingViews: number;
    sessions: number;
    excludedSessions: number;
    legacySessions: number;
    unidentifiedSessions: number;
  };
};

export type TrafficExclusions = {
  staffIds: Set<string>;
  domain: string;
  excludedBrowserIds?: Set<string>;
  excludedVisitIds?: Set<string>;
};
export type TrafficEvent = {
  id?: string;
  session_id?: string | null;
  name: string;
  props: unknown;
  user_id: string | null;
  occurred_at?: string;
};

function emptyRow(channel: string, source: string): TrafficRow {
  return { channel, source, visits: 0, listingViews: 0, contacts: 0, contactingVisits: 0 };
}

/** Exclude the whole staff/QA visit, including its anonymous pre-login events. */
export function eligibleTrafficEvents(events: TrafficEvent[], options: TrafficExclusions) {
  const excludedVisits = new Set(options.excludedVisitIds);
  const excludedBrowsers = new Set(options.excludedBrowserIds);
  const excluded = (event: TrafficEvent) => {
    const props = (event.props ?? {}) as Record<string, unknown>;
    const host = String(props.site_host ?? "").replace(/^www\./, "");
    return (
      Boolean(event.user_id && options.staffIds.has(event.user_id)) ||
      props.is_internal === true ||
      props.is_bot === true ||
      props.webdriver === true ||
      (typeof props.user_agent === "string" && isKnownAutomatedAgent(props.user_agent)) ||
      Boolean(host && host !== options.domain)
    );
  };
  for (const event of events) {
    const props = (event.props ?? {}) as Record<string, unknown>;
    // Staff/test/automation markers apply to the browser across tabs and sign-outs.
    // Preview-host traffic alone does not establish that a browser is an operator.
    const marked =
      Boolean(event.user_id && options.staffIds.has(event.user_id)) ||
      (props.is_internal === true && props.internal_reason !== "role_check_unavailable") ||
      props.is_bot === true ||
      props.webdriver === true ||
      (typeof props.user_agent === "string" && isKnownAutomatedAgent(props.user_agent));
    if (marked && event.session_id) excludedBrowsers.add(event.session_id);
    if (excluded(event) && props.traffic_visit) excludedVisits.add(String(props.traffic_visit));
  }
  const seen = new Set<string>();
  return events.filter((event) => {
    const props = (event.props ?? {}) as Record<string, unknown>;
    if (
      excluded(event) ||
      (event.session_id && excludedBrowsers.has(event.session_id)) ||
      excludedVisits.has(String(props.traffic_visit))
    )
      return false;
    const id =
      event.name === "listing_viewed" && props.traffic_visit && props.listing_id
        ? `${props.traffic_visit}:${props.listing_id}`
        : (props.event_id ?? (event.name === "visit_started" ? props.traffic_visit : event.id));
    if (!id) return true;
    const key = `${event.name}:${id}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export function summarizeTraffic(
  events: TrafficEvent[],
  options: TrafficExclusions & { windowDays: number },
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
    audience: {
      visitors: 0,
      engagedVisitors: 0,
      engagedListingViews: 0,
      sessions: 0,
      excludedSessions: 0,
      legacySessions: 0,
      unidentifiedSessions: 0,
    },
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

  const eligible = eligibleTrafficEvents(events, options);
  const browserKey = (event: TrafficEvent) =>
    event.session_id
      ? `browser:${event.session_id}`
      : ((event.props ?? {}) as Record<string, unknown>).traffic_visit
        ? `visit:${((event.props ?? {}) as Record<string, unknown>).traffic_visit}`
        : null;
  const visitors = new Set<string>();
  const engaged = new Set<string>();
  const rawVisits = new Set(
    events
      .filter((e) => e.name === "visit_started")
      .map((e) => String((e.props as Record<string, unknown> | null)?.traffic_visit ?? e.id ?? ""))
      .filter(Boolean),
  );
  const eligibleVisits = new Set<string>();
  const engagedVisits = new Set<string>();
  for (const event of eligible) {
    const props = (event.props ?? {}) as Record<string, unknown>;
    if (
      props.traffic_visit &&
      (event.name === "visit_engaged" ||
        (event.name === "web_vital" &&
          props.metric === "INP" &&
          typeof props.value === "number" &&
          props.value > 0) ||
        [
          "seller_contacted",
          "inquiry_completed",
          "watchlist_added",
          "classified_listing_submit_started",
          "classified_listing_submit_succeeded",
        ].includes(event.name))
    ) {
      engagedVisits.add(String(props.traffic_visit));
    }
  }
  for (const event of eligible) {
    const props = (event.props ?? {}) as Record<string, unknown>;
    const key = browserKey(event);
    if (key) visitors.add(key);
    if (key && engagedVisits.has(String(props.traffic_visit))) engaged.add(key);
    if (event.name === "visit_started") {
      if (props.traffic_visit) eligibleVisits.add(String(props.traffic_visit));
      if (props.traffic_policy !== 2) summary.audience.legacySessions++;
      if (!event.session_id) summary.audience.unidentifiedSessions++;
    }
    if (event.name === "listing_viewed" && engagedVisits.has(String(props.traffic_visit)))
      summary.audience.engagedListingViews++;
    if (event.name === "inquiry_completed") summary.conversions.inquiriesSent += 1;
    if (event.name === "watchlist_added") summary.conversions.saveActions += 1;
    if (event.name === "classified_listing_submit_succeeded" && isNewListingAction(event.props))
      summary.conversions.listingsSubmitted += 1;
    if (!["visit_started", "listing_viewed", "seller_contacted"].includes(event.name)) continue;
    if (event.user_id && staffIds.has(event.user_id)) continue;
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

  summary.audience.visitors = visitors.size;
  summary.audience.engagedVisitors = engaged.size;
  summary.audience.sessions = summary.totals.visits;
  summary.audience.excludedSessions = [...rawVisits].filter((id) => !eligibleVisits.has(id)).length;
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
