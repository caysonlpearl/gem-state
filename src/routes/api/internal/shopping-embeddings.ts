/* eslint-disable @typescript-eslint/no-explicit-any -- server-only vector projection */
import { createFileRoute } from "@tanstack/react-router";
import { SHOPPING_MODEL } from "@/lib/shopping-contract";
import { shoppingDb, shoppingControls } from "@/lib/shopping.server";
async function handle(request: Request) {
  const { serverEnv } = await import("@/lib/runtime-env.server");
  const secret = serverEnv("SHOPPING_JOB_SECRET"),
    provided = request.headers.get("authorization")?.replace(/^Bearer /, "") ?? "";
  if (!secret) return new Response("Job unavailable", { status: 503 });
  const { createHash, timingSafeEqual } = await import("node:crypto");
  const hash = (v: string) => createHash("sha256").update(v).digest();
  if (!timingSafeEqual(hash(secret), hash(provided)))
    return new Response("Unauthorized", { status: 401 });
  const db = await shoppingDb(),
    headers = { "Cache-Control": "no-store", "X-Robots-Tag": "noindex" };
  if (request.method === "GET") {
    if (!(await shoppingControls(db)).embeddings)
      return Response.json({ model: SHOPPING_MODEL, items: [] }, { headers });
    const r = await db.rpc("shopping_embedding_candidates", { batch_size: 96 });
    if (r.error) return new Response("Catalog unavailable", { status: 503 });
    return Response.json(
      {
        model: SHOPPING_MODEL,
        items: (r.data ?? []).map((r: any) => ({
          id: r.listing_id,
          hash: r.content_hash,
          image: r.card.imageUrl,
          text: [
            r.card.title,
            r.card.categorySlug,
            r.card.city,
            r.card.state,
            ...Object.values(r.card.vehicle ?? {}).filter(
              (x) => typeof x === "string" || typeof x === "number",
            ),
            r.card.home?.propertyType,
          ]
            .filter(Boolean)
            .join(" ")
            .slice(0, 1000),
        })),
      },
      { headers },
    );
  }
  const raw = await request.text();
  if (raw.length > 4000000) return new Response("Too large", { status: 413 });
  let body: any;
  try {
    body = JSON.parse(raw);
  } catch {
    return new Response("Invalid JSON", { status: 400 });
  }
  if (body.model !== SHOPPING_MODEL || !Array.isArray(body.items) || body.items.length > 96)
    return new Response("Invalid batch", { status: 400 });
  const current = await db
    .from("shopping_inventory")
    .select("listing_id,content_hash")
    .in(
      "listing_id",
      body.items.map((i: any) => i.id),
    )
    .gt("valid_until", new Date().toISOString());
  if (current.error) return new Response("Catalog unavailable", { status: 503 });
  const rows = [];
  for (const item of body.items) {
    if (
      !Array.isArray(item.vector) ||
      item.vector.length !== 768 ||
      item.vector.some((v: unknown) => typeof v !== "number" || !Number.isFinite(v))
    )
      return new Response("Invalid vector", { status: 400 });
    const norm = Math.sqrt(item.vector.reduce((s: number, v: number) => s + v * v, 0));
    if (norm < 0.99 || norm > 1.01)
      return new Response("Vector must be normalized", { status: 400 });
    if (!current.data.some((r: any) => r.listing_id === item.id && r.content_hash === item.hash))
      continue;
    rows.push({
      listing_id: item.id,
      content_hash: item.hash,
      model_version: SHOPPING_MODEL,
      embedding: JSON.stringify(item.vector),
      updated_at: new Date().toISOString(),
    });
  }
  if (rows.length) {
    const r = await db.from("shopping_embeddings").upsert(rows, { onConflict: "listing_id" });
    if (r.error) return new Response("Vector save failed", { status: 503 });
  }
  return Response.json({ stored: rows.length }, { headers });
}
export const Route = createFileRoute("/api/internal/shopping-embeddings")({
  server: {
    handlers: { GET: ({ request }) => handle(request), POST: ({ request }) => handle(request) },
  },
});
