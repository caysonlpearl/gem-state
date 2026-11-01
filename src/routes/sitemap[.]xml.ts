import { createFileRoute } from "@tanstack/react-router";

import { brand } from "@/config/brand";
import { isSitemapAllowedPath } from "@/lib/seo-policy";
import { guides } from "@/content/guides";
import { dealerSitemapEntries } from "@/lib/dealer-sitemap.server";
import { listingPath } from "@/lib/listing-url";
import { fetchLiveListings, tallyLandingPages, landingPathsFor } from "@/lib/landing-pages.server";
import { vehicleLandingReferences } from "@/lib/vehicle-sitemap";
import { reportMonthOf } from "@/lib/market-stats";
import { MARKET_REPORT_MIN_LISTINGS } from "@/lib/market-report.functions";
import { newsSitemapArticles } from "@/lib/editorial.functions";

const STATIC_PATHS: { path: string; changefreq: string; priority: string }[] = [
  { path: "/", changefreq: "daily", priority: "1.0" },
  { path: "/browse", changefreq: "daily", priority: "0.9" },
  { path: "/sell", changefreq: "monthly", priority: "0.6" },
  { path: "/safety", changefreq: "monthly", priority: "0.5" },
  { path: "/firearms-safety", changefreq: "monthly", priority: "0.5" },
  { path: "/glossary", changefreq: "monthly", priority: "0.5" },
  { path: "/guides", changefreq: "weekly", priority: "0.6" },
  { path: "/news", changefreq: "daily", priority: "0.7" },
  { path: "/news/about", changefreq: "monthly", priority: "0.4" },
  { path: "/policies", changefreq: "monthly", priority: "0.3" },
  { path: "/contact", changefreq: "yearly", priority: "0.3" },
];

function xmlEscape(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function urlEntry(
  path: string,
  extra: { lastmod?: string; changefreq?: string; priority?: string },
) {
  const parts = [`<loc>${xmlEscape(`${brand.urls.siteUrl}${path}`)}</loc>`];
  if (extra.lastmod) parts.push(`<lastmod>${extra.lastmod.slice(0, 10)}</lastmod>`);
  if (extra.changefreq) parts.push(`<changefreq>${extra.changefreq}</changefreq>`);
  if (extra.priority) parts.push(`<priority>${extra.priority}</priority>`);
  return `  <url>${parts.join("")}</url>`;
}

/** Generated from live inventory on every request (cached for an hour). */
export const Route = createFileRoute("/sitemap.xml")({
  server: {
    handlers: {
      GET: async () => {
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

        const live = await fetchLiveListings(supabaseAdmin);
        if (!live) return new Response("Sitemap unavailable", { status: 503 });
        const listings = live;
        const dealers = await dealerSitemapEntries(supabaseAdmin, listings);
        if (!dealers) return new Response("Sitemap unavailable", { status: 503 });

        const pages = tallyLandingPages(listings);
        // Public browse includes cached dealer/private vehicles that are not asks.
        // Reuse that cache without provider requests or writes. Failure is not an empty catalog.
        const { marketCheckCards } = await import("@/lib/marketcheck.server");
        let cachedVehicles;
        try {
          cachedVehicles = await marketCheckCards(
            { category: "cars-trucks", state: "ID" },
            { cacheOnly: true },
          );
        } catch {
          return new Response("Sitemap unavailable", { status: 503 });
        }
        for (const reference of vehicleLandingReferences(cachedVehicles)) {
          for (const { path, minimum } of landingPathsFor("cars-trucks", reference.details)) {
            // Seen dates qualify freshness but are not content-modification timestamps.
            pages.add(path, reference.createdAt, "", minimum);
          }
        }
        const sellerLastmod = new Map<string, string>();
        for (const row of listings) {
          if (!sellerLastmod.has(row.seller_id)) sellerLastmod.set(row.seller_id, row.updated_at);
        }

        const sellerIds = Array.from(sellerLastmod.keys());
        const sellerSlugs = new Map<string, string>();
        for (let i = 0; i < sellerIds.length; i += 500) {
          const { data: sellers, error } = await supabaseAdmin
            .from("seller_profiles")
            .select("user_id, slug")
            .in("user_id", sellerIds.slice(i, i + 500))
            .eq("status", "active");
          if (error) return new Response("Sitemap unavailable", { status: 503 });
          for (const seller of sellers ?? []) sellerSlugs.set(seller.user_id, seller.slug);
        }

        // Monthly market reports: this month's once enough listings are live,
        // and past months whose saved report passed the same bar.
        const reportMonths: { month: string; lastmod?: string }[] = [];
        const currentMonth = reportMonthOf(new Date());
        if (listings.length >= MARKET_REPORT_MIN_LISTINGS)
          reportMonths.push({ month: currentMonth });
        // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Report snapshots are not in the generated Supabase types.
        const { data: savedReports, error: reportsError } = await (supabaseAdmin as any)
          .from("market_report_snapshots")
          .select("month, updated_at, report->totals->live")
          .neq("month", currentMonth)
          .limit(120);
        if (reportsError) return new Response("Sitemap unavailable", { status: 503 });
        for (const saved of (savedReports ?? []) as {
          month: string;
          updated_at: string;
          live: number;
        }[]) {
          if (Number(saved.live) >= MARKET_REPORT_MIN_LISTINGS)
            reportMonths.push({ month: saved.month, lastmod: saved.updated_at });
        }

        let articles;
        try {
          articles = await newsSitemapArticles();
        } catch {
          return new Response("Sitemap unavailable", { status: 503 });
        }
        const entries = [
          ...articles.map((article) =>
            urlEntry(`/news/${article.slug}`, {
              lastmod: article.modifiedAt,
              changefreq: "weekly",
              priority: "0.7",
            }),
          ),
          ...STATIC_PATHS.filter(({ path }) => isSitemapAllowedPath(path)).map(
            ({ path, changefreq, priority }) => urlEntry(path, { changefreq, priority }),
          ),
          ...reportMonths.map(({ month, lastmod }) =>
            urlEntry(`/idaho/market-report/${month}`, {
              lastmod,
              changefreq: "weekly",
              priority: "0.7",
            }),
          ),
          ...guides.map((guide) =>
            urlEntry(`/guides/${guide.slug}`, { lastmod: guide.reviewed, priority: "0.7" }),
          ),
          ...pages
            .passing()
            .map(([path, info]) =>
              urlEntry(path, { lastmod: info.lastmod, changefreq: "daily", priority: "0.8" }),
            ),
          ...listings.map((row) => {
            const details = Array.isArray(row.classified_listing_details)
              ? row.classified_listing_details[0]
              : row.classified_listing_details;
            return urlEntry(
              listingPath({ id: row.id, title: row.products?.name ?? "", city: details?.city }),
              { lastmod: row.updated_at, priority: "0.7" },
            );
          }),
          ...dealers.map(({ path, lastmod }) =>
            urlEntry(path, { lastmod, changefreq: "daily", priority: "0.5" }),
          ),
          ...Array.from(sellerLastmod.entries())
            .filter(([sellerId]) => sellerSlugs.has(sellerId))
            .map(([sellerId, lastmod]) =>
              urlEntry(`/sellers/${encodeURIComponent(sellerSlugs.get(sellerId) ?? "")}`, {
                lastmod,
                priority: "0.5",
              }),
            ),
        ];

        const body = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${entries.join("\n")}\n</urlset>\n`;
        return new Response(body, {
          headers: {
            "Content-Type": "application/xml; charset=utf-8",
            "Cache-Control": "public, max-age=3600",
          },
        });
      },
    },
  },
});
