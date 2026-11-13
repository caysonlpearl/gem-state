/* eslint-disable @typescript-eslint/no-explicit-any -- private, allowlisted provider outbox */
import { serverEnv } from "./runtime-env.server";
import { contentHash, shoppingControls, shoppingPermission } from "./shopping.server";
import { shoppingEvent } from "./shopping-contract";
const names: Record<string, { meta: string; google: string }> = {
  view: { meta: "ViewContent", google: "view_item" },
  save: { meta: "AddToWishlist", google: "add_to_wishlist" },
  cart: { meta: "AddToCart", google: "add_to_cart" },
  contact: { meta: "Contact", google: "generate_lead" },
  inquiry: { meta: "Lead", google: "generate_lead" },
  purchase: { meta: "Purchase", google: "purchase" },
};
export function shoppingAdvertisingConfig() {
  return { metaPixel: serverEnv("META_PIXEL_ID"), googleTag: serverEnv("GOOGLE_MEASUREMENT_ID") };
}
export async function queueShoppingAdvertising(
  db: any,
  actor: any,
  inputs: unknown[],
  request?: Request,
  trusted = false,
) {
  const controls = await shoppingControls(db),
    permission = await shoppingPermission(db, actor.subject);
  if (!controls.advertising || !permission?.advertising) return;
  const hash = await contentHash(actor.subject),
    config = shoppingAdvertisingConfig();
  for (const input of inputs.slice(0, 50)) {
    const event = shoppingEvent(input, trusted);
    if (!event || !names[event.kind]) continue;
    const mapping = names[event.kind];
    const context = (input as any).context ?? {};
    const conversion =
      trusted &&
      event.kind === "purchase" &&
      Number.isFinite(context.value) &&
      /^[A-Z]{3}$/.test(String(context.currency).toUpperCase())
        ? { value: context.value, currency: String(context.currency).toUpperCase() }
        : null;
    if (event.kind === "purchase" && !conversion) continue;
    // Never export searches, listing text, categories, images, messages, location,
    // identity/payment records, browser fingerprint or internal account IDs.
    for (const provider of ["meta", "google"]) {
      if (
        (provider === "meta" && !config.metaPixel) ||
        (provider === "google" && !config.googleTag)
      )
        continue;
      const payload =
        provider === "meta"
          ? {
              event_name: mapping.meta,
              event_time: Math.floor(Date.now() / 1000),
              event_id: event.id,
              action_source: "website",
              event_source_url: "https://onbluebird.com/",
              user_data: { external_id: [hash] },
              ...(conversion ? { custom_data: conversion } : {}),
            }
          : {
              client_id: `${parseInt(hash.slice(0, 12), 16)}.${parseInt(hash.slice(12, 24), 16)}`,
              events: [
                {
                  name: mapping.google,
                  params: {
                    event_id: event.id,
                    engagement_time_msec: 1,
                    ...(conversion ? { ...conversion, transaction_id: event.id } : {}),
                  },
                },
              ],
            };
      const r = await db.from("shopping_ad_outbox").upsert(
        {
          id: event.id,
          user_id: actor.user?.id ?? null,
          subject: actor.subject,
          provider,
          name: provider === "meta" ? mapping.meta : mapping.google,
          payload,
        },
        { onConflict: "id,provider", ignoreDuplicates: true },
      );
      if (r.error) throw Error("Advertising event unavailable.");
    }
  }
}
export async function deliverShoppingAdvertising(db: any) {
  if (!(await shoppingControls(db)).advertising) return { advertisingSent: 0 };
  const verified = await db
    .from("shopping_events")
    .select("id,user_id,subject,session_id,kind,listing_id,context,occurred_at")
    .in("kind", ["inquiry", "purchase"])
    .gte("occurred_at", new Date(Date.now() - 86400000).toISOString())
    .order("occurred_at", { ascending: false })
    .limit(100);
  if (verified.error) throw Error("Verified measurement unavailable.");
  for (const row of verified.data ?? [])
    await queueShoppingAdvertising(
      db,
      { subject: row.subject, user: { id: row.user_id } },
      [
        {
          id: row.id,
          session: row.session_id,
          kind: row.kind,
          listingId: row.listing_id,
          context: row.context,
          at: row.occurred_at,
        },
      ],
      undefined,
      true,
    );
  const pending = await db
    .from("shopping_ad_outbox")
    .select("*")
    .eq("status", "pending")
    .lt("attempts", 6)
    .gte("created_at", new Date(Date.now() - 86400000).toISOString())
    .order("created_at")
    .limit(100);
  if (pending.error) throw Error("Advertising queue unavailable.");
  let sent = 0;
  for (const row of pending.data ?? []) {
    if (!(await shoppingPermission(db, row.subject))?.advertising) {
      await db
        .from("shopping_ad_outbox")
        .update({ status: "suppressed" })
        .eq("id", row.id)
        .eq("provider", row.provider);
      continue;
    }
    const token = serverEnv(
      row.provider === "meta" ? "META_CONVERSIONS_TOKEN" : "GOOGLE_MEASUREMENT_SECRET",
    );
    if (!token) continue;
    // Google measurement events are at-most-once across ambiguous network failures;
    // Meta retries use its stable event_id shared with the browser Pixel.
    const claimed = await db
      .from("shopping_ad_outbox")
      .update({ status: "processing", attempts: row.attempts + 1 })
      .eq("id", row.id)
      .eq("provider", row.provider)
      .eq("status", "pending")
      .select("id");
    if (claimed.error || !claimed.data?.length) continue;
    const config = shoppingAdvertisingConfig();
    const endpoint =
      row.provider === "meta"
        ? `https://graph.facebook.com/v23.0/${encodeURIComponent(config.metaPixel)}/events`
        : `https://www.google-analytics.com/mp/collect?measurement_id=${encodeURIComponent(config.googleTag)}&api_secret=${encodeURIComponent(token)}`;
    try {
      const response = await fetch(endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(row.provider === "meta" ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify(row.provider === "meta" ? { data: [row.payload] } : row.payload),
        signal: AbortSignal.timeout(10000),
      });
      if (!response.ok) throw Error("Provider rejected measurement.");
      await db
        .from("shopping_ad_outbox")
        .update({ status: "sent" })
        .eq("id", row.id)
        .eq("provider", row.provider);
      sent++;
    } catch {
      await db
        .from("shopping_ad_outbox")
        .update({ status: row.provider === "meta" && row.attempts < 5 ? "pending" : "failed" })
        .eq("id", row.id)
        .eq("provider", row.provider);
    }
  }
  return { advertisingSent: sent };
}
