import { createFileRoute } from "@tanstack/react-router";
import { shoppingDb } from "@/lib/shopping.server";
import { brand } from "@/config/brand";
async function handle(request: Request, token: string) {
  const headers = {
    "Cache-Control": "private, no-store",
    "Referrer-Policy": "no-referrer",
    "X-Robots-Tag": "noindex",
  };
  if (!/^[0-9a-f-]{36}$/i.test(token)) return new Response("Not found", { status: 404, headers });
  const db = await shoppingDb(),
    url = new URL(request.url),
    action = url.searchParams.get("action");
  if (action === "unsubscribe") {
    const account = await db
      .from("shopping_accounts")
      .select("user_id")
      .eq("unsubscribe_token", token)
      .maybeSingle();
    if (account.error) return new Response("Please retry", { status: 503, headers });
    if (!account.data) return new Response("This link is unavailable.", { status: 404, headers });
    if (request.method === "GET")
      return new Response(
        '<!doctype html><html lang="en"><meta name="viewport" content="width=device-width"><title>Shopping notifications</title><main style="max-width:32rem;margin:4rem auto;font:18px system-ui;padding:1rem"><h1>Turn off shopping updates?</h1><p>This stops personalized shopping emails and website notifications. Your account and transaction messages continue.</p><form method="post"><button style="padding:1rem">Turn off shopping updates</button></form></main></html>',
        { headers: { ...headers, "Content-Type": "text/html; charset=utf-8" } },
      );
    const result = await db.rpc("set_shopping_account", {
      member_id: account.data.user_id,
      accept_terms: false,
      alerts: false,
      policy: "2026-11-12",
    });
    if (result.error) return new Response("Please retry", { status: 503, headers });
    return new Response(
      "Shopping updates are off. You can turn them back on in your Bluebird account.",
      { headers },
    );
  }
  const delivery = await db
    .from("shopping_deliveries")
    .select("id,user_id,queue_ids")
    .eq("tracking_token", token)
    .maybeSingle();
  if (delivery.error || !delivery.data) return new Response("Not found", { status: 404, headers });
  if (action === "open") {
    await db
      .from("shopping_deliveries")
      .update({ opened_at: new Date().toISOString() })
      .eq("id", delivery.data.id)
      .is("opened_at", null);
    return new Response(
      new Uint8Array([
        71, 73, 70, 56, 57, 97, 1, 0, 1, 0, 128, 0, 0, 0, 0, 0, 255, 255, 255, 33, 249, 4, 1, 0, 0,
        0, 0, 44, 0, 0, 0, 0, 1, 0, 1, 0, 0, 2, 2, 68, 1, 0, 59,
      ]),
      { headers: { ...headers, "Content-Type": "image/gif" } },
    );
  }
  const item = url.searchParams.get("item");
  if (action !== "click" || !item || !delivery.data.queue_ids.includes(item))
    return new Response("Not found", { status: 404, headers });
  const row = await db
    .from("shopping_queue")
    .select("listing_id")
    .eq("id", item)
    .eq("user_id", delivery.data.user_id)
    .maybeSingle();
  if (row.error || !row.data) return new Response("Not found", { status: 404, headers });
  await db
    .from("shopping_deliveries")
    .update({ clicked_at: new Date().toISOString() })
    .eq("id", delivery.data.id)
    .is("clicked_at", null);
  // Attribution belongs to the email recipient, but is never a verified sale.
  if (
    (
      await db
        .from("shopping_privacy")
        .select("personalization")
        .eq("subject", `u:${delivery.data.user_id}`)
        .maybeSingle()
    ).data?.personalization &&
    !/bot|crawl|spider|preview|scanner/i.test(request.headers.get("user-agent") ?? "")
  )
    await db.from("shopping_events").upsert(
      {
        id: delivery.data.id,
        subject: `u:${delivery.data.user_id}`,
        user_id: delivery.data.user_id,
        session_id: delivery.data.id,
        kind: "notification_click",
        listing_id: row.data.listing_id,
        context: { source: "shopping_email" },
      },
      { onConflict: "id", ignoreDuplicates: true },
    );
  return new Response(null, {
    status: 302,
    headers: {
      ...headers,
      Location: `${brand.urls.siteUrl}/listings/${encodeURIComponent(row.data.listing_id)}`,
    },
  });
}
export const Route = createFileRoute("/api/shopping-link/$token")({
  server: {
    handlers: {
      GET: ({ request, params }) => handle(request, params.token),
      POST: ({ request, params }) => handle(request, params.token),
    },
  },
});
