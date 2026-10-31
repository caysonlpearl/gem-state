/* eslint-disable @typescript-eslint/no-explicit-any */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { classifiedCategories, marketplaceCities } from "@/config/classifieds";
import {
  articleIsIndexable,
  newsCard,
  newsFilters,
  NEWS_PAGE_SIZE,
  NEWS_TOPICS,
  relatedEditorialListings,
  safeNewsUrl,
  sourceAllowsUrl,
  type EditorialArticle,
  type EditorialSource,
  type NewsCard,
} from "@/lib/editorial-contract";

const topics = NEWS_TOPICS.map((t) => t.slug) as [string, ...string[]];
const categories = z
  .array(
    z
      .string()
      .refine(
        (value) => classifiedCategories.some((c) => c.slug === value),
        "Choose an existing classified category.",
      ),
  )
  .max(6);
const scope = z.object({
  categorySlugs: categories.default([]),
  city: z.string().trim().max(100).nullable().default(null),
  state: z.enum(["ID", "UT"]).default("ID"),
});
const now = () => new Date().toISOString();
async function freshEditorialResponse() {
  const { setResponseHeader } = await import("@tanstack/react-start/server");
  setResponseHeader("Cache-Control", "private, no-store");
}
async function requireNewsAdmin(context: { supabase: unknown; userId: string }) {
  await freshEditorialResponse();
  const { data, error } = await (context.supabase as any).rpc("has_role", {
    _user_id: context.userId,
    _role: "admin",
  });
  if (error || !data) throw new Error("Administrator access required.");
}
function publicCard(row: any): NewsCard {
  const card = newsCard(row);
  if (card.kind === "licensed" && row.sourceImagesPermitted === false) {
    card.imageUrl = null;
    card.imageCredit = null;
  }
  return card;
}
export const getNewsIndex = createServerFn({ method: "GET" })
  .validator((input: unknown) => newsFilters((input || {}) as Record<string, unknown>))
  .handler(async ({ data }) => {
    await freshEditorialResponse();
    const { editorialDb, articleFromRow, EDITORIAL_CARD_COLUMNS } =
      await import("@/lib/editorial-store.server");
    const db = await editorialDb();
    let query = db
      .from("editorial_public_articles")
      .select(`${EDITORIAL_CARD_COLUMNS},source_images_permitted`, { count: "exact" });
    if (data.topic) query = query.eq("topic", data.topic);
    if (data.state) query = query.eq("state", data.state);
    const {
      data: rows,
      error,
      count,
    } = await query
      .order("featured", { ascending: false })
      .order("state", { ascending: true })
      .order("published_at", { ascending: false })
      .order("id")
      .range((data.page - 1) * NEWS_PAGE_SIZE, data.page * NEWS_PAGE_SIZE - 1)
      .abortSignal(AbortSignal.timeout(8000));
    // PostgREST reports an out-of-range page as 416 rather than an empty
    // result. Let the route return its normal 404 for that page.
    if (error && !(data.page > 1 && error.code === "PGRST103"))
      throw new Error("Bluebird Local is temporarily unavailable. Please try again.");
    return {
      cards: ((rows || []) as any[]).map((row: any) =>
        publicCard({ ...articleFromRow(row), sourceImagesPermitted: row.source_images_permitted }),
      ),
      total: count || 0,
      page: data.page,
      pageSize: NEWS_PAGE_SIZE,
    };
  });

export const getNewsArticle = createServerFn({ method: "GET" })
  .validator((input: unknown) =>
    z
      .object({
        slug: z
          .string()
          .regex(/^[a-z0-9-]+$/)
          .max(220),
      })
      .parse(input),
  )
  .handler(async ({ data }): Promise<EditorialArticle | null> => {
    await freshEditorialResponse();
    const { editorialDb, articleFromRow, EDITORIAL_CARD_COLUMNS } =
      await import("@/lib/editorial-store.server");
    const { sanitizeEditorialHtml, sanitizeOriginalHtml, editorialBodySections } =
      await import("@/lib/editorial-feed.server");
    const { data: row, error } = await (
      await editorialDb()
    )
      .from("editorial_public_articles")
      .select(`${EDITORIAL_CARD_COLUMNS},body_html,source_images_permitted`)
      .eq("slug", data.slug)
      .is("guide_path", null)
      .neq("kind", "external")
      .maybeSingle()
      .abortSignal(AbortSignal.timeout(8000));
    if (error) throw new Error("This article is temporarily unavailable. Please try again.");
    if (!row) return null;
    const article = articleFromRow(row);
    article.bodyHtml =
      article.kind === "licensed"
        ? sanitizeEditorialHtml(
            article.bodyHtml,
            Boolean(row.source_images_permitted),
            article.sourceName || "",
          )
        : sanitizeOriginalHtml(article.bodyHtml);
    article.bodySections = editorialBodySections(article.bodyHtml, article.kind);
    if (article.kind === "licensed" && !row.source_images_permitted) {
      article.imageUrl = null;
      article.imageCredit = null;
    }
    return article;
  });

export const getNewsRelatedListings = createServerFn({ method: "GET" })
  .validator((input: unknown) => scope.parse(input))
  .handler(async ({ data }) => {
    const { readHomepageSnapshot } = await import("@/lib/homepage-snapshot.server");
    const { HOME_MAX_STALE_MS } = await import("@/lib/homepage-snapshot-contract");
    try {
      const snapshot = await readHomepageSnapshot();
      const cards = Object.values(snapshot.sections).flatMap((section) =>
        section && Date.now() - section.updatedAt < HOME_MAX_STALE_MS ? section.cards : [],
      );
      return relatedEditorialListings(cards, data.categorySlugs, data.city, data.state);
    } catch {
      return [];
    }
  });

export type NewsAdminArticle = EditorialArticle & {
  updatedAt: string;
  sourceId: string | null;
  reviewReason: string | null;
  pendingUpdate: boolean;
  manualRevision: number;
  draftText?: string | null;
};
export const getNewsAdmin = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await requireNewsAdmin(context);
    const { editorialDb, articleFromRow, sourceFromRow, EDITORIAL_CARD_COLUMNS } =
      await import("@/lib/editorial-store.server");
    const db = await editorialDb();
    const [articles, sources, runs, performance] = await Promise.all([
      db
        .from("editorial_articles")
        .select(
          `${EDITORIAL_CARD_COLUMNS},updated_at,source_id,review_reason,pending_hash:pending_update->>source_hash,manual_revision`,
        )
        .order("updated_at", { ascending: false })
        .limit(500),
      db.from("editorial_sources").select("*").order("name"),
      db
        .from("editorial_refresh_runs")
        .select(
          "id,source_id,started_at,finished_at,status,discovered,created,updated,review_count,error",
        )
        .order("started_at", { ascending: false })
        .limit(20),
      db.rpc("editorial_performance", { _days: 30 }),
    ]);
    if (articles.error || sources.error || runs.error)
      throw new Error(
        "The news workspace could not load. Check the editorial migration is installed.",
      );
    return {
      performance: performance.error ? null : ((performance.data || {}) as Record<string, number>),
      articles: ((articles.data || []) as any[]).map((row: any): NewsAdminArticle => ({
        ...articleFromRow(row),
        updatedAt: row.updated_at,
        sourceId: row.source_id,
        reviewReason: row.review_reason,
        pendingUpdate: Boolean(row.pending_hash),
        manualRevision: row.manual_revision,
      })),
      sources: (sources.data || []).map(sourceFromRow) as EditorialSource[],
      runs: runs.data as {
        id: string;
        source_id: string;
        started_at: string;
        status: string;
        discovered: number;
        created: number;
        updated: number;
        review_count: number;
        error: string | null;
      }[],
    };
  });
export const getNewsAdminArticle = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }): Promise<NewsAdminArticle> => {
    await requireNewsAdmin(context);
    const { editorialDb, articleFromRow } = await import("@/lib/editorial-store.server");
    const { data: row, error } = await (
      await editorialDb()
    )
      .from("editorial_articles")
      .select("*")
      .eq("id", data.id)
      .single();
    if (error || !row) throw new Error("This article could not be loaded.");
    return {
      ...articleFromRow(row),
      publishedAt: row.published_at,
      updatedAt: row.updated_at,
      sourceId: row.source_id,
      reviewReason: row.review_reason,
      pendingUpdate: Boolean(row.pending_update),
      manualRevision: row.manual_revision,
      draftText: row.draft_text,
    };
  });
const articleInput = scope.extend({
  id: z.string().uuid().optional(),
  expectedUpdatedAt: z.string().optional(),
  slug: z
    .string()
    .regex(/^[a-z0-9]+(-[a-z0-9]+)*$/)
    .min(3)
    .max(150),
  title: z.string().trim().min(3).max(220),
  excerpt: z.string().trim().min(10).max(400),
  bodyHtml: z.string().max(150_000),
  topic: z.enum(topics),
  authorName: z.string().trim().min(2).max(160),
  authorUrl: z.string().max(2000).nullable().default(null),
  status: z.enum(["draft", "review", "scheduled", "published", "archived"]),
  publishedAt: z.string().datetime(),
  featured: z.boolean(),
  imageUrl: z.string().max(2000).nullable(),
  imageCredit: z.string().trim().max(500).nullable(),
  imageRights: z.string().trim().max(1000).nullable(),
});
async function prepareArticle(input: z.infer<typeof articleInput>, existing: any) {
  const { originalDraftHtml, sanitizeEditorialHtml, editorialPlainText } =
    await import("@/lib/editorial-feed.server");
  const { articleToRow } = await import("@/lib/editorial-store.server");
  const { id: _id, expectedUpdatedAt: _expected, ...article } = input;
  if (article.city && !marketplaceCities.some((city) => city === article.city))
    throw new Error("Choose a city from Bluebird's existing locations.");
  if (article.authorUrl && !safeNewsUrl(article.authorUrl))
    throw new Error("Author links must use a valid public HTTPS address.");
  if (
    article.imageUrl &&
    !(article.imageUrl.startsWith("/images/") && !article.imageUrl.includes("..")) &&
    !safeNewsUrl(article.imageUrl)
  )
    throw new Error("Use a valid public HTTPS photograph address.");
  if (
    article.imageUrl &&
    (!article.imageCredit || !article.imageRights || article.imageRights.length < 12)
  )
    throw new Error("Record the photograph credit and permission before using it.");
  const kind = existing?.kind || "original";
  const bodyHtml =
    kind === "original"
      ? originalDraftHtml(article.bodyHtml)
      : kind === "licensed"
        ? sanitizeEditorialHtml(
            existing.body_html,
            Boolean(existing.image_rights),
            existing.source_name || "",
            existing.source_url || undefined,
          )
        : "";
  if (existing && article.slug !== existing.slug)
    throw new Error(
      "An existing article keeps its address. Create a new draft for a different address.",
    );
  if (article.status === "scheduled" && Date.parse(article.publishedAt) <= Date.now())
    throw new Error("Choose a future publication time to schedule this article.");
  if (
    kind !== "external" &&
    !existing?.guide_path &&
    ["published", "scheduled"].includes(article.status) &&
    editorialPlainText(bodyHtml).length < 30
  )
    throw new Error("Add the complete article before publishing.");
  const status =
    article.status === "published" && Date.parse(article.publishedAt) > Date.now()
      ? "scheduled"
      : article.status;
  return {
    ...articleToRow({ ...article, bodyHtml, status, kind } as Partial<EditorialArticle>),
    draft_text: kind === "original" ? article.bodyHtml : null,
    ...(kind === "external" ? { image_url: null, image_credit: null, image_rights: null } : {}),
    manual_revision: (existing?.manual_revision || 0) + 1,
    content_modified_at: now(),
    review_reason: existing?.pending_update
      ? existing.review_reason || "A publisher update is waiting for review."
      : null,
  };
}
export const saveNewsArticle = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => articleInput.parse(input))
  .handler(async ({ data, context }) => {
    await requireNewsAdmin(context);
    const { editorialDb } = await import("@/lib/editorial-store.server");
    const db = await editorialDb();
    const found = data.id
      ? await db.from("editorial_articles").select("*").eq("id", data.id).single()
      : { data: null, error: null };
    if (found.error) throw new Error("This article no longer exists.");
    const fields = await prepareArticle(data, found.data);
    let query = data.id
      ? db
          .from("editorial_articles")
          .update(fields)
          .eq("id", data.id)
          .eq("updated_at", data.expectedUpdatedAt || "1970-01-01")
      : db.from("editorial_articles").insert(fields);
    query = query.select("id,slug,status").maybeSingle();
    const { data: saved, error } = await query;
    if (error?.code === "23505")
      throw new Error("That article address is already in use. Choose a different slug.");
    if (error) throw new Error(error.message || "This article could not be saved.");
    if (!saved)
      throw new Error("This article changed in another window. Reload before saving your version.");
    await db.from("editorial_audit_events").insert({
      actor_user_id: context.userId,
      article_id: saved.id,
      action: "article_saved",
      details: { status: saved.status },
    });
    return saved as { id: string; slug: string; status: string };
  });

export const previewNewsArticle = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => articleInput.parse(input))
  .handler(async ({ data, context }): Promise<EditorialArticle> => {
    await requireNewsAdmin(context);
    const { editorialDb, articleFromRow } = await import("@/lib/editorial-store.server");
    const found = data.id
      ? await (
          await editorialDb()
        )
          .from("editorial_articles")
          .select("*")
          .eq("id", data.id)
          .single()
      : { data: null, error: null };
    if (found.error) throw new Error("This article no longer exists.");
    const fields = await prepareArticle(data, found.data);
    const article = articleFromRow({
      ...found.data,
      ...fields,
      id: data.id || "preview",
      source_name: found.data?.source_name || null,
      source_url: found.data?.source_url || null,
    });
    article.bodySections = (await import("@/lib/editorial-feed.server")).editorialBodySections(
      article.bodyHtml,
      article.kind,
    );
    return article;
  });

export const updateNewsSource = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) =>
    z
      .object({
        id: z.string().uuid(),
        feedUrl: z.string().trim().max(2000),
        enabled: z.boolean(),
        autoPublish: z.boolean(),
        usage: z.enum(["link", "full"]),
        permissionNote: z.string().trim().max(1500),
        imagesPermitted: z.boolean(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    await requireNewsAdmin(context);
    if (data.usage === "full" && data.permissionNote.length < 12)
      throw new Error("Record the publisher terms or written permission covering Bluebird's use.");
    if (data.imagesPermitted && data.usage !== "full")
      throw new Error("Photograph permission requires an approved full-story source.");
    const { editorialDb } = await import("@/lib/editorial-store.server");
    const db = await editorialDb();
    const { data: source, error: lookupError } = await db
      .from("editorial_sources")
      .select("key")
      .eq("id", data.id)
      .single();
    if (lookupError || !source) throw new Error("This news source no longer exists.");
    if ((data.enabled || data.feedUrl) && !sourceAllowsUrl(source.key, data.feedUrl))
      throw new Error("Use a verified HTTPS feed address on this publisher's own website.");
    const { error } = await db
      .from("editorial_sources")
      .update({
        feed_url: data.feedUrl,
        enabled: data.enabled,
        auto_publish: data.autoPublish,
        usage: data.usage,
        permission_note: data.permissionNote,
        images_permitted: data.imagesPermitted,
        etag: null,
        last_modified: null,
        next_refresh_at: now(),
        updated_at: now(),
      })
      .eq("id", data.id);
    if (error) throw new Error("The source settings could not be saved.");
    await db.from("editorial_audit_events").insert({
      actor_user_id: context.userId,
      source_id: data.id,
      action: "source_settings_saved",
      details: { usage: data.usage, enabled: data.enabled, autoPublish: data.autoPublish },
    });
    return { saved: true };
  });
export const refreshNewsSources = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) =>
    z.object({ sourceId: z.string().uuid().optional() }).parse(input || {}),
  )
  .handler(async ({ data, context }) => {
    await requireNewsAdmin(context);
    return (await import("@/lib/editorial-store.server")).refreshEditorialSources(
      true,
      data.sourceId,
    );
  });

export const resolveNewsUpdate = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) =>
    z
      .object({ id: z.string().uuid(), accept: z.boolean(), expectedUpdatedAt: z.string() })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    await requireNewsAdmin(context);
    const { editorialDb } = await import("@/lib/editorial-store.server");
    const db = await editorialDb();
    const { data: row, error } = await db
      .from("editorial_articles")
      .select("pending_update,status,published_at")
      .eq("id", data.id)
      .eq("updated_at", data.expectedUpdatedAt)
      .single();
    if (error || !row?.pending_update)
      throw new Error("Reload the article before resolving this update.");
    // Accepting source text never silently republishes an archived article.
    const fields = data.accept
      ? {
          ...row.pending_update,
          status: ["published", "archived", "scheduled"].includes(row.status)
            ? row.status
            : "review",
          ...(row.status === "scheduled" ? { published_at: row.published_at } : {}),
          manual_revision: 0,
          content_modified_at: now(),
          pending_update: null,
          review_reason: null,
        }
      : { pending_update: null, source_hash: row.pending_update.source_hash, review_reason: null };
    const saved = await db
      .from("editorial_articles")
      .update(fields)
      .eq("id", data.id)
      .eq("updated_at", data.expectedUpdatedAt)
      .select("id")
      .maybeSingle();
    if (saved.error || !saved.data) throw new Error("This article changed. Reload and try again.");
    await db.from("editorial_audit_events").insert({
      actor_user_id: context.userId,
      article_id: data.id,
      action: data.accept ? "publisher_update_accepted" : "publisher_update_declined",
    });
    return { saved: true };
  });

export const previewNewsPublisherUpdate = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }): Promise<EditorialArticle> => {
    await requireNewsAdmin(context);
    const { editorialDb, articleFromRow } = await import("@/lib/editorial-store.server");
    const { data: row, error } = await (
      await editorialDb()
    )
      .from("editorial_articles")
      .select("*")
      .eq("id", data.id)
      .single();
    if (error || !row?.pending_update)
      throw new Error("No publisher update is waiting for this article.");
    const article = articleFromRow({ ...row, ...row.pending_update });
    const { sanitizeEditorialHtml, sanitizeOriginalHtml } =
      await import("@/lib/editorial-feed.server");
    article.bodyHtml =
      article.kind === "licensed"
        ? sanitizeEditorialHtml(
            article.bodyHtml,
            Boolean(article.imageRights),
            article.sourceName || "",
            article.sourceUrl || undefined,
          )
        : sanitizeOriginalHtml(article.bodyHtml);
    return article;
  });

export async function newsSitemapArticles(): Promise<EditorialArticle[]> {
  const { editorialDb, articleFromRow, EDITORIAL_CARD_COLUMNS } =
    await import("@/lib/editorial-store.server");
  const { data, error } = await (
    await editorialDb()
  )
    .from("editorial_public_articles")
    .select(EDITORIAL_CARD_COLUMNS)
    .eq("kind", "original")
    .is("guide_path", null)
    .order("published_at", { ascending: false })
    .limit(10_000);
  if (error) throw new Error("The article sitemap could not be read.");
  return (data || []).map(articleFromRow).filter((a: EditorialArticle) => articleIsIndexable(a));
}
