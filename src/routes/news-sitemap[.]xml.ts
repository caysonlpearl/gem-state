import { createFileRoute } from "@tanstack/react-router";
import { brand } from "@/config/brand";
import { newsSitemapArticles } from "@/lib/editorial.functions";

const escape = (value: string) =>
  value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
export const Route = createFileRoute("/news-sitemap.xml")({
  server: {
    handlers: {
      GET: async () => {
        try {
          const articles = (await newsSitemapArticles())
            .filter(
              (article) =>
                article.topic !== "guides" &&
                Date.now() - Date.parse(article.publishedAt) <= 2 * 86_400_000,
            )
            .slice(0, 1000);
          const entries = articles.map(
            (article) =>
              `<url><loc>${escape(`${brand.urls.siteUrl}/news/${article.slug}`)}</loc><news:news><news:publication><news:name>Bluebird Local</news:name><news:language>en</news:language></news:publication><news:publication_date>${escape(article.publishedAt)}</news:publication_date><news:title>${escape(article.title)}</news:title></news:news></url>`,
          );
          return new Response(
            `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:news="http://www.google.com/schemas/sitemap-news/0.9">${entries.join("\n")}</urlset>`,
            {
              headers: {
                "Content-Type": "application/xml; charset=utf-8",
                "Cache-Control": "no-store",
              },
            },
          );
        } catch {
          return new Response("News sitemap temporarily unavailable", {
            status: 503,
            headers: { "Retry-After": "300" },
          });
        }
      },
    },
  },
});
