import type { TrafficEvent } from "./traffic-summary";

/** Aggregate already-excluded events. Clicks, contact actions and delivered
 * inquiries are separate outcomes, and attribution is descriptive. */
export function summarizeEditorialTraffic(events: TrafficEvent[]) {
  const articles = new Map<
    string,
    {
      article: string;
      views: number;
      clicks: number;
      clickingVisits: Set<string>;
      listingViews: number;
      contacts: number;
      inquiries: number;
      postingStarts: number;
      submissions: number;
      placements: Map<string, number>;
    }
  >();
  for (const event of events) {
    const props = (event.props ?? {}) as Record<string, unknown>;
    const article = String(
      (event.name.startsWith("media_") ? props.article : props.media_article) ?? "",
    ).slice(0, 150);
    if (!article || article === "preview") continue;
    const row = articles.get(article) ?? {
      article,
      views: 0,
      clicks: 0,
      clickingVisits: new Set<string>(),
      listingViews: 0,
      contacts: 0,
      inquiries: 0,
      postingStarts: 0,
      submissions: 0,
      placements: new Map<string, number>(),
    };
    if (event.name === "media_article_viewed") row.views++;
    if (event.name === "media_cta_clicked") {
      row.clicks++;
      if (props.traffic_visit) row.clickingVisits.add(String(props.traffic_visit));
      const placement = String(props.placement ?? "unknown").slice(0, 80);
      row.placements.set(placement, (row.placements.get(placement) ?? 0) + 1);
    }
    if (event.name === "listing_viewed") row.listingViews++;
    if (event.name === "seller_contacted") row.contacts++;
    if (event.name === "inquiry_completed") row.inquiries++;
    if (event.name === "classified_listing_started") row.postingStarts++;
    if (event.name === "classified_listing_submit_succeeded") row.submissions++;
    articles.set(article, row);
  }
  return [...articles.values()]
    .map((row) => ({
      ...row,
      clickingVisits: row.clickingVisits.size,
      placements: Object.fromEntries(row.placements),
    }))
    .sort((a, b) => b.clicks - a.clicks || b.views - a.views || a.article.localeCompare(b.article));
}
