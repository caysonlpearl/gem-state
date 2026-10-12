import { createFileRoute } from "@tanstack/react-router";

import { brand } from "@/config/brand";

// A category page only goes into the sitemap once it has enough live
// listings to be worth landing on; near-empty template pages hurt the whole
// site under Google's scaled-content rules. Same threshold as the SEO plan.
const CATEGORY_MIN_LISTINGS = 5;

const STATIC_PATHS: { path: string; changefreq: string; priority: string }[] = [
  { path: "/", changefreq: "daily", priority: "1.0" },
  { path: "/browse", changefreq: "daily", priority: "0.9" },
  { path: "/sell", changefreq: "monthly", priority: "0.6" },
  { path: "/safety", changefreq: "monthly", priority: "0.5" },
  { path: "/glossary", changefreq: "monthly", priority: "0.5" },
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

type LiveListingRow = {
  id: string;
  seller_id: string;
  updated_at: string;
  products: { categories: { slug: string } | null } | null;
};

/** Generated from live inventory on every request (cached for an hour). */
export const Route = createFileRoute("/sitemap.xml")({
  server: {
    handlers: {
      GET: async () => {
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const nowIso = new Date().toISOString();

        // Same visibility rules as the public browse pages.
        const { data: listingRows, error } = await supabaseAdmin
          .from("asks")
          .select(
            "id, seller_id, updated_at, products!inner(status, categories!inner(slug)), classified_listing_details!inner(listing_id)",
          )
          .eq("status", "active")
          .eq("is_demo", false)
          .not("approved_at", "is", null)
          .gt("expires_at", nowIso)
          .eq("products.status", "published")
          .order("updated_at", { ascending: false })
          .limit(45_000);
        if (error) return new Response("Sitemap unavailable", { status: 503 });
        const listings = (listingRows ?? []) as unknown as LiveListingRow[];

        const categoryCounts = new Map<string, { count: number; lastmod: string }>();
        const sellerLastmod = new Map<string, string>();
        for (const row of listings) {
          const slug = row.products?.categories?.slug;
          if (slug) {
            const current = categoryCounts.get(slug);
            categoryCounts.set(slug, {
              count: (current?.count ?? 0) + 1,
              lastmod: current?.lastmod ?? row.updated_at,
            });
          }
          if (!sellerLastmod.has(row.seller_id)) sellerLastmod.set(row.seller_id, row.updated_at);
        }

        const sellerIds = Array.from(sellerLastmod.keys());
        const sellerSlugs = new Map<string, string>();
        for (let i = 0; i < sellerIds.length; i += 500) {
          const { data: sellers } = await supabaseAdmin
            .from("seller_profiles")
            .select("user_id, slug")
            .in("user_id", sellerIds.slice(i, i + 500))
            .eq("status", "active");
          for (const seller of sellers ?? []) sellerSlugs.set(seller.user_id, seller.slug);
        }

        const entries = [
          ...STATIC_PATHS.map(({ path, changefreq, priority }) =>
            urlEntry(path, { changefreq, priority }),
          ),
          ...Array.from(categoryCounts.entries())
            .filter(([, info]) => info.count >= CATEGORY_MIN_LISTINGS)
            .map(([slug, info]) =>
              urlEntry(`/browse?category=${encodeURIComponent(slug)}`, {
                lastmod: info.lastmod,
                changefreq: "daily",
                priority: "0.8",
              }),
            ),
          ...listings.map((row) =>
            urlEntry(`/listings/${row.id}`, { lastmod: row.updated_at, priority: "0.7" }),
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
