/**
 * Where a visit came from, worked out once on its first page from the
 * referrer and any utm_ tags. Only the referring host is kept, never the full
 * referrer URL (it can carry search terms or other personal details).
 */

export type TrafficChannel =
  "search" | "ai" | "social" | "email" | "paid" | "campaign" | "share" | "referral" | "direct";

export type TrafficSource = { source: string; channel: TrafficChannel };

const SEARCH_HOSTS: [RegExp, string][] = [
  [/(^|\.)google\.[a-z.]+$/, "google"],
  [/(^|\.)bing\.com$/, "bing"],
  [/(^|\.)duckduckgo\.com$/, "duckduckgo"],
  [/(^|\.)search\.yahoo\.com$|(^|\.)yahoo\.com$/, "yahoo"],
  [/(^|\.)search\.brave\.com$/, "brave"],
  [/(^|\.)ecosia\.org$/, "ecosia"],
  [/(^|\.)yandex\.[a-z.]+$/, "yandex"],
];

const AI_HOSTS: [RegExp, string][] = [
  [/(^|\.)chatgpt\.com$|(^|\.)chat\.openai\.com$/, "chatgpt"],
  [/(^|\.)perplexity\.ai$/, "perplexity"],
  [/(^|\.)copilot\.microsoft\.com$/, "copilot"],
  [/(^|\.)gemini\.google\.com$/, "gemini"],
  [/(^|\.)claude\.ai$/, "claude"],
  [/(^|\.)meta\.ai$/, "meta-ai"],
];

const SOCIAL_HOSTS: [RegExp, string][] = [
  [/(^|\.)facebook\.com$|(^|\.)fb\.com$|(^|\.)fb\.me$/, "facebook"],
  [/(^|\.)instagram\.com$/, "instagram"],
  [/(^|\.)t\.co$|(^|\.)x\.com$|(^|\.)twitter\.com$/, "x"],
  [/(^|\.)reddit\.com$/, "reddit"],
  [/(^|\.)nextdoor\.com$/, "nextdoor"],
  [/(^|\.)tiktok\.com$/, "tiktok"],
  [/(^|\.)pinterest\.[a-z.]+$/, "pinterest"],
  [/(^|\.)youtube\.com$|(^|\.)youtu\.be$/, "youtube"],
  [/(^|\.)linkedin\.com$|(^|\.)lnkd\.in$/, "linkedin"],
];

const EMAIL_HOSTS = /(^|\.)mail\.google\.com$|(^|\.)outlook\.live\.com$|(^|\.)mail\.yahoo\.com$/;

function match(host: string, table: [RegExp, string][]) {
  return table.find(([pattern]) => pattern.test(host))?.[1] ?? null;
}

function clean(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, "-")
    .slice(0, 60);
}

/**
 * Classify a visit. `referrer` is document.referrer, `search` the landing
 * URL's query string, `ownHost` this site's host (a referrer from our own
 * site means the visit started earlier, so it's treated as direct), and
 * `pathname` the landing path.
 */
export function classifyTrafficSource(
  referrer: string,
  search: string,
  ownHost: string,
  pathname = "",
): TrafficSource {
  const params = new URLSearchParams(search);
  // A seller's own share link (?ref=share) or website badge (?ref=badge) on
  // their storefront; the source is the seller, taken from the path.
  const ref = params.get("ref");
  const sellerSlug = /^\/sellers\/([^/]+)/.exec(pathname)?.[1];
  if ((ref === "share" || ref === "badge") && sellerSlug) {
    return { source: clean(decodeURIComponent(sellerSlug)), channel: "share" };
  }
  const utmSource = params.get("utm_source");
  if (utmSource) {
    const source = clean(utmSource);
    const medium = clean(params.get("utm_medium") ?? "");
    // ChatGPT and some other assistants tag their outbound links this way.
    const asHost = source.includes(".") ? source : `${source}.com`;
    if (match(asHost, AI_HOSTS)) return { source: match(asHost, AI_HOSTS)!, channel: "ai" };
    if (/^(cpc|ppc|paid|paidsearch|paid-search|display)$/.test(medium))
      return { source, channel: "paid" };
    if (medium === "email" || medium === "newsletter") return { source, channel: "email" };
    if (medium === "social" || match(asHost, SOCIAL_HOSTS))
      return { source: match(asHost, SOCIAL_HOSTS) ?? source, channel: "social" };
    return { source, channel: "campaign" };
  }

  let host = "";
  try {
    host = referrer ? new URL(referrer).hostname.toLowerCase().replace(/^www\./, "") : "";
  } catch {
    host = "";
  }
  const own = ownHost.toLowerCase().replace(/^www\./, "");
  if (!host || host === own) return { source: "direct", channel: "direct" };

  // Order matters: gemini.google.com is AI and mail.google.com is email,
  // though both would also match Google search.
  const ai = match(host, AI_HOSTS);
  if (ai) return { source: ai, channel: "ai" };
  if (EMAIL_HOSTS.test(host)) return { source: host, channel: "email" };
  const searchEngine = match(host, SEARCH_HOSTS);
  if (searchEngine) return { source: searchEngine, channel: "search" };
  const social = match(host, SOCIAL_HOSTS);
  if (social) return { source: social, channel: "social" };
  return { source: clean(host), channel: "referral" };
}
