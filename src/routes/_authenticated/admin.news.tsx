import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { classifiedCategories, marketplaceCities } from "@/config/classifieds";
import {
  NEWS_TOPICS,
  NEWS_SOURCE_DEFINITIONS,
  articleHref,
  newsSlug,
  type ArticleStatus,
  type EditorialArticle,
  type EditorialSource,
  type NewsTopic,
} from "@/lib/editorial-contract";
import {
  getNewsAdmin,
  getNewsAdminArticle,
  saveNewsArticle,
  previewNewsArticle,
  updateNewsSource,
  refreshNewsSources,
  resolveNewsUpdate,
  previewNewsPublisherUpdate,
  type NewsAdminArticle,
} from "@/lib/editorial.functions";
import { NewsArticleView } from "@/components/editorial/NewsArticle";

export const Route = createFileRoute("/_authenticated/admin/news")({
  head: () => ({
    meta: [
      { title: "Bluebird Local · News editor" },
      { name: "robots", content: "noindex,nofollow" },
    ],
  }),
  component: NewsAdmin,
});
const field =
  "mt-1 block min-h-11 w-full min-w-0 rounded-xl border border-input bg-background px-3 py-2 text-sm";
const button =
  "inline-flex min-h-11 items-center justify-center rounded-full border border-input bg-card px-4 py-2 text-sm font-semibold hover:border-primary disabled:opacity-50";
const statusLabels: Record<ArticleStatus, string> = {
  draft: "Draft",
  review: "Needs review",
  scheduled: "Scheduled",
  published: "Published",
  archived: "Archived",
};
function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Please try again.";
}
function localDate(iso: string) {
  const date = new Date(iso);
  return new Date(date.getTime() - date.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
}
type Draft = {
  id?: string;
  expectedUpdatedAt?: string;
  slug: string;
  title: string;
  excerpt: string;
  bodyHtml: string;
  topic: NewsTopic;
  state: "ID" | "UT";
  city: string | null;
  categorySlugs: string[];
  authorName: string;
  authorUrl: string | null;
  status: ArticleStatus;
  publishedAt: string;
  featured: boolean;
  imageUrl: string | null;
  imageCredit: string | null;
  imageRights: string | null;
};
function newDraft(): Draft {
  return {
    slug: "",
    title: "",
    excerpt: "",
    bodyHtml: "",
    topic: "guides",
    state: "ID",
    city: null,
    categorySlugs: [],
    authorName: "Bluebird Marketplace editorial team",
    authorUrl: "https://onbluebird.com/news/about",
    status: "draft",
    publishedAt: new Date().toISOString(),
    featured: false,
    imageUrl: null,
    imageCredit: null,
    imageRights: null,
  };
}
function fromArticle(article: NewsAdminArticle): Draft {
  return {
    id: article.id,
    expectedUpdatedAt: article.updatedAt,
    slug: article.slug,
    title: article.title,
    excerpt: article.excerpt,
    bodyHtml: article.draftText || article.bodyHtml,
    topic: article.topic,
    state: article.state,
    city: article.city,
    categorySlugs: article.categorySlugs,
    authorName: article.authorName,
    authorUrl: article.authorUrl,
    status: article.status,
    publishedAt: article.publishedAt,
    featured: article.featured,
    imageUrl: article.imageUrl,
    imageCredit: article.imageCredit,
    imageRights: article.imageRights,
  };
}

function SourceSettings({
  source,
  invalidate,
}: {
  source: EditorialSource;
  invalidate: () => Promise<unknown>;
}) {
  const [settings, setSettings] = useState({
    id: source.id,
    feedUrl: source.feedUrl,
    enabled: source.enabled,
    autoPublish: source.autoPublish,
    usage: source.usage,
    permissionNote: source.permissionNote,
    imagesPermitted: source.imagesPermitted,
  });
  const update = useServerFn(updateNewsSource);
  const save = useMutation({
    mutationFn: () => update({ data: settings }),
    onSuccess: async () => {
      await invalidate();
      toast.success("Source settings saved.");
    },
    onError: (error) => toast.error(errorMessage(error)),
  });
  const policy = NEWS_SOURCE_DEFINITIONS.find((item) => item.key === source.key)?.policyUrl;
  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        save.mutate();
      }}
      className="rounded-2xl border border-border bg-card p-5"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="font-bold">{source.name}</h3>
          <p className="mt-1 text-xs text-muted-foreground">
            {source.state === "UT" ? "Utah" : "Idaho"} · Checked every six hours
          </p>
        </div>
        {policy && (
          <a
            href={policy}
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs font-semibold text-primary underline"
          >
            Source & permissions ↗
          </a>
        )}
      </div>
      <div className="mt-4 flex flex-wrap gap-x-5 gap-y-3 text-sm">
        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={settings.enabled}
            onChange={(e) => setSettings({ ...settings, enabled: e.target.checked })}
          />
          Enabled
        </label>
        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={settings.autoPublish}
            onChange={(e) => setSettings({ ...settings, autoPublish: e.target.checked })}
          />
          Publish qualifying stories automatically
        </label>
      </div>
      <label className="mt-4 block text-xs font-semibold">
        Publisher feed address
        <input
          type="url"
          className={field}
          value={settings.feedUrl}
          onChange={(event) => setSettings({ ...settings, feedUrl: event.target.value })}
          required={settings.enabled}
          placeholder="Verified RSS feed on this publisher’s website"
        />
      </label>
      <label className="mt-4 block text-xs font-semibold">
        Story display
        <select
          className={field}
          value={settings.usage}
          onChange={(e) =>
            setSettings({
              ...settings,
              usage: e.target.value as "link" | "full",
              imagesPermitted: false,
            })
          }
        >
          <option value="link">Headlines linking to the publisher</option>
          <option value="full">Full stories with recorded permission</option>
        </select>
      </label>
      {settings.usage === "full" && (
        <>
          <label className="mt-4 block text-xs font-semibold">
            Publisher permission or applicable terms
            <textarea
              className={`${field} min-h-24`}
              value={settings.permissionNote}
              onChange={(e) => setSettings({ ...settings, permissionNote: e.target.value })}
              placeholder="Record the terms or written permission covering Bluebird’s use."
              required
              minLength={12}
            />
          </label>
          <label className="mt-3 flex items-start gap-2 text-sm">
            <input
              type="checkbox"
              className="mt-1"
              checked={settings.imagesPermitted}
              onChange={(e) => setSettings({ ...settings, imagesPermitted: e.target.checked })}
            />
            <span>
              Permission also covers photographs credited to this publisher. Other photographs stay
              excluded.
            </span>
          </label>
        </>
      )}
      {source.state === "UT" && (
        <p className="mt-3 text-xs text-muted-foreground">
          Up to four qualifying Utah stories are selected automatically each day. Additional stories
          wait in review.
        </p>
      )}
      <p className="mt-4 text-xs leading-relaxed text-muted-foreground">
        Last successful check:{" "}
        {source.lastSuccessAt ? new Date(source.lastSuccessAt).toLocaleString() : "Not checked yet"}
        {source.nextRefreshAt && source.enabled
          ? ` · Next check: ${new Date(source.nextRefreshAt).toLocaleString()}`
          : ""}
      </p>
      {source.lastError && (
        <p className="mt-2 rounded-lg bg-amber-50 p-3 text-xs text-amber-900">{source.lastError}</p>
      )}
      <button type="submit" className={`${button} mt-4`} disabled={save.isPending}>
        {save.isPending ? "Saving…" : "Save source settings"}
      </button>
    </form>
  );
}
function NewsAdmin() {
  const queryClient = useQueryClient();
  const getAdmin = useServerFn(getNewsAdmin);
  const getArticle = useServerFn(getNewsAdminArticle);
  const saveArticle = useServerFn(saveNewsArticle);
  const previewArticle = useServerFn(previewNewsArticle);
  const refreshSources = useServerFn(refreshNewsSources);
  const resolveUpdate = useServerFn(resolveNewsUpdate);
  const previewPublisher = useServerFn(previewNewsPublisherUpdate);
  const query = useQuery({
    queryKey: ["editorial", "admin"],
    queryFn: () => getAdmin(),
    retry: false,
  });
  const invalidate = () => queryClient.invalidateQueries({ queryKey: ["editorial"] });
  const [tab, setTab] = useState<"stories" | "sources" | "history">("stories");
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("");
  const [draft, setDraft] = useState<Draft>(newDraft);
  const [selected, setSelected] = useState<NewsAdminArticle | null>(null);
  const [preview, setPreview] = useState<EditorialArticle | null>(null);
  const set = <K extends keyof Draft>(key: K, value: Draft[K]) => {
    setDraft((current) => ({ ...current, [key]: value }));
    setPreview(null);
  };
  const load = useMutation({
    mutationFn: (id: string) => getArticle({ data: { id } }),
    onSuccess: (article) => {
      setSelected(article);
      setDraft(fromArticle(article));
      setPreview(null);
    },
    onError: (error) => toast.error(errorMessage(error)),
  });
  const save = useMutation({
    mutationFn: () => saveArticle({ data: draft }),
    onSuccess: async (saved) => {
      await invalidate();
      const article = await getArticle({ data: { id: saved.id } });
      setSelected(article);
      setDraft(fromArticle(article));
      setPreview(null);
      toast.success(
        saved.status === "published"
          ? "Article published."
          : saved.status === "scheduled"
            ? "Article scheduled."
            : "Article saved.",
      );
    },
    onError: (error) => toast.error(errorMessage(error)),
  });
  const previewMutation = useMutation({
    mutationFn: () => previewArticle({ data: draft }),
    onSuccess: setPreview,
    onError: (error) => toast.error(errorMessage(error)),
  });
  const publisherPreview = useMutation({
    mutationFn: () => previewPublisher({ data: { id: selected!.id } }),
    onSuccess: setPreview,
    onError: (error) => toast.error(errorMessage(error)),
  });
  const refresh = useMutation({
    mutationFn: () => refreshSources({ data: {} }),
    onSuccess: async (results) => {
      await invalidate();
      const failures = results.filter((r) => r.status === "failed").length;
      if (failures)
        toast.error(
          `${failures} source${failures > 1 ? "s are" : " is"} unavailable. Saved stories are still available.`,
        );
      else
        toast.success(
          results.every((r) => r.status === "not_due")
            ? "Sources were checked recently. Please wait a minute before refreshing again."
            : "News sources refreshed.",
        );
    },
    onError: (error) => toast.error(errorMessage(error)),
  });
  const resolve = useMutation({
    mutationFn: (accept: boolean) =>
      resolveUpdate({ data: { id: selected!.id, expectedUpdatedAt: selected!.updatedAt, accept } }),
    onSuccess: async () => {
      await invalidate();
      if (selected) load.mutate(selected.id);
      toast.success("Publisher update resolved.");
    },
    onError: (error) => toast.error(errorMessage(error)),
  });
  const articles = (query.data?.articles || []).filter(
    (article) =>
      (!status || article.status === status) &&
      `${article.title} ${article.sourceName || ""}`.toLowerCase().includes(search.toLowerCase()),
  );
  const original = !selected || selected.kind === "original";
  const guide = Boolean(selected?.guidePath);
  return (
    <div className="mx-auto max-w-[1400px] px-4 py-7 sm:px-7 sm:py-10">
      <header className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <a href="/admin" className="text-xs font-semibold text-primary">
            ← Admin
          </a>
          <h1 className="mt-2 text-3xl font-bold tracking-tight">Bluebird Local</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Stories, source permissions, and paths into the classifieds.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <a href="/news" target="_blank" rel="noopener noreferrer" className={button}>
            View news page ↗
          </a>
          <button className={button} disabled={refresh.isPending} onClick={() => refresh.mutate()}>
            {refresh.isPending ? "Checking sources…" : "Refresh sources"}
          </button>
          <button
            className={`${button} bg-primary text-primary-foreground`}
            onClick={() => {
              setSelected(null);
              setDraft(newDraft());
              setPreview(null);
              setTab("stories");
            }}
          >
            New article
          </button>
        </div>
      </header>
      {query.data?.performance && (
        <section
          aria-label="Last 30 days from articles"
          className="mt-7 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6"
        >
          {[
            ["Article reads", "articleViews"],
            ["Classifieds clicks", "ctaClicks"],
            ["Listing views", "listingViews"],
            ["Inquiries completed", "sellerContacts"],
            ["Posts started", "postingStarted"],
            ["Listings submitted", "postingCompleted"],
          ].map(([label, key]) => (
            <div key={key} className="rounded-xl border border-border bg-card p-4">
              <p className="text-[11px] text-muted-foreground">{label}</p>
              <p className="mt-1 text-2xl font-bold">
                {(query.data.performance?.[key] || 0).toLocaleString()}
              </p>
              <p className="mt-1 text-[10px] text-muted-foreground">Last 30 days</p>
            </div>
          ))}
        </section>
      )}
      <nav
        aria-label="News workspace"
        className="my-7 flex flex-wrap gap-2 border-b border-border pb-4"
      >
        {(["stories", "sources", "history"] as const).map((name) => (
          <button
            key={name}
            className={`${button} ${tab === name ? "border-primary bg-primary/5" : ""}`}
            aria-pressed={tab === name}
            onClick={() => setTab(name)}
          >
            {name === "stories"
              ? "Articles"
              : name === "sources"
                ? "Sources & permissions"
                : "Refresh history"}
          </button>
        ))}
      </nav>
      {query.isPending ? (
        <p className="py-10 text-muted-foreground">Loading your news workspace…</p>
      ) : query.error ? (
        <div className="rounded-xl border border-border bg-card p-6">
          <p>{errorMessage(query.error)}</p>
          <button className={`${button} mt-4`} onClick={() => void query.refetch()}>
            Try again
          </button>
        </div>
      ) : (
        <>
          {tab === "sources" && (
            <>
              <p className="mb-5 max-w-3xl text-sm leading-relaxed text-muted-foreground">
                Headlines can link to their original publisher. Full article text and photographs
                are enabled separately after you record permission covering Bluebird’s use. A feed
                being publicly accessible does not establish those permissions.
              </p>
              <div className="grid gap-5 lg:grid-cols-2">
                {query.data?.sources.map((source) => (
                  <SourceSettings
                    key={`${source.id}-${source.enabled}-${source.autoPublish}-${source.usage}-${source.permissionNote}-${source.imagesPermitted}`}
                    source={source}
                    invalidate={invalidate}
                  />
                ))}
              </div>
            </>
          )}
          {tab === "history" && (
            <section className="space-y-3">
              {!query.data?.runs.length && (
                <p className="text-sm text-muted-foreground">No source checks have run yet.</p>
              )}
              {query.data?.runs.map((run) => (
                <article key={run.id} className="rounded-xl border border-border bg-card p-4">
                  <div className="flex flex-wrap justify-between gap-3">
                    <h2 className="text-sm font-bold">
                      {query.data.sources.find((s) => s.id === run.source_id)?.name ||
                        "News source"}
                    </h2>
                    <span className="text-xs text-muted-foreground">
                      {new Date(run.started_at).toLocaleString()}
                    </span>
                  </div>
                  <p className="mt-2 text-sm">
                    {run.status === "unchanged"
                      ? "No source changes"
                      : run.status === "completed"
                        ? "Completed"
                        : run.status === "failed"
                          ? "Source unavailable"
                          : "Checking"}{" "}
                    · {run.discovered} read · {run.created} new · {run.updated} updated ·{" "}
                    {run.review_count} for review
                  </p>
                  {run.error && <p className="mt-2 text-xs text-amber-800">{run.error}</p>}
                </article>
              ))}
            </section>
          )}
          {tab === "stories" && (
            <div className="grid items-start gap-6 lg:grid-cols-[310px_minmax(0,1fr)]">
              <aside className="rounded-2xl border border-border bg-card p-4">
                <h2 className="font-bold">Articles ({query.data?.articles.length || 0})</h2>
                <label className="mt-3 block text-xs font-semibold">
                  Find an article
                  <input
                    className={field}
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="Title or publisher"
                  />
                </label>
                <label className="mt-3 block text-xs font-semibold">
                  Publication status
                  <select
                    className={field}
                    value={status}
                    onChange={(e) => setStatus(e.target.value)}
                  >
                    <option value="">All articles</option>
                    {Object.entries(statusLabels).map(([value, label]) => (
                      <option key={value} value={value}>
                        {label}
                      </option>
                    ))}
                  </select>
                </label>
                <ul className="mt-4 max-h-[680px] space-y-2 overflow-auto">
                  {articles.map((article) => (
                    <li key={article.id}>
                      <button
                        className={`w-full rounded-xl border p-3 text-left ${selected?.id === article.id ? "border-primary bg-primary/5" : "border-border hover:border-primary/40"}`}
                        disabled={load.isPending || save.isPending}
                        onClick={() => load.mutate(article.id)}
                      >
                        <span className="block text-[13px] font-semibold leading-snug">
                          {article.title}
                        </span>
                        <span className="mt-2 block text-[10px] text-muted-foreground">
                          {statusLabels[article.status]}
                          {article.featured ? " · Featured" : ""}
                          {article.pendingUpdate ? " · Publisher update" : ""} ·{" "}
                          {article.guidePath
                            ? "Existing guide"
                            : article.kind === "external"
                              ? "Publisher link"
                              : article.sourceName || "Bluebird original"}
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              </aside>
              <section className="min-w-0 rounded-2xl border border-border bg-card p-5 sm:p-7">
                <h2 className="text-xl font-bold">
                  {selected ? "Edit article" : "New Bluebird article"}
                </h2>
                {load.isPending ? (
                  <p className="mt-6">Loading article…</p>
                ) : (
                  <form
                    className="mt-5 space-y-5"
                    onSubmit={(e) => {
                      e.preventDefault();
                      save.mutate();
                    }}
                  >
                    {selected?.reviewReason && (
                      <div className="rounded-xl bg-amber-50 p-4 text-sm text-amber-900">
                        <p>{selected.reviewReason}</p>
                        {selected.pendingUpdate && (
                          <div className="mt-3 flex flex-wrap gap-2">
                            <button
                              type="button"
                              className={button}
                              disabled={publisherPreview.isPending}
                              onClick={() => publisherPreview.mutate()}
                            >
                              Preview publisher update
                            </button>
                            <button
                              type="button"
                              className={button}
                              disabled={resolve.isPending}
                              onClick={() => resolve.mutate(true)}
                            >
                              Apply publisher update
                            </button>
                            <button
                              type="button"
                              className={button}
                              disabled={resolve.isPending}
                              onClick={() => resolve.mutate(false)}
                            >
                              Keep Bluebird version
                            </button>
                          </div>
                        )}
                      </div>
                    )}
                    <label className="block text-xs font-semibold">
                      Headline
                      <input
                        className={field}
                        required
                        maxLength={220}
                        value={draft.title}
                        onChange={(e) => {
                          const title = e.target.value;
                          setDraft((d) => ({
                            ...d,
                            title,
                            slug:
                              !d.id && (d.slug === newsSlug(d.title) || !d.slug)
                                ? newsSlug(title)
                                : d.slug,
                          }));
                          setPreview(null);
                        }}
                      />
                    </label>
                    <label className="block text-xs font-semibold">
                      Article address
                      <input
                        className={field}
                        required
                        pattern="[a-z0-9]+(-[a-z0-9]+)*"
                        readOnly={Boolean(draft.id)}
                        value={draft.slug}
                        onChange={(e) => set("slug", e.target.value)}
                      />
                      <span className="mt-1 block text-[11px] font-normal text-muted-foreground">
                        {guide
                          ? selected?.guidePath
                          : `/news/${draft.slug || "your-article-title"}`}
                        {draft.id ? " · Existing addresses stay the same." : ""}
                      </span>
                    </label>
                    <label className="block text-xs font-semibold">
                      Short introduction
                      <textarea
                        className={`${field} min-h-24`}
                        required
                        minLength={10}
                        maxLength={400}
                        value={draft.excerpt}
                        onChange={(e) => set("excerpt", e.target.value)}
                      />
                    </label>
                    {original && !guide ? (
                      <label className="block text-xs font-semibold">
                        Article draft
                        <textarea
                          className={`${field} min-h-80 leading-relaxed`}
                          value={draft.bodyHtml}
                          onChange={(e) => set("bodyHtml", e.target.value)}
                          placeholder="Paste your reviewed draft. Separate paragraphs with a blank line. Use ## for section headings and [link text](https://example.com) for sources."
                        />
                      </label>
                    ) : (
                      <p className="rounded-xl bg-secondary p-4 text-sm text-muted-foreground">
                        {guide
                          ? "This guide keeps its existing page and article content. You can change its placement in Bluebird Local here."
                          : selected?.kind === "licensed"
                            ? "Publisher copy and attribution stay intact. Preview the article to read it; use the fields below to organize its classified links."
                            : "This headline links to the original publisher. Bluebird does not reproduce its article or photographs."}
                        {selected && (
                          <a
                            href={articleHref(selected)}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="ml-1 font-semibold text-primary underline"
                          >
                            Open story ↗
                          </a>
                        )}
                      </p>
                    )}
                    <div className="grid gap-4 sm:grid-cols-2">
                      <label className="block text-xs font-semibold">
                        Topic
                        <select
                          className={field}
                          value={draft.topic}
                          onChange={(e) => set("topic", e.target.value as NewsTopic)}
                        >
                          {NEWS_TOPICS.map((t) => (
                            <option key={t.slug} value={t.slug}>
                              {t.label}
                            </option>
                          ))}
                        </select>
                      </label>
                      <label className="block text-xs font-semibold">
                        State
                        <select
                          className={field}
                          value={draft.state}
                          onChange={(e) => set("state", e.target.value as "ID" | "UT")}
                        >
                          <option value="ID">Idaho</option>
                          <option value="UT">Utah</option>
                        </select>
                      </label>
                      <label className="block text-xs font-semibold">
                        City (optional)
                        <input
                          list="news-cities"
                          className={field}
                          value={draft.city || ""}
                          onChange={(e) => set("city", e.target.value || null)}
                        />
                        <datalist id="news-cities">
                          {marketplaceCities.map((city) => (
                            <option key={city} value={city} />
                          ))}
                        </datalist>
                      </label>
                      <label className="block text-xs font-semibold">
                        Byline
                        <input
                          className={field}
                          required
                          minLength={2}
                          value={draft.authorName}
                          readOnly={!original}
                          onChange={(e) => set("authorName", e.target.value)}
                        />
                      </label>
                    </div>
                    <fieldset className="rounded-xl border border-border p-4">
                      <legend className="px-2 text-xs font-bold">
                        Relevant classifieds & calls to action
                      </legend>
                      <p className="mb-3 text-xs text-muted-foreground">
                        Choose up to six categories. With none selected, the article points readers
                        to all classifieds.
                      </p>
                      <div className="grid gap-2 sm:grid-cols-2">
                        {classifiedCategories.map((category) => (
                          <label
                            key={category.slug}
                            className="flex min-h-8 items-center gap-2 text-xs"
                          >
                            <input
                              type="checkbox"
                              checked={draft.categorySlugs.includes(category.slug)}
                              disabled={
                                !draft.categorySlugs.includes(category.slug) &&
                                draft.categorySlugs.length >= 6
                              }
                              onChange={(e) =>
                                set(
                                  "categorySlugs",
                                  e.target.checked
                                    ? [...draft.categorySlugs, category.slug]
                                    : draft.categorySlugs.filter((slug) => slug !== category.slug),
                                )
                              }
                            />
                            {category.name}
                          </label>
                        ))}
                      </div>
                    </fieldset>
                    {original && !guide && (
                      <details className="rounded-xl border border-border p-4">
                        <summary className="cursor-pointer text-sm font-semibold">
                          Cover photograph & author link
                        </summary>
                        <label className="mt-4 block text-xs font-semibold">
                          Photograph URL
                          <input
                            className={field}
                            value={draft.imageUrl || ""}
                            onChange={(e) => set("imageUrl", e.target.value || null)}
                            placeholder="https://…"
                          />
                        </label>
                        <label className="mt-3 block text-xs font-semibold">
                          Photographer / credit
                          <input
                            className={field}
                            value={draft.imageCredit || ""}
                            onChange={(e) => set("imageCredit", e.target.value || null)}
                          />
                        </label>
                        <label className="mt-3 block text-xs font-semibold">
                          Permission to use this photograph
                          <input
                            className={field}
                            value={draft.imageRights || ""}
                            onChange={(e) => set("imageRights", e.target.value || null)}
                            placeholder="Ownership, license, or written permission"
                          />
                        </label>
                        <label className="mt-3 block text-xs font-semibold">
                          Author profile URL
                          <input
                            className={field}
                            value={draft.authorUrl || ""}
                            onChange={(e) => set("authorUrl", e.target.value || null)}
                          />
                        </label>
                      </details>
                    )}
                    <div className="grid gap-4 sm:grid-cols-2">
                      <label className="block text-xs font-semibold">
                        Publication status
                        <select
                          className={field}
                          value={draft.status}
                          onChange={(e) => set("status", e.target.value as ArticleStatus)}
                        >
                          {Object.entries(statusLabels).map(([value, label]) => (
                            <option key={value} value={value}>
                              {label}
                            </option>
                          ))}
                        </select>
                      </label>
                      <label className="block text-xs font-semibold">
                        Publication date & time
                        <input
                          className={field}
                          type="datetime-local"
                          required
                          value={localDate(draft.publishedAt)}
                          onChange={(e) => {
                            if (e.target.value)
                              set("publishedAt", new Date(e.target.value).toISOString());
                          }}
                        />
                      </label>
                    </div>
                    <label className="flex items-center gap-2 text-sm">
                      <input
                        type="checkbox"
                        checked={draft.featured}
                        onChange={(e) => set("featured", e.target.checked)}
                      />
                      Feature this story
                    </label>
                    <p className="text-xs text-muted-foreground">
                      New articles start as drafts. Choose Published only after review, or Scheduled
                      with a future time. Changing a published article to Draft or Archived removes
                      it from the public news pages.
                    </p>
                    <div className="flex flex-wrap gap-3">
                      <button
                        type="submit"
                        className={`${button} bg-primary text-primary-foreground`}
                        disabled={save.isPending || resolve.isPending}
                      >
                        {save.isPending
                          ? "Saving…"
                          : draft.status === "published"
                            ? "Save & publish"
                            : draft.status === "scheduled"
                              ? "Save & schedule"
                              : "Save article"}
                      </button>
                      {!guide && selected?.kind !== "external" && (
                        <button
                          type="button"
                          className={button}
                          disabled={previewMutation.isPending}
                          onClick={() => previewMutation.mutate()}
                        >
                          {previewMutation.isPending ? "Preparing preview…" : "Preview article"}
                        </button>
                      )}
                    </div>
                  </form>
                )}
              </section>
            </div>
          )}
          {preview && tab === "stories" && (
            <section className="mt-8 overflow-hidden rounded-3xl border-2 border-primary bg-background">
              <div className="flex justify-end px-5 pt-4">
                <button className={button} onClick={() => setPreview(null)}>
                  Close preview
                </button>
              </div>
              <NewsArticleView article={preview} preview />
            </section>
          )}
        </>
      )}
    </div>
  );
}
