import { createFileRoute } from "@tanstack/react-router";

import { brand } from "@/config/brand";
import { guides } from "@/content/guides";
import { idahoCities, idahoRegions } from "@/config/classifieds";
import { listingPath } from "@/lib/listing-url";
import {
  MAKE_PAGE_MIN_LISTINGS,
  MODEL_PAGE_MIN_LISTINGS,
  PLACE_PAGE_FRESH_DAYS,
  PLACE_PAGE_MIN_LISTINGS,
  canonicalMake,
  canonicalModel,
  categoryPagePath,
  placePath,
  vehiclePagePath,
} from "@/lib/place-pages";
import { regionOfListing } from "@/lib/market-stats";

const STATIC_PATHS: { path: string; changefreq: string; priority: string }[] = [
  { path: "/", changefreq: "daily", priority: "1.0" },
  { path: "/browse", changefreq: "daily", priority: "0.9" },
  { path: "/sell", changefreq: "monthly", priority: "0.6" },
  { path: "/safety", changefreq: "monthly", priority: "0.5" },
  { path: "/glossary", changefreq: "monthly", priority: "0.5" },
  { path: "/guides", changefreq: "weekly", priority: "0.6" },
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
  created_at: string;
  updated_at: string;
  products: { name: string; categories: { slug: string } | null } | null;
  classified_listing_details: ListingPlace | ListingPlace[] | null;
};

type ListingPlace = {
  city: string | null;
  region: string | null;
  state: string | null;
  vehicle_make: string | null;
  vehicle_model: string | null;
};

/**
 * Tallies live listings per landing page. A page only enters the sitemap
 * once it passes the same inventory gate the page itself checks (enough
 * listings, one of them recent); counts here use exact city matches, which
 * never exceed the page's own radius-based count, so a page listed here
 * always passes its gate.
 */
class PageTally {
  private pages = new Map<
    string,
    { count: number; minimum: number; newest: string; lastmod: string }
  >();

  add(path: string, createdAt: string, updatedAt: string, minimum = PLACE_PAGE_MIN_LISTINGS) {
    const current = this.pages.get(path);
    this.pages.set(path, {
      minimum,
      count: (current?.count ?? 0) + 1,
      newest: current && current.newest > createdAt ? current.newest : createdAt,
      lastmod: current && current.lastmod > updatedAt ? current.lastmod : updatedAt,
    });
  }

  passing() {
    const freshAfter = Date.now() - PLACE_PAGE_FRESH_DAYS * 86_400_000;
    return Array.from(this.pages.entries()).filter(
      ([, info]) => info.count >= info.minimum && Date.parse(info.newest) >= freshAfter,
    );
  }
}

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
            "id, seller_id, created_at, updated_at, products!inner(name, status, categories!inner(slug)), classified_listing_details!inner(listing_id, city, region, state, vehicle_make, vehicle_model)",
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

        const pages = new PageTally();
        const sellerLastmod = new Map<string, string>();
        for (const row of listings) {
          const details = Array.isArray(row.classified_listing_details)
            ? row.classified_listing_details[0]
            : row.classified_listing_details;
          const category = row.products?.categories?.slug;
          const city = idahoCities.find((name) => name === details?.city);
          // Same region the landing pages use: saved, else the city's.
          const region = details ? regionOfListing(details) : undefined;
          const add = (path: string, minimum?: number) =>
            pages.add(path, row.created_at, row.updated_at, minimum);
          if (category) add(categoryPagePath(category));
          if (city) add(placePath(city));
          if (city && category) add(placePath(city, category));
          if (region) add(placePath(region));
          if (region && category) add(placePath(region, category));
          const make = category === "cars-trucks" ? canonicalMake(details?.vehicle_make) : null;
          const model = make ? canonicalModel(make, details?.vehicle_model) : null;
          if (make) add(vehiclePagePath(make), MAKE_PAGE_MIN_LISTINGS);
          if (make && model) add(vehiclePagePath(make, model), MODEL_PAGE_MIN_LISTINGS);
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
