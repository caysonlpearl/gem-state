import { createFileRoute } from "@tanstack/react-router";

/**
 * Public read-only delivery for approved canonical catalog photography.
 *
 * Uploads live in the private `catalog-media` bucket so that only
 * administrators can write them. Catalog product pages are public, so this
 * route streams the stored object with long-lived cache headers. No user data,
 * evidence media, or private listing media is reachable here: the bucket is
 * fixed and the path is sanitised.
 */
export const Route = createFileRoute("/api/public/catalog-media/$")({
  server: {
    handlers: {
      GET: async ({ params }) => {
        const raw = (params as { _splat?: string })._splat ?? "";
        const objectPath = raw.replace(/^\/+/, "");
        if (!objectPath || objectPath.includes("..")) {
          return new Response("Not found", { status: 404 });
        }

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const publicPath = `/api/public/catalog-media/${objectPath}`;
        const approved = await supabaseAdmin
          .from("product_images")
          .select("id,products!inner(status)")
          .in("storage_path", [
            objectPath,
            publicPath,
            `https://getparkvault.com${publicPath}`,
            `https://www.getparkvault.com${publicPath}`,
          ])
          .eq("kind", "canonical")
          .not("approved_at", "is", null)
          .eq("products.status", "published")
          .limit(1);
        if (approved.error || !approved.data?.length) {
          return new Response("Not found", { status: 404 });
        }
        const { data, error } = await supabaseAdmin.storage
          .from("catalog-media")
          .download(objectPath);
        if (
          error ||
          !data ||
          !["image/jpeg", "image/png", "image/webp", "image/gif", "image/avif"].includes(data.type)
        ) {
          return new Response("Not found", { status: 404 });
        }

        return new Response(await data.arrayBuffer(), {
          headers: {
            "content-type": data.type || "application/octet-stream",
            "cache-control": "public, max-age=3600",
            "x-content-type-options": "nosniff",
          },
        });
      },
    },
  },
});
