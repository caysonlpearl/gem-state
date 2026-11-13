import { createFileRoute } from "@tanstack/react-router";
import { shoppingDb } from "@/lib/shopping.server";
async function handle(request: Request) {
  const { serverEnv } = await import("@/lib/runtime-env.server");
  const secret = serverEnv("RESEND_SHOPPING_WEBHOOK_SECRET");
  if (!secret) return new Response("Unavailable", { status: 503 });
  if (Number(request.headers.get("content-length") ?? 0) > 64000)
    return new Response("Too large", { status: 413 });
  const raw = await request.text();
  if (raw.length > 64000) return new Response("Too large", { status: 413 });
  const id = request.headers.get("svix-id") ?? "",
    time = request.headers.get("svix-timestamp") ?? "",
    signatures = request.headers.get("svix-signature") ?? "";
  if (!id || !/^\d+$/.test(time) || Math.abs(Date.now() / 1000 - Number(time)) > 300)
    return new Response("Unauthorized", { status: 401 });
  const { createHmac, timingSafeEqual } = await import("node:crypto");
  const expected = createHmac("sha256", Buffer.from(secret.replace(/^whsec_/, ""), "base64"))
    .update(`${id}.${time}.${raw}`)
    .digest();
  const valid = signatures.split(" ").some((value) => {
    const [version, signature] = value.split(",");
    if (version !== "v1" || !signature) return false;
    const provided = Buffer.from(signature, "base64");
    return provided.length === expected.length && timingSafeEqual(expected, provided);
  });
  if (!valid) return new Response("Unauthorized", { status: 401 });
  let event;
  try {
    event = JSON.parse(raw);
  } catch {
    return new Response("Invalid JSON", { status: 400 });
  }
  const allowed = [
    "email.sent",
    "email.delivered",
    "email.delivery_delayed",
    "email.bounced",
    "email.complained",
    "email.failed",
    "email.suppressed",
  ];
  if (!allowed.includes(event.type) || typeof event.data?.email_id !== "string")
    return Response.json({ ok: true });
  const db = await shoppingDb();
  const duplicate = await db
    .from("shopping_email_receipts")
    .select("id")
    .eq("id", id)
    .maybeSingle();
  if (duplicate.error) return new Response("Retry", { status: 503 });
  if (duplicate.data) return Response.json({ ok: true });
  let delivery = await db
    .from("shopping_deliveries")
    .select("id,user_id,provider_status")
    .eq("provider_id", event.data.email_id)
    .maybeSingle();
  if (delivery.error) return new Response("Retry", { status: 503 });
  const tags = event.data.tags;
  const taggedId = Array.isArray(tags)
    ? tags.find((t: { name?: string }) => t.name === "bluebird_shopping_id")?.value
    : tags?.bluebird_shopping_id;
  if (!delivery.data && typeof taggedId === "string" && /^[0-9a-f-]{36}$/i.test(taggedId)) {
    delivery = await db
      .from("shopping_deliveries")
      .select("id,user_id,provider_status")
      .eq("id", taggedId)
      .maybeSingle();
    if (delivery.error) return new Response("Retry", { status: 503 });
  }
  // Resend webhooks may cover other operational email. Do not alter those messages.
  if (delivery.data) {
    const update = await db
      .from("shopping_deliveries")
      .update({
        provider_id: event.data.email_id,
        provider_status:
          (
            { "email.complained": 3, "email.bounced": 2, "email.suppressed": 1 } as Record<
              string,
              number
            >
          )[delivery.data.provider_status ?? ""] >
          ((
            { "email.complained": 3, "email.bounced": 2, "email.suppressed": 1 } as Record<
              string,
              number
            >
          )[event.type] ?? 0)
            ? delivery.data.provider_status
            : event.type,
      })
      .eq("id", delivery.data.id);
    if (update.error) return new Response("Retry", { status: 503 });
    if (["email.complained", "email.bounced", "email.suppressed"].includes(event.type)) {
      const blocked = await db
        .from("shopping_accounts")
        .update({ delivery_blocked: true })
        .eq("user_id", delivery.data.user_id);
      if (blocked.error) return new Response("Retry", { status: 503 });
      const suppress = await db
        .from("shopping_queue")
        .update({ status: "suppressed" })
        .eq("user_id", delivery.data.user_id)
        .in("status", ["pending", "processing"]);
      if (suppress.error) return new Response("Retry", { status: 503 });
    }
  }
  const receipt = await db
    .from("shopping_email_receipts")
    .upsert({ id, kind: event.type }, { onConflict: "id", ignoreDuplicates: true });
  if (receipt.error) return new Response("Retry", { status: 503 });
  return Response.json({ ok: true });
}
export const Route = createFileRoute("/api/shopping-email-events")({
  server: { handlers: { POST: ({ request }) => handle(request) } },
});
