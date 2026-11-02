import { performancePageTemplate } from "./analytics-policy.ts";
import type { TrafficEvent } from "./traffic-summary";

export type ConversionRow = {
  segment: string;
  visits: number;
  searched: number;
  noResults: number;
  viewed: number;
  contactedAfterView: number;
  inquiriesAfterContact: number;
  submissionAttempts: number;
  postingStarts: number;
  submittedAfterAttempt: number;
};
const row = (segment: string): ConversionRow => ({
  segment,
  visits: 0,
  searched: 0,
  noResults: 0,
  viewed: 0,
  contactedAfterView: 0,
  inquiriesAfterContact: 0,
  submissionAttempts: 0,
  postingStarts: 0,
  submittedAfterAttempt: 0,
});

/** Aggregate already-filtered events. Counts are visits, never unique people or sales. */
export function summarizeConversionVisits(events: TrafficEvent[]) {
  const visits = new Map<string, TrafficEvent[]>();
  let eventsWithoutVisit = 0;
  for (const event of events) {
    const props = (event.props ?? {}) as Record<string, unknown>;
    if (!props.traffic_visit) {
      eventsWithoutVisit++;
      continue;
    }
    const id = String(props.traffic_visit);
    const group = visits.get(id) ?? [];
    group.push(event);
    visits.set(id, group);
  }
  const totals = row("all");
  const devices = new Map<string, ConversionRow>();
  const templates = new Map<string, ConversionRow>();
  const channels = new Map<string, ConversionRow>();
  const organicLandings = new Map<string, ConversionRow>();
  let visitsWithoutStart = 0;
  let eventsWithoutTime = 0;
  for (const group of visits.values()) {
    const start = group.find((event) => event.name === "visit_started");
    // A contact in a long-lived tab is not a new visit in this reporting window.
    if (!start) {
      visitsWithoutStart++;
      continue;
    }
    const startProps = (start.props ?? {}) as Record<string, unknown>;
    const channel = String(startProps.traffic_channel ?? "unknown").slice(0, 40);
    const landing =
      String(startProps.landing_path ?? "")
        .split(/[?#]/)[0]
        .slice(0, 200) || "unknown";
    const device =
      group
        .map((event) => ((event.props ?? {}) as Record<string, unknown>).device)
        .find((value) => value === "mobile" || value === "desktop") ?? "unknown";
    const template =
      performancePageTemplate(String(startProps.landing_path ?? "")) ?? "other/unknown";
    const flags = row("");
    flags.visits = 1;
    const timed = group
      .flatMap((event) => {
        const props = (event.props ?? {}) as Record<string, unknown>;
        const stored = Date.parse(event.occurred_at ?? "");
        const client = typeof props.event_at === "number" ? props.event_at : NaN;
        // Reject a wildly wrong client clock; older events use their stored time.
        const time =
          Number.isFinite(client) && Number.isFinite(stored) && Math.abs(client - stored) <= 300_000
            ? client
            : stored;
        if (!Number.isFinite(time)) {
          eventsWithoutTime++;
          return [];
        }
        return [{ event, props, time }];
      })
      .sort((a, b) => a.time - b.time);
    let viewedAt = Infinity;
    let contactedAt = Infinity;
    let attemptedAt = Infinity;
    for (const { event, props, time } of timed) {
      if (event.name === "search_completed") {
        flags.searched = 1;
        if (props.results === 0) flags.noResults = 1;
      }
      if (event.name === "listing_viewed") {
        flags.viewed = 1;
        viewedAt = Math.min(viewedAt, time);
      }
      if (event.name === "seller_contacted" && time > viewedAt) {
        flags.contactedAfterView = 1;
        contactedAt = Math.min(contactedAt, time);
      }
      if (event.name === "inquiry_completed" && time > contactedAt) flags.inquiriesAfterContact = 1;
      if (event.name === "classified_listing_submit_started") {
        flags.submissionAttempts = 1;
        attemptedAt = Math.min(attemptedAt, time);
      }
      if (event.name === "classified_listing_started") flags.postingStarts = 1;
      if (event.name === "classified_listing_submit_succeeded" && time > attemptedAt)
        flags.submittedAfterAttempt = 1;
    }
    const deviceRow = devices.get(String(device)) ?? row(String(device));
    const templateRow = templates.get(template) ?? row(template);
    devices.set(String(device), deviceRow);
    templates.set(template, templateRow);
    const channelRow = channels.get(channel) ?? row(channel);
    channels.set(channel, channelRow);
    const organicRow = channel === "search" ? (organicLandings.get(landing) ?? row(landing)) : null;
    if (organicRow) organicLandings.set(landing, organicRow);
    for (const target of [
      totals,
      deviceRow,
      templateRow,
      channelRow,
      ...(organicRow ? [organicRow] : []),
    ]) {
      for (const key of Object.keys(flags) as (keyof ConversionRow)[]) {
        if (key !== "segment") target[key] += flags[key];
      }
    }
  }
  const sort = (rows: ConversionRow[]) =>
    rows.sort((a, b) => b.visits - a.visits || a.segment.localeCompare(b.segment));
  return {
    totals,
    byDevice: sort([...devices.values()]),
    byLandingTemplate: sort([...templates.values()]),
    byChannel: sort([...channels.values()]),
    organic: channels.get("search") ?? row("search"),
    byOrganicLandingPage: sort([...organicLandings.values()]),
    visitsWithoutStart,
    eventsWithoutVisit,
    eventsWithoutTime,
  };
}
