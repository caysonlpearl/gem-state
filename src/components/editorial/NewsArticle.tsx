import { useEffect, useRef, useState } from "react";
import { Newspaper, ArrowRight, ArrowSquareOut } from "@phosphor-icons/react";
import {
  NEWS_TOPICS,
  articleHref,
  type EditorialArticle,
  type NewsCard,
} from "@/lib/editorial-contract";
import { trackEvent } from "@/lib/analytics";
import { EditorialCta, EditorialRelatedListings } from "./EditorialCta";

function editorialDate(value: string) {
  return new Date(value).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "America/Boise",
  });
}
export function NewsArtwork({
  article,
  eager = false,
}: {
  article: Pick<NewsCard, "imageUrl" | "title" | "topic" | "state">;
  eager?: boolean;
}) {
  const [failedImage, setFailedImage] = useState<string | null>(null);
  return article.imageUrl && article.imageUrl !== failedImage ? (
    <img
      src={article.imageUrl}
      onError={() => setFailedImage(article.imageUrl)}
      alt={article.title}
      loading={eager ? "eager" : "lazy"}
      fetchPriority={eager ? "high" : "auto"}
      decoding="async"
      width={1200}
      height={675}
      className="h-full w-full object-cover"
    />
  ) : (
    <div
      className="relative flex h-full min-h-44 w-full items-center justify-center overflow-hidden bg-[#e7eff0]"
      aria-hidden="true"
    >
      <div className="absolute -right-12 -top-20 h-64 w-64 rounded-full bg-[#f8dc5f]/65" />
      <div className="absolute -bottom-28 -left-5 h-64 w-64 rounded-full bg-[#00a6d5]/15" />
      <div className="relative flex flex-col items-center gap-3 px-5 text-center text-primary">
        <Newspaper size={58} weight="duotone" />
        <span className="text-[11px] font-bold uppercase tracking-[0.25em]">Bluebird Local</span>
        <span className="text-[12px] text-primary/70">
          {article.state === "UT" ? "Around Utah" : "Around Idaho"}
        </span>
      </div>
    </div>
  );
}
export function NewsStoryCard({
  article,
  lead = false,
  list = false,
}: {
  article: NewsCard;
  lead?: boolean;
  list?: boolean;
}) {
  const topic = NEWS_TOPICS.find((t) => t.slug === article.topic)?.label;
  const external = article.kind === "external";
  return (
    <article
      className={
        lead
          ? "overflow-hidden rounded-3xl bg-primary text-primary-foreground"
          : list
            ? "border-b border-border py-6"
            : "min-w-0"
      }
    >
      <a
        href={articleHref(article)}
        {...(external ? { target: "_blank", rel: "noopener noreferrer" } : {})}
        className={`group ${lead ? "grid lg:grid-cols-[1.4fr_1fr]" : list ? "grid grid-cols-[110px_minmax(0,1fr)] gap-4 sm:grid-cols-[220px_minmax(0,1fr)] sm:gap-6" : "block"}`}
      >
        <div
          className={`overflow-hidden ${lead ? "aspect-[16/10] lg:aspect-auto lg:min-h-[370px]" : list ? "aspect-[4/3] rounded-xl sm:aspect-[16/10]" : "aspect-[16/10] rounded-2xl"}`}
        >
          <NewsArtwork article={article} eager={lead} />
        </div>
        <div
          className={
            lead ? "flex flex-col justify-center p-6 sm:p-9" : list ? "min-w-0 py-0.5" : "pt-4"
          }
        >
          <p
            className={`text-[10px] font-bold uppercase tracking-[0.14em] ${lead ? "text-accent" : "text-primary/70"}`}
          >
            {topic} · {article.state === "UT" ? "Utah" : "Idaho"}
          </p>
          <h2
            className={`mt-2 font-bold tracking-tight group-hover:underline ${lead ? "text-[27px] leading-[1.15] sm:text-[34px]" : "text-[19px] leading-snug"}`}
          >
            {article.title}
          </h2>
          {(lead || list) && (
            <p
              className={`mt-3 text-sm leading-relaxed ${lead ? "text-primary-foreground/80" : "hidden text-muted-foreground sm:block"}`}
            >
              {article.excerpt}
            </p>
          )}
          <p
            className={`mt-3 text-[11px] leading-relaxed ${lead ? "text-primary-foreground/70" : "text-muted-foreground"}`}
          >
            {article.guidePath ? "Bluebird guide" : article.sourceName || article.authorName} ·{" "}
            <time dateTime={article.publishedAt}>{editorialDate(article.publishedAt)}</time>
          </p>
          {external ? (
            <span
              className={`mt-2 inline-flex items-center gap-1 text-[11px] font-semibold ${lead ? "text-accent" : "text-primary"}`}
            >
              Read at {article.sourceName}
              <ArrowSquareOut size={12} />
            </span>
          ) : lead ? (
            <span className="mt-5 inline-flex items-center gap-2 text-sm font-semibold text-accent">
              Read the story
              <ArrowRight size={16} />
            </span>
          ) : null}
        </div>
      </a>
    </article>
  );
}
export function NewsArticleView({
  article,
  preview = false,
}: {
  article: EditorialArticle;
  preview?: boolean;
}) {
  const viewed = useRef("");
  useEffect(() => {
    if (!preview && viewed.current !== article.id) {
      viewed.current = article.id;
      void trackEvent("media_article_viewed", {
        article: article.id,
        topic: article.topic,
        kind: article.kind,
      });
    }
  }, [article, preview]);
  const scope = {
    articleId: preview ? "preview" : article.id,
    categorySlugs: article.categorySlugs,
    city: article.city,
    state: article.state,
  };
  const sections = article.bodySections?.length ? article.bodySections : [article.bodyHtml];
  return (
    <div className="mx-auto max-w-[1160px] px-4 py-7 sm:px-6 sm:py-12">
      {preview && (
        <p className="mb-6 rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm font-semibold text-amber-900">
          Private preview · This does not publish your article.
        </p>
      )}
      <nav
        aria-label="Breadcrumb"
        className="mb-6 flex flex-wrap items-center gap-2 text-xs text-muted-foreground"
      >
        <a href="/news" className="hover:text-primary">
          Bluebird Local
        </a>
        <span aria-hidden="true">/</span>
        <span>{NEWS_TOPICS.find((t) => t.slug === article.topic)?.label}</span>
      </nav>
      <article className="mx-auto max-w-[820px]">
        <header>
          <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-primary/70">
            {article.city || (article.state === "UT" ? "Utah" : "Idaho")} ·{" "}
            {article.kind === "licensed" ? "From our news sources" : "Bluebird Local"}
          </p>
          <h1 className="mt-3 text-[32px] font-bold leading-[1.12] tracking-tight sm:text-[48px]">
            {article.title}
          </h1>
          <p className="mt-5 text-sm text-muted-foreground">
            By{" "}
            {article.authorUrl ? (
              <a href={article.authorUrl} className="font-semibold text-primary">
                {article.authorName}
              </a>
            ) : (
              <span className="font-semibold text-primary">{article.authorName}</span>
            )}
            {article.sourceName ? ` · ${article.sourceName}` : ""}
            <br />
            <time dateTime={article.publishedAt}>{editorialDate(article.publishedAt)}</time>
            {Date.parse(article.modifiedAt) - Date.parse(article.publishedAt) > 60_000 ? (
              <>
                {" "}
                · Updated{" "}
                <time dateTime={article.modifiedAt}>{editorialDate(article.modifiedAt)}</time>
              </>
            ) : null}
          </p>
        </header>
        {article.imageUrl && article.kind === "original" && (
          <figure className="mt-7">
            <div className="aspect-[16/9] overflow-hidden rounded-2xl">
              <NewsArtwork article={article} eager />
            </div>
            <figcaption className="mt-2 text-xs text-muted-foreground">
              {article.imageCredit}
            </figcaption>
          </figure>
        )}
        {article.kind === "original" && (
          <p className="mt-7 text-lg leading-relaxed text-foreground/80">{article.excerpt}</p>
        )}
        <div className="my-7">
          <EditorialCta {...scope} placement="article_intro" compact />
        </div>
        {sections.map((section, index) => (
          <div key={index}>
            <div className="news-prose" dangerouslySetInnerHTML={{ __html: section }} />
            {index < sections.length - 1 && (
              <div className="my-8">
                <EditorialCta {...scope} placement="article_middle" compact />
              </div>
            )}
          </div>
        ))}
        {article.sourceUrl && (
          <p className="mt-7 border-t border-border pt-4 text-sm text-muted-foreground">
            Originally published by{" "}
            <a
              href={article.sourceUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="font-semibold text-primary underline"
            >
              {article.sourceName || article.authorName}
            </a>
            . Original author, links, and photograph credits are retained.
          </p>
        )}
        <div className="mt-9">
          <EditorialCta {...scope} placement="article_end" />
        </div>
        <nav
          aria-label="More from Bluebird"
          className="mt-6 flex flex-wrap gap-5 text-sm font-semibold text-primary"
        >
          <a href="/news">More from Bluebird Local →</a>
          <a href="/guides">Buying & selling guides →</a>
          <a href="/news/about">About our content →</a>
        </nav>
      </article>
      {!preview && <EditorialRelatedListings {...scope} />}
    </div>
  );
}
