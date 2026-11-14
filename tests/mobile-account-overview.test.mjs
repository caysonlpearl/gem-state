import test from "node:test";
import assert from "node:assert/strict";
import { createClient } from "@supabase/supabase-js";
import { loadMobileAccountOverview } from "../src/lib/mobile-account-overview.server.ts";
const a = "11111111-1111-4111-8111-111111111111",
  b = "22222222-2222-4222-8222-222222222222";
const product = (category = "furniture", name = "Desk", description = "Local desk") => ({
  name,
  description,
  status: "published",
  categories: { slug: category },
});
const ask = (id, patch = {}) => ({
  id,
  seller_id: a,
  is_demo: false,
  status: "active",
  approved_at: "2026-11-01",
  sold_at: null,
  products: product(),
  ...patch,
});
const order = (id, patch = {}) => ({
  id,
  seller_id: a,
  is_demo: false,
  status: "completed",
  products: product(),
  ...patch,
});
const watch = (id, p = product()) => ({
  variant_id: id,
  user_id: a,
  product_variants: { products: p },
});
function fixture(tables, customize) {
  const calls = [];
  const client = createClient("https://overview.fixture.invalid", "fixture-key", {
    auth: { persistSession: false, autoRefreshToken: false },
    global: {
      fetch: async (url, init) => {
        const u = new URL(url),
          table = u.pathname.split("/").at(-1),
          q = u.searchParams;
        calls.push({ table, q, init });
        assert.equal(q.get(table === "watchlist" ? "user_id" : "seller_id"), `eq.${a}`);
        assert.equal(init.method, "GET");
        if (table !== "watchlist") assert.equal(q.get("is_demo"), "eq.false");
        if (table === "orders") assert.equal(q.get("status"), "eq.completed");
        const offset = Number(q.get("offset") || 0),
          limit = Number(q.get("limit"));
        assert.equal(limit, 500);
        const source = tables[table] || [];
        const override = await customize?.({ table, q, init, offset, calls });
        if (override) return override;
        return Response.json(source.slice(offset, offset + limit), {
          headers: {
            "content-range": `${offset}-${Math.max(offset, Math.min(offset + limit, source.length) - 1)}/${source.length}`,
          },
        });
      },
    },
  });
  return { calls, read: () => loadMobileAccountOverview(client, a) };
}
test("account counts use shared seller states and exclude restricted, misplaced, unknown and demo inventory", async () => {
  const f = fixture({
    asks: [
      ask("active"),
      ask("pending", { approved_at: null }),
      ask("review", { status: "pending_review" }),
      ask("sold", { sold_at: "2026-11-03" }),
      ask("rejected", { products: { ...product(), status: "rejected" } }),
      ask("firearm", { products: product("firearms") }),
      ask("misplaced", { products: product("furniture", "Rifle ammunition") }),
      ask("private-desc", { products: product("furniture", "Case", "Rifle ammunition") }),
      ask("unknown", { products: product("unknown") }),
      ask("demo", { is_demo: true }),
    ],
    orders: [
      order("verified"),
      order("contact-is-not-sale", { status: "pending" }),
      order("restricted", { products: product("firearms") }),
      order("demo-sale", { is_demo: true }),
    ],
    watchlist: [
      watch("saved"),
      watch("restricted", product("firearms")),
      watch("misplaced", product("furniture", "Rifle ammunition")),
    ],
  });
  const result = await f.read();
  assert.deepEqual(result, {
    ownerId: a,
    watchlistCount: 1,
    activeListings: 1,
    pendingListings: 2,
    completedSalesCount: 1,
  });
  assert.equal(f.calls.length, 3);
  assert(!JSON.stringify(result).includes("ammunition"));
  assert(!JSON.stringify(result).includes("products"));
  assert(f.calls.every((c) => !/token|email|message|storage_path|payout/.test(c.q.get("select"))));
});
test("owner overview paginates a real SDK response beyond one batch without extra provider services", async () => {
  const f = fixture({ asks: Array.from({ length: 501 }, (_, i) => ask(`ask-${i}`)) });
  const result = await f.read();
  assert.equal(result.activeListings, 501);
  assert.equal(f.calls.filter((c) => c.table === "asks").length, 2);
  assert.deepEqual(
    f.calls.filter((c) => c.table === "asks").map((c) => c.q.get("offset")),
    ["0", "500"],
  );
});
test("database errors, partial caps and count changes cannot become zero or partial account metrics", async () => {
  for (const kind of ["error", "partial", "changed", "over-budget", "duplicate", "owner"]) {
    const f = fixture(
      { asks: Array.from({ length: 501 }, (_, i) => ask(`ask-${i}`)) },
      ({ table, offset }) => {
        if (table !== "asks") return;
        if (kind === "error")
          return Response.json({ message: "PRIVATE credentials", code: "TEST" }, { status: 503 });
        if (kind === "partial")
          return Response.json([ask("one")], { headers: { "content-range": "0-0/501" } });
        if (kind === "over-budget")
          return Response.json([], { headers: { "content-range": "*/5001" } });
        if (kind === "owner")
          return Response.json([ask("foreign", { seller_id: b })], {
            headers: { "content-range": "0-0/1" },
          });
        if (offset && kind === "changed")
          return Response.json([ask("last")], { headers: { "content-range": "500-500/502" } });
        if (offset && kind === "duplicate")
          return Response.json([ask("ask-0")], { headers: { "content-range": "500-500/501" } });
      },
    );
    await assert.rejects(
      f.read(),
      (e) =>
        e.code === "overview_unavailable" && e.status === 503 && !e.message.includes("PRIVATE"),
      kind,
    );
  }
});
test("empty owner overview is genuinely empty", async () => {
  assert.deepEqual(await fixture({}).read(), {
    ownerId: a,
    watchlistCount: 0,
    activeListings: 0,
    pendingListings: 0,
    completedSalesCount: 0,
  });
});

test("overview deadline cancels all pending reads without SDK retries or private errors", async (t) => {
  const keepAlive = setTimeout(() => {}, 1000);
  t.after(() => clearTimeout(keepAlive));
  const realTimeout = AbortSignal.timeout.bind(AbortSignal);
  t.mock.method(AbortSignal, "timeout", (ms) => {
    assert.equal(ms, 8000);
    return realTimeout(25);
  });
  const f = fixture(
    {},
    ({ init }) =>
      new Promise((_resolve, reject) => {
        init.signal.addEventListener("abort", () => reject(init.signal.reason), { once: true });
      }),
  );
  await assert.rejects(f.read(), (e) => e.code === "overview_unavailable");
  assert.equal(f.calls.length, 3);
  assert(f.calls.every((c) => c.init.signal.aborted));
});
