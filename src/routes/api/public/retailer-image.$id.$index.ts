import { createFileRoute } from "@tanstack/react-router";
import { normalizeMerchandise } from "@/lib/avantlink-contract";

/**
 * Public photo delivery for active Guns.com retailer items. Only images
 * recorded on an active cached product are fetched, and only from the
 * Guns.com image host, so this is not an open proxy.
 */
export const Route = createFileRoute("/api/public/retailer-image/$id/$index")({
  server: {
    handlers: {
      GET: async ({ params }) => {
        const notFound = () => new Response("Not found", { status: 404 });
        if (!/^\d{1,20}$/.test(params.id) || !/^\d{1,2}$/.test(params.index)) return notFound();
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { data: row } = await (supabaseAdmin as any)
          .from("avantlink_merchandise")
          .select("payload")
          .eq("id", params.id)
          .eq("active", true)
          .maybeSingle();
        const product = row ? normalizeMerchandise(row.payload?.raw) : null;
        const source = product?.images[Number(params.index)];
        if (!source) return notFound();
        const url = new URL(source);
        if (url.protocol !== "https:" || url.hostname !== "images.guns.com") return notFound();
        try {
          const upstream = await fetch(url, {
            headers: {
              "user-agent": "Mozilla/5.0 (compatible; BluebirdMarketplace/1.0; +https://onbluebird.com)",
              accept: "image/avif,image/webp,image/png,image/jpeg,image/*",
              referer: "https://onbluebird.com/",
            },
            signal: AbortSignal.timeout(8000),
          });
          const type = upstream.headers.get("content-type") ?? "";
          if (!upstream.ok || !/^image\/(jpeg|png|webp|gif|avif)$/.test(type)) return notFound();
          return new Response(upstream.body, {
            headers: {
              "content-type": type,
              "cache-control": "public, max-age=86400, stale-while-revalidate=604800",
              "x-content-type-options": "nosniff",
            },
          });
        } catch {
          return new Response("Unavailable", { status: 502 });
        }
      },
    },
  },
});
