import { createFileRoute, notFound } from "@tanstack/react-router";
import { brand } from "@/config/brand";
import { getNewsArticle } from "@/lib/editorial.functions";
import { NewsArticleView } from "@/components/editorial/NewsArticle";
import { articleIsIndexable } from "@/lib/editorial-contract";
import { jsonLdScript } from "@/lib/structured-data";

export const Route = createFileRoute("/news/$slug")({
  loader: async ({ params }) => {
    const article = await getNewsArticle({ data: { slug: params.slug } });
    if (!article) throw notFound();
    return article;
  },
  staleTime: 0,
  gcTime: 0,
  head: ({ loaderData: article }) =>
    article
      ? {
          meta: [
            { title: `${article.title} — Bluebird Local` },
            { name: "description", content: article.excerpt },
            { name: "author", content: article.authorName },
            { property: "og:title", content: article.title },
            { property: "og:description", content: article.excerpt },
            { property: "og:type", content: "article" },
            { property: "article:published_time", content: article.publishedAt },
            { property: "article:modified_time", content: article.modifiedAt },
            {
              name: "robots",
              content: articleIsIndexable(article)
                ? "index,follow,max-image-preview:large"
                : "noindex,follow",
            },
            { name: "twitter:card", content: "summary_large_image" },
            ...(article.imageUrl
              ? [
                  {
                    property: "og:image",
                    content: new URL(article.imageUrl, brand.urls.siteUrl).href,
                  },
                ]
              : []),
          ],
          scripts: [
            jsonLdScript({
              "@context": "https://schema.org",
              "@type": article.topic === "guides" ? "Article" : "NewsArticle",
              headline: article.title,
              description: article.excerpt,
              datePublished: article.publishedAt,
              dateModified: article.modifiedAt,
              mainEntityOfPage: `${brand.urls.siteUrl}/news/${article.slug}`,
              ...(article.imageUrl
                ? { image: [new URL(article.imageUrl, brand.urls.siteUrl).href] }
                : {}),
              author: {
                "@type":
                  article.authorName === "Bluebird Marketplace editorial team"
                    ? "Organization"
                    : "Person",
                name: article.authorName,
                url: article.authorUrl || `${brand.urls.siteUrl}/news/about`,
              },
              publisher: {
                "@type": "Organization",
                name: brand.name,
                url: brand.urls.siteUrl,
                logo: {
                  "@type": "ImageObject",
                  url: `${brand.urls.siteUrl}/images/brand/bluebird-marketplace-logo.png`,
                },
              },
              inLanguage: "en-US",
              ...(article.sourceUrl ? { isBasedOn: article.sourceUrl } : {}),
            }),
          ],
        }
      : { meta: [{ name: "robots", content: "noindex" }] },
  component: NewsArticlePage,
});

function NewsArticlePage() {
  return <NewsArticleView article={Route.useLoaderData()} />;
}
