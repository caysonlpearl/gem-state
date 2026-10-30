import { XMLParser, XMLValidator } from "fast-xml-parser";
import sanitizeHtml from "sanitize-html";
import { decodeHTML } from "entities";
import { parseDocument, DomUtils } from "htmlparser2";
import { marked } from "marked";
import {
  canonicalSourceUrl,
  classifyNews,
  detectNewsPlace,
  NEWS_MAX_FEED_BYTES,
  NEWS_SOURCE_DEFINITIONS,
  safeNewsUrl,
  sourceAllowsUrl,
  type EditorialArticle,
  type EditorialSource,
} from "./editorial-contract.ts";

export function editorialPlainText(html: unknown) {
  return decodeHTML(
    sanitizeHtml(typeof html === "string" ? html : "", { allowedTags: [], allowedAttributes: {} }),
  )
    .replace(/\s+/g, " ")
    .trim();
}
export function sanitizeEditorialHtml(
  html: string,
  images: boolean,
  imageCredit?: string,
  baseUrl?: string,
) {
  const resolve = (value: string | undefined) => {
    try {
      return value ? new URL(decodeHTML(value), baseUrl).href : null;
    } catch {
      return null;
    }
  };
  const allowedImages = new Set<string>();
  if (images && imageCredit) {
    for (const figure of html.match(/<figure\b[^>]*>[\s\S]*?<\/figure>/gi) || []) {
      const caption = editorialPlainText(
        figure.match(/<figcaption\b[^>]*>([\s\S]*?)<\/figcaption>/i)?.[1] || "",
      );
      if (caption.toLowerCase().includes(imageCredit.toLowerCase())) {
        for (const match of figure.matchAll(/<img\b[^>]*\bsrc=["']([^"']+)["']/gi)) {
          const url = safeNewsUrl(resolve(match[1]));
          if (url) allowedImages.add(url);
        }
      }
    }
  }
  return sanitizeHtml(html.slice(0, 150_000), {
    allowedTags: [
      "p",
      "h2",
      "h3",
      "h4",
      "ul",
      "ol",
      "li",
      "blockquote",
      "strong",
      "em",
      "b",
      "i",
      "a",
      "br",
      "hr",
      "figure",
      "figcaption",
      "img",
      "table",
      "thead",
      "tbody",
      "tr",
      "th",
      "td",
    ],
    allowedAttributes: {
      a: ["href", "title", "rel", "target"],
      img: ["src", "alt", "width", "height", "loading", "decoding"],
      th: ["scope"],
    },
    allowedSchemes: ["https", "http", "mailto", "tel"],
    allowedSchemesByTag: { img: ["https"] },
    allowProtocolRelative: false,
    disallowedTagsMode: "discard",
    nonTextTags: ["script", "style", "textarea", "noscript", "iframe", "object", "svg", "form"],
    transformTags: {
      a: (_tag, attrs) => {
        const raw = attrs.href;
        const url = resolve(raw);
        const href =
          !baseUrl && raw?.startsWith("/") && !raw.startsWith("//") && !raw.includes("\\")
            ? raw
            : url && (/^(mailto|tel):/i.test(url) || safeNewsUrl(url.replace(/^http:/i, "https:")))
              ? url
              : null;
        return {
          tagName: "a",
          attribs: href
            ? {
                href,
                ...(/^https?:/.test(href) ? { target: "_blank", rel: "noopener noreferrer" } : {}),
              }
            : {},
        };
      },
      img: (_tag, attrs) => ({
        tagName: "img",
        attribs: {
          src: safeNewsUrl(resolve(attrs.src)) || "",
          alt: attrs.alt?.slice(0, 300) || "",
          loading: "lazy",
          decoding: "async",
        },
      }),
    },
    exclusiveFilter: (frame) =>
      (frame.tag === "img" && (!images || !allowedImages.has(frame.attribs.src))) ||
      (frame.tag === "figure" &&
        (!images ||
          !imageCredit ||
          !frame.text.toLowerCase().includes(imageCredit.toLowerCase()) ||
          !frame.mediaChildren.includes("img"))),
  }).trim();
}
export function sanitizeOriginalHtml(html: string) {
  // Editorial photographs use the separately credited cover field. Embedded
  // remote images and executable markup never enter original article bodies.
  return sanitizeEditorialHtml(html, false);
}
export function originalDraftHtml(draft: string) {
  return sanitizeOriginalHtml(marked.parse(draft, { async: false, gfm: true }));
}
export function editorialBodySections(html: string, kind: string): string[] {
  if (kind !== "original" || editorialPlainText(html).split(/\s+/).length < 600) return [html];
  const blocks = parseDocument(html).children;
  if (blocks.length < 4) return [html];
  const split = Math.ceil(blocks.length / 2);
  return [blocks.slice(0, split), blocks.slice(split)].map((part) =>
    part.map((node) => DomUtils.getOuterHTML(node)).join(""),
  );
}
function string(value: unknown): string {
  if (typeof value === "string") return value;
  if (typeof value === "number") return String(value);
  if (value && typeof value === "object")
    return string((value as Record<string, unknown>)["#text"]);
  return "";
}
export type FeedStory = Omit<EditorialArticle, "id" | "slug" | "featured" | "modifiedAt"> & {
  sourceKey: string;
  sourcePublishedAt: string;
  reviewReason: string | null;
  contentHash: string;
};

export async function parseEditorialFeed(
  xml: string,
  source: EditorialSource,
  now = Date.now(),
): Promise<FeedStory[]> {
  if (
    xml.length > NEWS_MAX_FEED_BYTES ||
    /<!DOCTYPE|<!ENTITY/i.test(xml) ||
    XMLValidator.validate(xml) !== true
  )
    throw new Error("The source returned an invalid or oversized feed.");
  const parsed = new XMLParser({
    ignoreAttributes: false,
    removeNSPrefix: true,
    parseTagValue: false,
    trimValues: true,
  }).parse(xml);
  const raw = parsed?.rss?.channel?.item ?? parsed?.feed?.entry;
  if (!raw)
    throw new Error("The source did not return recognizable stories; existing articles retained.");
  const items = Array.isArray(raw) ? raw : [raw];
  const stories: FeedStory[] = [];
  const seen = new Set<string>();
  for (const item of items.slice(0, 100)) {
    const title = editorialPlainText(string(item.title)).slice(0, 220);
    const rawLink =
      string(item.link) ||
      (Array.isArray(item.link)
        ? item.link.find(
            (l: Record<string, unknown>) => !l["@_rel"] || l["@_rel"] === "alternate",
          )?.["@_href"]
        : item.link?.["@_href"]);
    const url = canonicalSourceUrl(rawLink || "");
    if (!title || !url || !sourceAllowsUrl(source.key, url) || seen.has(url)) continue;
    seen.add(url);
    const date = Date.parse(string(item.pubDate || item.published || item.date || item.updated));
    if (!Number.isFinite(date) || date > now + 60_000 || now - date > 30 * 86_400_000) continue;
    const rawBody = string(item.encoded || item.content || item.description || item.summary);
    const analysisHtml = rawBody
      .replace(/<figure\b[^>]*>[\s\S]*?<\/figure>/gi, " ")
      .replace(/<p\b[^>]*>\s*The post[\s\S]*?appeared first on[\s\S]*?<\/p>/gi, " ");
    const analysisText = editorialPlainText(analysisHtml);
    const text = `${title} ${analysisText.slice(0, 8000)} ${[item.category].flat().map(string).join(" ")}`;
    const location = detectNewsPlace(text, source.key);
    const classification = classifyNews(title + " " + analysisText.slice(0, 500));
    const licensed = source.usage === "full" && source.permissionNote.trim().length >= 12;
    const body = licensed
      ? sanitizeEditorialHtml(rawBody, source.imagesPermitted, source.name, source.website)
      : "";
    const emptyBody = licensed && editorialPlainText(body).length < 100;
    const image = body.match(/<img\b[^>]*src="([^"]+)"/i)?.[1];
    const imageCredit = editorialPlainText(
      body.match(/<figcaption\b[^>]*>([\s\S]*?)<\/figcaption>/i)?.[1] || "",
    );
    const reviewReason = !location.certain
      ? "Confirm that this story is relevant to Idaho or Utah."
      : emptyBody
        ? "The feed did not include a complete article."
        : null;
    const authorName =
      editorialPlainText(string(item.creator || item.author?.name || item.author)) || source.name;
    const publishedAt = new Date(date).toISOString();
    const kind = licensed ? "licensed" : "external";
    const excerpt = licensed
      ? editorialPlainText(body).slice(0, 240)
      : `Local reporting from ${source.name}. Read the full story at its original source.`;
    const fingerprint = JSON.stringify({ title, body, authorName, publishedAt, kind, excerpt });
    const contentHash = [
      ...new Uint8Array(
        await crypto.subtle.digest("SHA-256", new TextEncoder().encode(fingerprint)),
      ),
    ]
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");
    stories.push({
      sourceKey: source.key,
      title,
      excerpt,
      kind,
      status: source.autoPublish && !reviewReason ? "published" : "review",
      topic: classification.topic,
      state: location.state,
      city: location.city,
      categorySlugs: classification.categories,
      authorName,
      authorUrl: source.website,
      sourceName: source.name,
      sourceUrl: url,
      publishedAt,
      sourcePublishedAt: publishedAt,
      bodyHtml: body,
      imageUrl: image ? safeNewsUrl(decodeHTML(image)) : null,
      imageCredit: image ? imageCredit || source.name : null,
      imageRights: image ? source.permissionNote : null,
      reviewReason,
      contentHash,
    });
  }
  return stories;
}
export async function fetchEditorialFeed(
  source: EditorialSource,
  etag?: string | null,
  lastModified?: string | null,
) {
  const definition = NEWS_SOURCE_DEFINITIONS.find((s) => s.key === source.key);
  if (!definition || !source.feedUrl || !sourceAllowsUrl(source.key, source.feedUrl))
    throw new Error("A verified feed address from this publisher is required.");
  let url: string = source.feedUrl;
  for (let redirects = 0; redirects <= 2; redirects++) {
    if (!sourceAllowsUrl(source.key, url))
      throw new Error("The feed redirected outside its approved publisher.");
    const response = await fetch(url, {
      redirect: "manual",
      signal: AbortSignal.timeout(15_000),
      headers: {
        "User-Agent": "BluebirdLocal/1.0 (+https://onbluebird.com/contact)",
        Accept: "application/rss+xml, application/atom+xml, application/xml, text/xml",
        ...(etag ? { "If-None-Match": etag } : {}),
        ...(lastModified ? { "If-Modified-Since": lastModified } : {}),
      },
    });
    if (response.status === 304) return { unchanged: true as const, etag, lastModified, xml: "" };
    if ([301, 302, 303, 307, 308].includes(response.status)) {
      const next = response.headers.get("location");
      if (!next) throw new Error("Feed redirect has no destination.");
      url = new URL(next, url).href;
      continue;
    }
    if (!response.ok || !response.body)
      throw new Error(
        `Publisher feed unavailable (${response.status}); published stories retained.`,
      );
    if (Number(response.headers.get("content-length")) > NEWS_MAX_FEED_BYTES)
      throw new Error("Publisher feed exceeds the size limit.");
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let bytes = 0;
    let xml = "";
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      bytes += value.byteLength;
      if (bytes > NEWS_MAX_FEED_BYTES) {
        await reader.cancel();
        throw new Error("Publisher feed exceeds the size limit.");
      }
      xml += decoder.decode(value, { stream: true });
    }
    xml += decoder.decode();
    return {
      unchanged: false as const,
      xml,
      etag: response.headers.get("etag"),
      lastModified: response.headers.get("last-modified"),
    };
  }
  throw new Error("Publisher feed redirected too many times.");
}
