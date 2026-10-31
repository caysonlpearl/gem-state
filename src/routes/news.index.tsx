import { createFileRoute, notFound } from "@tanstack/react-router";
import { ArrowRight } from "@phosphor-icons/react";
import { brand } from "@/config/brand";
import { newsFilters, NEWS_TOPICS, type NewsFilters } from "@/lib/editorial-contract";
import { getNewsIndex } from "@/lib/editorial.functions";
import { NewsStoryCard } from "@/components/editorial/NewsArticle";
import { EditorialCta } from "@/components/editorial/EditorialCta";

export const Route = createFileRoute("/news/")({
  validateSearch: newsFilters,
  loaderDeps: ({ search }) => search,
  loader: async ({ deps }) => {
    const data = await getNewsIndex({ data: deps });
    if (deps.page > 1 && data.cards.length === 0) throw notFound();
    return data;
  },
  staleTime: 0,
  gcTime: 0,
  head: ({ match, loaderData }) => ({
    meta: [
      {
        title: `Bluebird Local — Idaho news, community & buying guides${loaderData && loaderData.page > 1 ? ` · Page ${loaderData.page}` : ""}`,
      },
      {
        name: "description",
        content:
          "Stay in the loop with Idaho community news, local businesses, homes, cars, jobs, and practical buying guides. Find your next local listing on Bluebird.",
      },
      { property: "og:title", content: "Bluebird Local — Life here. Finds nearby." },
      {
        property: "og:description",
        content: "Local stories and useful guides, connected to Idaho’s classifieds.",
      },
      { property: "og:type", content: "website" },
      { property: "og:image", content: `${brand.urls.siteUrl}/images/guides/guides-cover.jpg` },
      ...(match.search.topic || match.search.state
        ? [{ name: "robots", content: "noindex,follow" }]
        : []),
    ],
  }),
  component: NewsIndex,
});
function pageHref(search: NewsFilters, page: number) {
  const params = new URLSearchParams();
  if (search.topic) params.set("topic", search.topic);
  if (search.state) params.set("state", search.state);
  if (page > 1) params.set("page", String(page));
  return `/news${params.size ? `?${params}` : ""}`;
}
function NewsIndex() {
  const data = Route.useLoaderData();
  const search = Route.useSearch();
  const [lead, ...rest] = data.cards;
  const top = rest.slice(0, 3);
  const latest = rest.slice(3);
  const pages = Math.max(1, Math.ceil(data.total / data.pageSize));
  return (
    <div className="mx-auto max-w-[1240px] px-4 py-7 sm:px-7 sm:py-10">
      <header className="border-b border-border pb-6">
        <div className="flex flex-wrap items-end justify-between gap-5">
          <div>
            <a
              href="/news"
              className="text-[11px] font-bold uppercase tracking-[0.23em] text-primary/65"
            >
              Idaho’s local marketplace, in the loop
            </a>
            <h1 className="mt-2 text-[40px] font-bold leading-none tracking-tight sm:text-[60px]">
              Bluebird <span className="text-[#00a6d5]">Local.</span>
            </h1>
            <p className="mt-3 text-sm leading-relaxed text-muted-foreground sm:text-base">
              Life here. Finds nearby. Stories for the place we call home.
            </p>
          </div>
          <a
            href="/browse"
            className="inline-flex min-h-11 items-center gap-2 rounded-full bg-primary px-5 text-sm font-semibold text-primary-foreground"
          >
            Explore the classifieds
            <ArrowRight size={16} aria-hidden="true" />
          </a>
        </div>
        <form
          method="get"
          action="/news"
          className="mt-6 flex flex-wrap items-center gap-2.5"
          aria-label="Filter Bluebird Local"
        >
          <label className="sr-only" htmlFor="news-topic">
            Topic
          </label>
          <select
            id="news-topic"
            name="topic"
            defaultValue={search.topic || ""}
            key={`topic-${search.topic || "all"}`}
            className="h-11 min-w-0 rounded-full border border-input bg-card px-4 text-sm"
          >
            <option value="">All stories</option>
            {NEWS_TOPICS.map((t) => (
              <option key={t.slug} value={t.slug}>
                {t.label}
              </option>
            ))}
          </select>
          <label className="sr-only" htmlFor="news-state">
            Region
          </label>
          <select
            id="news-state"
            name="state"
            defaultValue={search.state || ""}
            key={`state-${search.state || "all"}`}
            className="h-11 rounded-full border border-input bg-card px-4 text-sm"
          >
            <option value="">Idaho & selected Utah</option>
            <option value="ID">Idaho</option>
            <option value="UT">Utah</option>
          </select>
          <button
            className="h-11 rounded-full border border-primary/25 bg-card px-5 text-sm font-semibold text-primary"
            type="submit"
          >
            Show stories
          </button>
          {(search.topic || search.state) && (
            <a
              href="/news"
              className="px-2 py-2 text-xs font-semibold text-muted-foreground underline"
            >
              Clear filters
            </a>
          )}
        </form>
      </header>
      <nav
        aria-label="Shop by category"
        className="my-5 flex flex-wrap gap-x-6 gap-y-3 text-[12px] font-semibold text-primary"
      >
        {[
          { href: "/idaho/cars-trucks", label: "Cars & trucks" },
          { href: "/idaho/homes", label: "Homes" },
          { href: "/idaho/jobs", label: "Jobs" },
          { href: "/idaho/services", label: "Local services" },
          { href: "/idaho/furniture", label: "Furniture" },
          { href: "/browse", label: "All classifieds" },
        ].map((item) => (
          <a
            key={item.href}
            href={item.href}
            className="inline-flex min-h-8 items-center gap-1 hover:underline"
          >
            {item.label}
            <ArrowRight size={12} />
          </a>
        ))}
      </nav>
      {lead ? (
        <>
          <NewsStoryCard article={lead} lead />
          {top.length > 0 && (
            <section aria-label="More top stories" className="mt-7 grid gap-7 sm:grid-cols-3">
              {top.map((article) => (
                <NewsStoryCard key={article.id} article={article} />
              ))}
            </section>
          )}
          <div className="my-9">
            <EditorialCta
              articleId="news-index"
              placement="news_top_stories"
              categorySlugs={[]}
              compact
            />
          </div>
          {latest.length > 0 && (
            <section className="mt-9" aria-labelledby="latest-stories">
              <div className="flex items-center justify-between gap-4 border-b-2 border-primary pb-3">
                <h2 id="latest-stories" className="text-xl font-bold tracking-tight">
                  Latest stories & useful reads
                </h2>
                <a href="/news?topic=guides" className="text-xs font-semibold text-primary">
                  All buying guides →
                </a>
              </div>
              {latest.map((article) => (
                <NewsStoryCard key={article.id} article={article} list />
              ))}
            </section>
          )}
        </>
      ) : (
        <section className="rounded-2xl border border-dashed border-border bg-card px-6 py-10">
          <h2 className="text-xl font-bold">More local stories are on the way.</h2>
          <p className="mt-2 text-sm text-muted-foreground">
            Try another topic or explore Bluebird’s buying and selling guides.
          </p>
          <a href="/guides" className="mt-4 inline-flex text-sm font-semibold text-primary">
            Read the guides →
          </a>
        </section>
      )}
      {pages > 1 && (
        <nav
          aria-label="News pagination"
          className="mt-7 flex flex-wrap items-center justify-center gap-4 text-sm"
        >
          {data.page > 1 && (
            <a
              className="rounded-full border border-border px-5 py-3"
              href={pageHref(search, data.page - 1)}
            >
              ← Previous
            </a>
          )}
          <span className="text-muted-foreground">
            Page {data.page} of {pages}
          </span>
          {data.page < pages && (
            <a
              className="rounded-full border border-border px-5 py-3"
              href={pageHref(search, data.page + 1)}
            >
              Next →
            </a>
          )}
        </nav>
      )}
      <div className="mt-10">
        <EditorialCta articleId="news-index" placement="news_footer" />
      </div>
      <p className="mt-5 text-xs leading-relaxed text-muted-foreground">
        Bluebird articles and guides are labeled alongside stories from our news sources.{" "}
        <a href="/news/about" className="font-semibold text-primary underline">
          How we select and publish stories
        </a>
      </p>
    </div>
  );
}
