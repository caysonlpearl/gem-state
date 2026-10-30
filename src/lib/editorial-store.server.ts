/* eslint-disable @typescript-eslint/no-explicit-any */
import { guides } from "../content/guides.ts";
import {
  newsSlug,
  NEWS_REFRESH_MS,
  selectUtahStories,
  type EditorialArticle,
  type EditorialSource,
} from "./editorial-contract.ts";
import { fetchEditorialFeed, parseEditorialFeed, type FeedStory } from "./editorial-feed.server.ts";

export async function editorialDb(): Promise<any> {
  return (await import("../integrations/supabase/client.server")).supabaseAdmin;
}
export const EDITORIAL_CARD_COLUMNS =
  "id,slug,title,excerpt,kind,status,topic,state,city,category_slugs,author_name,author_url,source_name,source_url,source_published_at,published_at,content_modified_at,featured,image_url,image_credit,guide_path";
export function articleFromRow(row: any): EditorialArticle {
  return {
    id: row.id,
    slug: row.slug,
    title: row.title,
    excerpt: row.excerpt || "",
    bodyHtml: row.body_html || "",
    kind: row.kind,
    status: row.status,
    topic: row.topic,
    state: row.state,
    city: row.city,
    categorySlugs: row.category_slugs || [],
    authorName: row.author_name,
    authorUrl: row.author_url,
    sourceName: row.source_name,
    sourceUrl: row.source_url,
    publishedAt: row.source_published_at || row.published_at,
    modifiedAt: row.content_modified_at,
    featured: row.featured,
    imageUrl: row.image_url,
    imageCredit: row.image_credit,
    imageRights: row.image_rights || null,
    guidePath: row.guide_path,
  };
}
export function sourceFromRow(row: any): EditorialSource {
  return {
    id: row.id,
    key: row.key,
    name: row.name,
    feedUrl: row.feed_url,
    website: row.website,
    state: row.state,
    enabled: row.enabled,
    autoPublish: row.auto_publish,
    usage: row.usage,
    permissionNote: row.permission_note,
    imagesPermitted: row.images_permitted,
    lastSuccessAt: row.last_success_at,
    nextRefreshAt: row.next_refresh_at,
    lastError: row.last_error,
  };
}
export function articleToRow(article: Partial<EditorialArticle>) {
  const mapping: Record<string, string> = {
    categorySlugs: "category_slugs",
    authorName: "author_name",
    authorUrl: "author_url",
    sourceName: "source_name",
    sourceUrl: "source_url",
    publishedAt: "published_at",
    modifiedAt: "content_modified_at",
    imageUrl: "image_url",
    imageCredit: "image_credit",
    imageRights: "image_rights",
    bodyHtml: "body_html",
    guidePath: "guide_path",
  };
  return Object.fromEntries(
    Object.entries(article).map(([key, value]) => [mapping[key] || key, value]),
  );
}
export async function seedEditorialGuides(db: any) {
  const rows = guides.map((guide) => ({
    slug: `guide-${guide.slug}`,
    title: guide.title,
    excerpt: guide.description,
    kind: "original",
    status: "published",
    topic: "guides",
    state: "ID",
    category_slugs: guide.categories,
    author_name: "Bluebird Marketplace editorial team",
    author_url: "https://onbluebird.com/news/about",
    source_name: "Bluebird guide",
    guide_path: `/guides/${guide.slug}`,
    published_at: `${guide.published}T15:00:00Z`,
    content_modified_at: `${guide.reviewed}T15:00:00Z`,
    image_url: "/images/guides/guides-cover.jpg",
    image_credit: "Bluebird Marketplace",
    image_rights: "Existing Bluebird guide cover artwork",
    featured: guide.slug === "how-to-buy-a-used-car-in-idaho",
  }));
  const { error } = await db
    .from("editorial_articles")
    .upsert(rows, { onConflict: "guide_path", ignoreDuplicates: true });
  if (error) throw new Error("Could not register existing Bluebird guides.");
}
export function editorialSourceUpdate(
  existing: {
    source_hash: string | null;
    manual_revision: number;
    status: string;
    pending_hash?: string | null;
  },
  story: FeedStory,
) {
  if (existing.source_hash === story.contentHash || existing.pending_hash === story.contentHash)
    return "unchanged";
  if (existing.manual_revision > 0 || existing.status === "archived") return "review";
  return "update";
}
export function sourceStoryFields(
  source: EditorialSource,
  story: FeedStory,
): Record<string, unknown> {
  const { sourceKey: _key, sourcePublishedAt, reviewReason, contentHash, ...article } = story;
  return {
    ...articleToRow(article),
    source_id: source.id,
    source_hash: contentHash,
    source_published_at: sourcePublishedAt,
    review_reason: reviewReason,
  };
}
export function storyFingerprint(story: Pick<FeedStory, "title" | "authorName" | "publishedAt">) {
  return [newsSlug(story.title), newsSlug(story.authorName), story.publishedAt.slice(0, 10)].join(
    "|",
  );
}
export async function ingestEditorialStories(
  db: any,
  source: EditorialSource,
  stories: FeedStory[],
) {
  const counts = { created: 0, updated: 0, review: 0 };
  if (!stories.length) return counts;
  if (source.state === "UT") {
    const prior = await db
      .from("editorial_articles")
      .select("source_url,published_at")
      .eq("state", "UT")
      .eq("status", "published")
      .gte("published_at", new Date(Date.now() - 31 * 86_400_000).toISOString());
    if (prior.error) throw new Error("Could not check the regional story selections.");
    stories = selectUtahStories(stories, prior.data || []);
  }
  const { data: existingRows, error: readError } = await db
    .from("editorial_articles")
    .select(
      "id,source_url,source_hash,manual_revision,status,pending_hash:pending_update->>source_hash",
    )
    .in(
      "source_url",
      stories.map((story) => story.sourceUrl),
    );
  if (readError) throw new Error("Could not check saved stories.");
  const existing = new Map<string, any>(
    ((existingRows || []) as any[]).map((row) => [row.source_url, row]),
  );
  const fresh = stories.filter((story) => !existing.has(story.sourceUrl!));
  if (fresh.length) {
    const { data: duplicates, error } = await db
      .from("editorial_articles")
      .select("source_fingerprint")
      .in("source_fingerprint", fresh.map(storyFingerprint));
    if (error) throw new Error("Could not check duplicate stories.");
    const fingerprints = new Set<string>(
      ((duplicates || []) as any[]).map((row) => row.source_fingerprint),
    );
    const rows = fresh
      .filter((story) => {
        const key = storyFingerprint(story);
        if (fingerprints.has(key)) return false;
        fingerprints.add(key);
        return true;
      })
      .map((story) => ({
        ...sourceStoryFields(source, story),
        source_fingerprint: storyFingerprint(story),
        slug: `${newsSlug(story.title) || "local-story"}-${source.key}-${story.contentHash.slice(0, 8)}`,
        content_modified_at: story.publishedAt,
      }));
    if (rows.length) {
      const result = await db
        .from("editorial_articles")
        .upsert(rows, { onConflict: "source_url", ignoreDuplicates: true })
        .select("id,status");
      if (result.error && result.error.code !== "23505")
        throw new Error("Could not save the new stories.");
      if (result.error?.code === "23505") {
        // Another publisher's worker may have saved a syndicated duplicate at
        // the same instant. The unique fingerprint protects both workers.
        for (const row of rows) {
          const one = await db
            .from("editorial_articles")
            .insert(row)
            .select("id,status")
            .maybeSingle();
          if (one.error && one.error.code !== "23505")
            throw new Error("Could not save a new story.");
          if (one.data) counts[one.data.status === "review" ? "review" : "created"]++;
        }
      } else
        for (const row of result.data || [])
          counts[row.status === "review" ? "review" : "created"]++;
    }
  }
  for (const story of stories) {
    const previous = existing.get(story.sourceUrl!);
    if (!previous) continue;
    const action = editorialSourceUpdate(previous, story);
    if (action === "unchanged") continue;
    const fields = sourceStoryFields(source, story);
    if (action === "update") {
      const result = await db
        .from("editorial_articles")
        .update({ ...fields, content_modified_at: new Date().toISOString(), pending_update: null })
        .eq("id", previous.id)
        .eq("manual_revision", 0)
        .select("id")
        .maybeSingle();
      if (result.error) throw new Error("Could not update the saved story.");
      if (result.data) {
        counts.updated++;
        continue;
      }
    }
    const { error } = await db
      .from("editorial_articles")
      .update({
        pending_update: fields,
        review_reason:
          "The publisher updated this story. Review it before replacing your Bluebird version.",
      })
      .eq("id", previous.id);
    if (error) throw new Error("Could not save the publisher update for review.");
    counts.review++;
  }
  return counts;
}
export async function refreshEditorialSources(force = false, sourceId?: string) {
  const db = await editorialDb();
  await seedEditorialGuides(db);
  const { error: dueError } = await db
    .from("editorial_articles")
    .update({ status: "published" })
    .eq("status", "scheduled")
    .lte("published_at", new Date().toISOString());
  if (dueError) throw new Error("Scheduled articles could not be published.");
  let query = db.from("editorial_sources").select("*").eq("enabled", true);
  if (!force) query = query.lte("next_refresh_at", new Date().toISOString());
  if (sourceId) query = query.eq("id", sourceId);
  const { data: rows, error } = await query;
  if (error) throw new Error("News sources could not be read.");
  const results: {
    source: string;
    status: string;
    created?: number;
    updated?: number;
    review?: number;
  }[] = [];
  // Bound each worker to the four configured feeds, with one distributed lease
  // per source. Never call classifieds or provider refresh code from here.
  for (const row of (rows || []).slice(0, 4)) {
    const source = sourceFromRow(row);
    const { data: token, error: leaseError } = await db.rpc("reserve_editorial_refresh", {
      _source_id: source.id,
      _force: force,
    });
    if (leaseError) throw new Error("The news refresh lease is unavailable.");
    if (!token) {
      results.push({ source: source.name, status: "not_due" });
      continue;
    }
    const { data: run, error: runError } = await db
      .from("editorial_refresh_runs")
      .insert({ source_id: source.id })
      .select("id")
      .single();
    if (runError) throw new Error("Could not record the news refresh.");
    try {
      const feed = await fetchEditorialFeed(source, row.etag, row.last_modified);
      const stories = feed.unchanged ? [] : await parseEditorialFeed(feed.xml, source);
      const { created, updated, review } = await ingestEditorialStories(db, source, stories);
      const now = new Date().toISOString();
      const { error: finishError } = await db
        .from("editorial_sources")
        .update({
          last_success_at: now,
          next_refresh_at: new Date(Date.now() + NEWS_REFRESH_MS).toISOString(),
          last_error: null,
          etag: feed.etag,
          last_modified: feed.lastModified,
          refresh_lease_until: null,
          refresh_token: null,
        })
        .eq("id", source.id)
        .eq("refresh_token", token);
      if (finishError) throw new Error("Could not record the completed refresh.");
      await db
        .from("editorial_refresh_runs")
        .update({
          status: feed.unchanged ? "unchanged" : "completed",
          finished_at: now,
          discovered: stories.length,
          created,
          updated,
          review_count: review,
        })
        .eq("id", run.id);
      results.push({
        source: source.name,
        status: feed.unchanged ? "unchanged" : "completed",
        created,
        updated,
        review,
      });
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "Publisher refresh failed; existing stories retained.";
      await db
        .from("editorial_sources")
        .update({
          last_error: message.slice(0, 500),
          next_refresh_at: new Date(Date.now() + 60 * 60_000).toISOString(),
          refresh_lease_until: null,
          refresh_token: null,
        })
        .eq("id", source.id)
        .eq("refresh_token", token);
      await db
        .from("editorial_refresh_runs")
        .update({
          status: "failed",
          finished_at: new Date().toISOString(),
          error: message.slice(0, 500),
        })
        .eq("id", run.id);
      results.push({ source: source.name, status: "failed" });
    }
  }
  return results;
}
