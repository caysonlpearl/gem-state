import { createFileRoute } from "@tanstack/react-router";
/* eslint-disable @typescript-eslint/no-explicit-any -- private queue-backed server database */
import { shoppingDb, shoppingExternalEligibility } from "@/lib/shopping.server";
import { shoppingAvailable } from "@/lib/shopping-worker.server";
import { safeMarketingImage } from "@/lib/shopping-marketing";

/** Stable email URL; never embed a one-day R2 signature in a marketing message.
 * Resolve only this delivery's public, still-eligible listing photo. No upload
 * bucket, arbitrary object path, or caller-supplied redirect is accepted. */
export async function shoppingEmailImage(db: any, token: string, item: string) {
  const headers = {
    "Cache-Control": "private, no-store",
    "Referrer-Policy": "no-referrer",
    "X-Robots-Tag": "noindex",
  };
  if (![token, item].every((value) => /^[0-9a-f-]{36}$/i.test(value)))
    return new Response("Not found", { status: 404, headers });
  const delivery = await db
    .from("shopping_deliveries")
    .select("user_id,queue_ids")
    .eq("tracking_token", token)
    .maybeSingle();
  if (delivery.error) return new Response("Please retry", { status: 503, headers });
  if (!delivery.data?.queue_ids.includes(item))
    return new Response("Not found", { status: 404, headers });
  const queued = await db
    .from("shopping_queue")
    .select("listing_id")
    .eq("id", item)
    .eq("user_id", delivery.data.user_id)
    .maybeSingle();
  if (queued.error) return new Response("Please retry", { status: 503, headers });
  if (!queued.data) return new Response("Not found", { status: 404, headers });
  const inventory = await db
    .from("shopping_inventory")
    .select("listing_id,card,valid_until")
    .eq("listing_id", queued.data.listing_id)
    .maybeSingle();
  if (inventory.error) return new Response("Please retry", { status: 503, headers });
  if (!(await shoppingAvailable(db, inventory.data)))
    return new Response("Not found", { status: 404, headers });
  const allowed = await shoppingExternalEligibility(db, [queued.data.listing_id]);
  const image = safeMarketingImage(inventory.data.card?.imageUrl);
  if (!image || !allowed.has(queued.data.listing_id))
    return new Response("Not found", { status: 404, headers });
  return new Response(null, { status: 302, headers: { ...headers, Location: image } });
}
export const Route = createFileRoute("/api/shopping-email-image/$token/$item")({
  server: {
    handlers: {
      GET: async ({ params }) => shoppingEmailImage(await shoppingDb(), params.token, params.item),
    },
  },
});
