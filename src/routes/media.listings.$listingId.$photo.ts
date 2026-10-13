import { createFileRoute } from "@tanstack/react-router";

import { ENDED_LISTING_RETENTION_DAYS } from "@/lib/classifieds.functions";

const MAX_PHOTOS = 20;

/**
 * A stable public address for a listing photo: /media/listings/{id}/{n}
 * (n counts from 0) redirects to a freshly signed storage URL. Listing pages
 * otherwise only have signed URLs that expire within the hour, which is too
 * short for search engines and link previews that fetch images later.
 * Photos are only served for listings that are publicly visible: live, or
 * sold/expired and still within their retention window.
 */
export const Route = createFileRoute("/media/listings/$listingId/$photo")({
  server: {
    handlers: {
      GET: async ({ params }) => {
        const notFound = () => new Response("Not found", { status: 404 });
        const index = Number(params.photo);
        if (!/^[0-9a-f-]{36}$/i.test(params.listingId)) return notFound();
        if (!Number.isInteger(index) || index < 0 || index >= MAX_PHOTOS) return notFound();

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { data: row, error } = await supabaseAdmin
          .from("asks")
          .select(
            "id, status, expires_at, updated_at, products!inner(status), listing_media(storage_path, position)",
          )
          .eq("id", params.listingId)
          .in("status", ["active", "expired", "matched", "cancelled"])
          .eq("is_demo", false)
          .not("approved_at", "is", null)
          .eq("products.status", "published")
          .maybeSingle();
        if (error) console.error("listing photo lookup failed", error.message);
        if (!row) return notFound();

        const record = row as unknown as {
          status: string;
          expires_at: string;
          updated_at: string;
          listing_media: { storage_path: string; position: number | null }[] | null;
        };
        const retentionMs = ENDED_LISTING_RETENTION_DAYS * 86_400_000;
        let endedAt: string | null = null;
        if (record.status === "matched") endedAt = record.updated_at;
        else if (record.status === "expired" || Date.parse(record.expires_at) <= Date.now())
          endedAt = record.expires_at;
        if (record.status === "cancelled") {
          // Only a listing its seller marked sold stays visible; a take-down doesn't.
          const { data: sold } = await supabaseAdmin
            .from("asks")
            .select("sold_at")
            .eq("id", params.listingId)
            .maybeSingle();
          if (!sold?.sold_at) return notFound();
          endedAt = sold.sold_at;
        }
        if (endedAt && Date.parse(endedAt) + retentionMs <= Date.now()) return notFound();

        const path = [...(record.listing_media ?? [])].sort(
          (a, b) => Number(a.position ?? 0) - Number(b.position ?? 0),
        )[index]?.storage_path;
        if (!path) return notFound();

        const { data: signed } = await supabaseAdmin.storage
          .from("listing-media")
          .createSignedUrl(path, 60 * 60);
        if (!signed?.signedUrl) return notFound();
        return new Response(null, {
          status: 302,
          headers: {
            Location: signed.signedUrl,
            // Well inside the signed URL's hour, so a cached redirect never
            // points at an expired link.
            "Cache-Control": "public, max-age=600",
          },
        });
      },
    },
  },
});
