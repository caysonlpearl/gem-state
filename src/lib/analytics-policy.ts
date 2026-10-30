/** Only public page families, never tokens, search terms, or personal route IDs. */
export function performancePageTemplate(path: string) {
  if (path === "/") return "home";
  if (path === "/browse") return "browse";
  if (path === "/news" || path === "/news/") return "news";
  if (path.startsWith("/news/")) return "news-article";
  if (path.startsWith("/listings/")) return "listing";
  if (path.startsWith("/idaho/market-report")) return "market-report";
  if (path.startsWith("/idaho/") || path.startsWith("/cars/")) return "location";
  if (path.startsWith("/guides/")) return "guide";
  if (path.startsWith("/sellers/") || path.startsWith("/dealers/")) return "storefront";
  return null;
}

export function isInternalAnalyticsQuery(search: string) {
  const params = new URLSearchParams(search);
  return params.get("_qa") === "1" || params.has("_verify");
}

export function isKnownAutomatedAgent(agent: string) {
  return /bot\b|spider|crawler|HeadlessChrome|Lighthouse|Google Page Speed|Google-InspectionTool/i.test(
    agent,
  );
}

/** Explicit disposable fixtures only; a normal name containing "qa" is legitimate. */
export function isOperationalTestRecord(label: unknown) {
  return (
    typeof label === "string" && /^(?:qa|audit)(?:\b|[-_])|^seo[-_ ](?:qa|test)\b/i.test(label)
  );
}

export type VitalSample = {
  metric: "LCP" | "INP" | "CLS";
  template: string;
  device: "mobile" | "desktop";
  samples: number;
  p75: number;
  unit: "ms" | "score";
  rating: "good" | "needs-improvement" | "poor";
};

/** Latest value per metric/document; observer updates are not more users. */
export function summarizeVitals(events: { name: string; props: unknown }[]): VitalSample[] {
  const latest = new Map<string, Record<string, unknown>>();
  for (const event of events) {
    if (event.name !== "web_vital") continue;
    const props = (event.props ?? {}) as Record<string, unknown>;
    if (
      !["LCP", "INP", "CLS"].includes(String(props.metric)) ||
      typeof props.value !== "number" ||
      !Number.isFinite(props.value)
    )
      continue;
    if (!props.metric_id || Number(props.value) < 0 || !props.template) continue;
    if (!["mobile", "desktop"].includes(String(props.device))) continue;
    latest.set(String(props.metric_id), props);
  }
  const groups = new Map<string, Record<string, unknown>[]>();
  for (const props of latest.values()) {
    const key = `${props.template}:${props.device}:${props.metric}`;
    groups.set(key, [...(groups.get(key) ?? []), props]);
  }
  return [...groups.values()].map((group) => {
    const values = group.map((p) => Number(p.value)).sort((a, b) => a - b);
    const p75 = values[Math.max(0, Math.ceil(values.length * 0.75) - 1)]!;
    const metric = group[0]!.metric as VitalSample["metric"];
    const [good, poor] =
      metric === "CLS" ? [0.1, 0.25] : metric === "LCP" ? [2500, 4000] : [200, 500];
    return {
      metric,
      template: String(group[0]!.template),
      device: group[0]!.device === "mobile" ? "mobile" : "desktop",
      samples: values.length,
      p75,
      unit: metric === "CLS" ? "score" : "ms",
      rating: p75 <= good! ? "good" : p75 <= poor! ? "needs-improvement" : "poor",
    };
  });
}
