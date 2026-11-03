import { getPhotoStorageModule } from "@/lib/photo-storage-access";
import { createFileRoute } from "@tanstack/react-router";

import { ENDED_LISTING_RETENTION_DAYS } from "@/lib/classifieds.functions";
import { withCatalogReadDeadline } from "@/lib/catalog-read-deadline";
import { OPENWEBNINJA_ID } from "@/lib/openwebninja-contract";
import { MARKETCHECK_ID } from "@/lib/marketcheck-contract";
import { listingPhotoUrl } from "@/lib/listing-photo-url";

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
        const notFound = () =>
          new Response("Not found", {
            status: 404,
            headers: { "Cache-Control": "no-store" },
          });
        const index = Number(params.photo);
        if (!Number.isInteger(index) || index < 0 || index >= MAX_PHOTOS) return notFound();
        // Older crawlers already hold these URLs. Resolve only known public
        // partner IDs from saved inventory, without spending provider calls or
        // loosening the native listing visibility/retention checks below.
        const partner = OPENWEBNINJA_ID.test(params.listingId)
          ? "home"
          : MARKETCHECK_ID.test(params.listingId) && params.listingId.length <= 64
            ? "vehicle"
            : null;
        if (
          !partner &&
          !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(params.listingId)
        )
          return notFound();

        try {
          if (partner) {
            const listing =
              partner === "home"
                ? await (
                    await import("@/lib/openwebninja-listings.server")
                  ).openWebNinjaDetail(params.listingId)
                : await (
                    await import("@/lib/marketcheck.server")
                  ).marketCheckDetail(params.listingId, { cacheOnly: true });
            const url = listing && listingPhotoUrl(listing, index);
            if (!url || url.startsWith("/")) return notFound();
            return new Response(null, {
              status: 302,
              headers: { Location: url, "Cache-Control": "public, max-age=600" },
            });
          }
          const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
          const { data: row, error } = await withCatalogReadDeadline((signal) =>
            supabaseAdmin
              .from("asks")
              .select(
                "id, status, expires_at, sold_at, products!inner(status), listing_media(storage_path, position)",
              )
              .eq("id", params.listingId)
              .in("status", ["active", "expired", "cancelled"])
              .eq("is_demo", false)
              .not("approved_at", "is", null)
              .eq("products.status", "published")
              .abortSignal(signal)
              .retry(false)
              .maybeSingle(),
          );
          if (error) throw new Error("Listing photo source is unavailable.");
          if (!row) return notFound();

          const record = row as unknown as {
            status: string;
            expires_at: string;
            sold_at: string | null;
            listing_media: { storage_path: string; position: number | null }[] | null;
          };
          const retentionMs = ENDED_LISTING_RETENTION_DAYS * 86_400_000;
          let endedAt: string | null = null;
          if (record.status === "expired" || Date.parse(record.expires_at) <= Date.now())
            endedAt = record.expires_at;
          if (record.status === "cancelled") {
            // Only a listing its seller marked sold stays visible; a take-down doesn't.
            if (!record.sold_at) return notFound();
            endedAt = record.sold_at;
          }
          if (endedAt && Date.parse(endedAt) + retentionMs <= Date.now()) return notFound();

          const path = [...(record.listing_media ?? [])].sort(
            (a, b) => Number(a.position ?? 0) - Number(b.position ?? 0),
          )[index]?.storage_path;
          if (!path) return notFound();

          const { signPrivatePhotoUrls } = await getPhotoStorageModule();
          const signed = (await signPrivatePhotoUrls("listing-media", [path])).get(path);
          if (!signed) throw new Error("Listing photo signing is unavailable.");
          return new Response(null, {
            status: 302,
            headers: {
              Location: signed,
              // Well inside the signed URL's hour, so a cached redirect never
              // points at an expired link.
              "Cache-Control": "public, max-age=600",
            },
          });
        } catch {
          // A temporary backend failure is not evidence that an indexed photo
          // was removed. Do not cache a false 404 or expose signing details.
          console.error("Listing photo is temporarily unavailable.");
          return new Response("Photo temporarily unavailable. Please try again.", {
            status: 503,
            headers: { "Cache-Control": "no-store", "Retry-After": "60" },
          });
        }
      },
    },
  },
});
