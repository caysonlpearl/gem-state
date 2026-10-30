import { classifiedCategories, idahoCities } from "../config/classifieds.ts";
import type { ListingCardSummary } from "./listing-card-summary";

export const NEWS_TOPICS = [
  { slug: "local-news", label: "Local news" },
  { slug: "business-jobs", label: "Business & jobs" },
  { slug: "homes-living", label: "Homes & living" },
  { slug: "cars-transport", label: "Cars & transport" },
  { slug: "outdoors-sports", label: "Outdoors & sports" },
  { slug: "guides", label: "Buying & selling guides" },
] as const;
export type NewsTopic = (typeof NEWS_TOPICS)[number]["slug"];
export type ArticleKind = "original" | "licensed" | "external";
export type ArticleStatus = "draft" | "review" | "scheduled" | "published" | "archived";
export type EditorialArticle = {
  id: string;
  slug: string;
  title: string;
  excerpt: string;
  kind: ArticleKind;
  status: ArticleStatus;
  topic: NewsTopic;
  state: "ID" | "UT";
  city: string | null;
  categorySlugs: string[];
  authorName: string;
  authorUrl: string | null;
  sourceName: string | null;
  sourceUrl: string | null;
  publishedAt: string;
  modifiedAt: string;
  featured: boolean;
  imageUrl: string | null;
  imageCredit: string | null;
  imageRights: string | null;
  bodyHtml: string;
  bodySections?: string[];
  guidePath?: string | null;
};
export type NewsCard = Omit<EditorialArticle, "bodyHtml" | "bodySections" | "imageRights">;
export type EditorialSource = {
  id: string;
  key: string;
  name: string;
  feedUrl: string;
  website: string;
  state: "ID" | "UT";
  enabled: boolean;
  autoPublish: boolean;
  usage: "link" | "full";
  permissionNote: string;
  imagesPermitted: boolean;
  lastSuccessAt: string | null;
  nextRefreshAt: string | null;
  lastError: string | null;
};
export type NewsFilters = { topic?: NewsTopic; state?: "ID" | "UT"; page: number };
export const NEWS_PAGE_SIZE = 16;
export const NEWS_REFRESH_MS = 6 * 60 * 60_000;
export const NEWS_UTAH_DAILY_AUTO_LIMIT = 4;
export const NEWS_MAX_FEED_BYTES = 5_000_000;
export const NEWS_SOURCE_DEFINITIONS = [
  {
    key: "idaho-capital-sun",
    name: "Idaho Capital Sun",
    feedUrl: "https://idahocapitalsun.com/feed/",
    website: "https://idahocapitalsun.com",
    state: "ID",
    policyUrl: "https://idahocapitalsun.com/republishing-guidelines/",
    geography: "explicit",
  },
  {
    key: "utah-news-dispatch",
    name: "Utah News Dispatch",
    feedUrl: "https://utahnewsdispatch.com/feed/",
    website: "https://utahnewsdispatch.com",
    state: "UT",
    policyUrl: "https://utahnewsdispatch.com/republishing-guidelines/",
    geography: "explicit",
  },
  {
    key: "idaho-at-work",
    name: "Idaho Department of Labor",
    feedUrl: "https://idahoatwork.com/feed/",
    website: "https://idahoatwork.com",
    state: "ID",
    policyUrl: "https://idahoatwork.com",
    geography: "state-feed",
  },
  {
    key: "idaho-fish-game",
    name: "Idaho Fish and Game",
    feedUrl: "",
    website: "https://idfg.idaho.gov",
    state: "ID",
    policyUrl: "https://idfg.idaho.gov/content/page/rss-feeds",
    geography: "state-feed",
  },
] as const;

export function newsSlug(value: string) {
  return value
    .normalize("NFKD")
    .toLowerCase()
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/['’]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 110)
    .replace(/-$/, "");
}
export function safeNewsUrl(value: unknown): string | null {
  if (typeof value !== "string" || value.length > 2000) return null;
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" || url.username || url.password || url.port) return null;
    if (
      /^(localhost|127\.|0\.|10\.|192\.168\.|169\.254\.|\[|172\.(1[6-9]|2\d|3[01])\.)/i.test(
        url.hostname,
      )
    )
      return null;
    return url.href;
  } catch {
    return null;
  }
}
export function canonicalSourceUrl(value: string): string | null {
  const safe = safeNewsUrl(value);
  if (!safe) return null;
  const url = new URL(safe);
  url.hash = "";
  for (const key of [...url.searchParams.keys()])
    if (/^(utm_|fbclid$|gclid$)/i.test(key)) url.searchParams.delete(key);
  return url.href;
}
export function sourceAllowsUrl(sourceKey: string, value: string) {
  const source = NEWS_SOURCE_DEFINITIONS.find((s) => s.key === sourceKey);
  const url = safeNewsUrl(value);
  return Boolean(
    source &&
    url &&
    new URL(url).hostname.replace(/^www\./, "") === new URL(source.website).hostname,
  );
}
export function articleIsPublic(
  article: Pick<EditorialArticle, "kind" | "status" | "publishedAt" | "sourceUrl">,
  now = Date.now(),
) {
  return (
    article.status === "published" &&
    Number.isFinite(Date.parse(article.publishedAt)) &&
    Date.parse(article.publishedAt) <= now &&
    (article.kind !== "external" || Boolean(safeNewsUrl(article.sourceUrl)))
  );
}
export function articleIsIndexable(
  article: Pick<EditorialArticle, "kind" | "status" | "publishedAt" | "sourceUrl">,
  now = Date.now(),
) {
  return article.kind === "original" && articleIsPublic(article, now);
}
export function articleHref(
  article: Pick<EditorialArticle, "kind" | "sourceUrl" | "slug" | "guidePath">,
) {
  if (article.guidePath && /^\/guides\/[a-z0-9-]+$/.test(article.guidePath))
    return article.guidePath;
  return article.kind === "external"
    ? safeNewsUrl(article.sourceUrl) || "/news"
    : `/news/${encodeURIComponent(article.slug)}`;
}
export function newsCard(article: EditorialArticle): NewsCard {
  const keys: (keyof NewsCard)[] = [
    "id",
    "slug",
    "title",
    "excerpt",
    "kind",
    "status",
    "topic",
    "state",
    "city",
    "categorySlugs",
    "authorName",
    "authorUrl",
    "sourceName",
    "sourceUrl",
    "publishedAt",
    "modifiedAt",
    "featured",
    "imageUrl",
    "imageCredit",
    "guidePath",
  ];
  return Object.fromEntries(keys.map((key) => [key, article[key]])) as NewsCard;
}

export function newsTopic(value: unknown): NewsTopic | undefined {
  return NEWS_TOPICS.find((t) => t.slug === value)?.slug;
}
export function newsFilters(value: Record<string, unknown>): NewsFilters {
  const page = Number(value.page);
  return {
    topic: newsTopic(value.topic),
    state: value.state === "ID" || value.state === "UT" ? value.state : undefined,
    page: Number.isInteger(page) && page >= 1 ? Math.min(page, 1000) : 1,
  };
}
const categoryNames: Record<string, string> = {
  "cars-trucks": "cars & trucks",
  "other-real-estate": "homes for sale & rent",
  jobs: "jobs",
  services: "local services",
  "outdoor-sporting": "outdoor gear",
};
export function editorialDestinations(
  categories: readonly string[],
  city?: string | null,
  state: "ID" | "UT" = "ID",
) {
  const valid = [...new Set(categories)].flatMap((slug) => {
    const category = classifiedCategories.find((c) => c.slug === slug);
    if (!category) return [];
    const knownCity = state === "ID" && idahoCities.some((c) => c === city);
    const urlSlug = slug === "other-real-estate" ? "homes" : slug;
    const citySlug = city ? newsSlug(city) : "";
    const params = new URLSearchParams({ category: slug, state });
    if (city && !knownCity) params.set("city", city);
    return [
      {
        category: slug,
        label: `Browse ${categoryNames[slug] || category.name.toLowerCase()} ${city ? `in ${city}` : state === "UT" ? "in Utah" : "in Idaho"}`,
        href:
          state === "ID"
            ? knownCity
              ? `/idaho/${citySlug}/${urlSlug}`
              : city
                ? `/browse?${params}`
                : `/idaho/${urlSlug}`
            : `/browse?${params}`,
      },
    ];
  });
  return valid.length
    ? valid
    : [
        {
          category: "",
          label: state === "UT" ? "Browse Utah classifieds" : "Browse Idaho classifieds",
          href: state === "UT" ? "/browse?state=UT" : "/browse?state=ID",
        },
      ];
}
export function classifyNews(text: string): { topic: NewsTopic; categories: string[] } {
  if (/\b(hous(?:e|es|ing)|rental|renters?|mortgage|real estate|homeowners?|moving)\b/i.test(text))
    return { topic: "homes-living", categories: ["other-real-estate", "services"] };
  if (
    /\b(cars?|vehicles?|traffic|transportation|drivers?|highway|roadwork|automotive)\b/i.test(text)
  )
    return { topic: "cars-transport", categories: ["cars-trucks"] };
  if (
    /\b(jobs?|employment|hiring|business(?:es)?|econom(?:y|ic)|workforce|job fair|unemployment)\b/i.test(
      text,
    )
  )
    return { topic: "business-jobs", categories: ["jobs", "services"] };
  if (
    /\b(outdoors?|fishing|hunting|wildlife|camping|hiking|sports?|football|basketball)\b/i.test(
      text,
    )
  )
    return { topic: "outdoors-sports", categories: ["outdoor-sporting"] };
  return { topic: "local-news", categories: [] };
}
export function detectNewsPlace(
  text: string,
  sourceKey: string,
): { state: "ID" | "UT"; city: string | null; certain: boolean } {
  const source = NEWS_SOURCE_DEFINITIONS.find((s) => s.key === sourceKey);
  const state = source?.state || "ID";
  const cities =
    state === "ID"
      ? idahoCities.filter((c) => c.length >= 5)
      : ["Salt Lake City", "Ogden", "Provo", "Logan", "St. George", "Layton", "Park City"];
  const city =
    cities
      .map((name) => ({
        name,
        index: text.search(new RegExp(`\\b${name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "i")),
      }))
      .filter((match) => match.index >= 0)
      .sort((a, b) => a.index - b.index)[0]?.name || null;
  return {
    state,
    city,
    certain:
      source?.geography === "state-feed" ||
      Boolean(city) ||
      new RegExp(`\\b${state === "ID" ? "Idaho" : "Utah"}\\b`, "i").test(text),
  };
}
export function relatedEditorialListings(
  cards: readonly ListingCardSummary[],
  categories: readonly string[],
  city: string | null,
  state: "ID" | "UT",
) {
  const allowed = new Set(categories);
  const candidates = cards.filter(
    (c) =>
      c.state === state &&
      (allowed.size
        ? Boolean(c.categorySlug && allowed.has(c.categorySlug))
        : !c.externalMerchandise),
  );
  const seen = new Set<string>();
  return [...candidates]
    .sort(
      (a, b) =>
        Number(b.city === city) - Number(a.city === city) ||
        Date.parse(b.createdAt) - Date.parse(a.createdAt),
    )
    .filter((c) => {
      if (seen.has(c.id)) return false;
      seen.add(c.id);
      return true;
    })
    .slice(0, 4);
}

/** Repeated refreshes must not turn selected Utah coverage into a statewide feed. */
export function selectUtahStories<
  T extends {
    state: string;
    status: string;
    publishedAt: string;
    sourceUrl: string | null;
    categorySlugs: string[];
    reviewReason: string | null;
  },
>(
  stories: readonly T[],
  published: readonly { source_url: string; published_at: string }[] = [],
): T[] {
  const counts = new Map<string, number>();
  const urls = new Set(published.map((row) => row.source_url));
  for (const row of published) {
    const day = row.published_at.slice(0, 10);
    counts.set(day, (counts.get(day) || 0) + 1);
  }
  const review = new Set<string | null>();
  for (const story of [...stories].sort(
    (a, b) =>
      Number(b.categorySlugs.length > 0) - Number(a.categorySlugs.length > 0) ||
      Date.parse(b.publishedAt) - Date.parse(a.publishedAt),
  )) {
    if (story.state !== "UT" || story.status !== "published" || urls.has(story.sourceUrl || ""))
      continue;
    const day = story.publishedAt.slice(0, 10);
    if ((counts.get(day) || 0) >= NEWS_UTAH_DAILY_AUTO_LIMIT) review.add(story.sourceUrl);
    else counts.set(day, (counts.get(day) || 0) + 1);
  }
  return stories.map((story) =>
    review.has(story.sourceUrl)
      ? {
          ...story,
          status: "review",
          reviewReason:
            "Select this Utah story for Bluebird’s regional coverage before publishing.",
        }
      : story,
  );
}
