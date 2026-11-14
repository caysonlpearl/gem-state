import test from "node:test";
import assert from "node:assert/strict";
import { createClient } from "@supabase/supabase-js";
import {
  loadAccountWatchlist,
  loadMobileSavedAccount,
  removeAccountSavedVariants,
  removeAccountSavedPartner,
} from "../src/lib/account-saved.server.ts";
const a = "11111111-1111-4111-8111-111111111111",
  b = "22222222-2222-4222-8222-222222222222";
const id = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const watch = (n, category = "furniture", patch = {}) => ({
  user_id: a,
  variant_id: id(n),
  created_at: "2026-11-14T00:00:00Z",
  product_variants: {
    id: id(n),
    size: null,
    color: "Blue",
    edition: null,
    products: {
      slug: "desk-" + n,
      name: "Desk " + n,
      description: "Local desk",
      categories: { slug: category, name: category },
    },
  },
  ...patch,
});
const card = (key, category = "cars-trucks") => ({
  id: key,
  title: "Local listing",
  categorySlug: category,
  categoryName: category,
  priceCents: 100,
  currency: "USD",
  city: "Boise",
  state: "ID",
  productId: "",
  createdAt: "2026-11-14T00:00:00Z",
  imageUrl: null,
});
const partner = (key, category) => ({
  user_id: a,
  listing_id: key,
  created_at: "2026-11-14T00:00:00Z",
  snapshot: card(key, category),
});
function fixture(tables = {}, override) {
  const calls = [];
  const client = createClient("https://saved.fixture.invalid", "fixture-key", {
    auth: { persistSession: false, autoRefreshToken: false },
    global: {
      fetch: async (url, init) => {
        const u = new URL(url),
          q = u.searchParams,
          table = u.pathname.split("/").at(-1);
        const call = { table, q, init };
        calls.push(call);
        assert.equal(u.origin, "https://saved.fixture.invalid");
        if (table === "watchlist" || table.startsWith("saved_partner_"))
          assert.equal(q.get("user_id"), `eq.${a}`);
        const response = await override?.(call);
        if (response) return response;
        const filter = q.get("variant_id"),
          ids = filter?.startsWith("in.(") ? filter.slice(4, -1).split(",") : null;
        let source = (tables[table] ?? []).filter((r) => !ids || ids.includes(r.variant_id));
        if (init.method === "DELETE") {
          tables[table] = (tables[table] ?? []).filter(
            (r) =>
              r.user_id !== a ||
              (table === "watchlist"
                ? !ids.includes(r.variant_id)
                : r.listing_id !== q.get("listing_id").slice(3)),
          );
          return new Response(null, { status: 204 });
        }
        assert.equal(init.method, "GET");
        assert.equal(q.get("limit"), "500");
        const offset = Number(q.get("offset") || 0);
        return Response.json(source.slice(offset, offset + 500), {
          headers: {
            "content-range": `${offset}-${Math.max(offset, Math.min(offset + 500, source.length) - 1)}/${source.length}`,
          },
        });
      },
    },
  });
  return {
    client,
    calls,
    read: (mobile = false) => loadAccountWatchlist(client, client, a, { mobile }),
    account: () => loadMobileSavedAccount(client, client, a),
  };
}
test("saved watchlist shares the website model, retains unavailable items and filters permanent app scope before public lookups", async () => {
  const misplaced = watch(3);
  misplaced.product_variants.products.description = "Rifle ammunition";
  const f = fixture({
    watchlist: [watch(1), watch(2, "firearms"), misplaced, watch(4, "unknown")],
    variant_market_summary: [
      {
        variant_id: id(1),
        lowest_ask_cents: 4500,
        highest_bid_cents: null,
        active_ask_count: 1,
        active_bid_count: 0,
      },
    ],
    variant_sightings_public: [{ sighting_id: id(90), variant_id: id(1) }],
    asks: [{ id: id(91), variant_id: id(1), products: { status: "published" } }],
  });
  const app = await f.read(true);
  assert.equal(app.length, 1);
  assert.deepEqual(app[0], {
    variantId: id(1),
    listingId: id(91),
    productSlug: "desk-1",
    productName: "Desk 1",
    categoryName: "furniture",
    variantLabel: "Blue",
    createdAt: "2026-11-14T00:00:00Z",
    lowestAskCents: 4500,
    highestBidCents: null,
    activeAskCount: 1,
    activeBidCount: 0,
    sightingCount: 1,
  });
  assert(
    f.calls
      .filter((c) => c.q.has("variant_id"))
      .every((c) => c.q.get("variant_id") === `in.(${id(1)})`),
  );
  assert(!JSON.stringify(app).includes("ammunition"));
  assert(!JSON.stringify(app).includes("description"));
  const web = await f.read(false);
  assert.equal(web.length, 4);
  assert.equal(web.find((r) => r.variantId === id(2)).listingId, null);
  assert.equal(web.find((r) => r.variantId === id(2)).activeAskCount, 0);
});
test("saved account returns separate owned source sections without provider requests or a 200-item silent cap", async () => {
  const f = fixture({
    watchlist: [watch(1)],
    saved_partner_vehicles: Array.from({ length: 501 }, (_, i) =>
      partner("marketcheck-dealer-" + i, "cars-trucks"),
    ),
    saved_partner_homes: [partner("mashvisor-1", "other-real-estate")],
    saved_partner_jobs: [
      partner("adzuna-1", "jobs"),
      partner("avantlink-2", "furniture"),
      partner("unknown-retailer-2", "furniture"),
      partner("fsq-1", "firearms"),
    ],
  });
  const r = await f.account();
  assert.equal(r.ownerId, a);
  assert.equal(r.vehicles.length, 501);
  assert.equal(r.homes.length, 1);
  assert.equal(r.jobs.length, 1);
  assert.equal(r.jobs[0].id, "adzuna-1");
  assert.equal(f.calls.filter((c) => c.table === "saved_partner_vehicles").length, 2);
  assert(
    f.calls.every((c) => !/(email|message|reporter|token|note|address)/.test(c.q.get("select"))),
  );
});
test("owned watchlist pagination and public aggregate pagination are complete beyond one database page", async () => {
  const f = fixture({
    watchlist: Array.from({ length: 501 }, (_, i) => watch(i + 1)),
    variant_sightings_public: Array.from({ length: 501 }, (_, i) => ({
      sighting_id: id(2000 + i),
      variant_id: id(1),
    })),
  });
  const r = await f.read(true);
  assert.equal(r.length, 501);
  assert.equal(r[0].sightingCount, 501);
  assert.equal(f.calls.filter((c) => c.table === "watchlist").length, 2);
  assert(
    f.calls.filter((c) => c.q.has("variant_id")).every((c) => c.q.get("variant_id").length < 5000),
  );
});
test("empty results are honest while database errors, caps, duplicates, owner drift and changing counts are unavailable", async () => {
  const empty = fixture();
  assert.deepEqual(await empty.read(true), []);
  assert.equal(empty.calls.length, 1);
  for (const kind of ["error", "cap", "duplicate", "owner", "change", "too-many"]) {
    const f = fixture({ watchlist: Array.from({ length: 501 }, (_, i) => watch(i + 1)) }, (c) => {
      if (c.table !== "watchlist") return;
      if (kind === "error")
        return Response.json({ message: "PRIVATE diagnostic", code: "TEST" }, { status: 503 });
      if (kind === "cap")
        return Response.json([watch(1)], { headers: { "content-range": "0-0/501" } });
      if (kind === "duplicate")
        return Response.json([watch(1), watch(1)], { headers: { "content-range": "0-1/2" } });
      if (kind === "owner")
        return Response.json([watch(1, "furniture", { user_id: b })], {
          headers: { "content-range": "0-0/1" },
        });
      if (kind === "too-many") return Response.json([], { headers: { "content-range": "*/5001" } });
      if (kind === "change" && c.q.get("offset") === "500")
        return Response.json([watch(501)], { headers: { "content-range": "500-500/502" } });
    });
    await assert.rejects(
      f.read(true),
      (e) => e.message === "Could not load saved listings. Please retry." && !e.cause,
    );
  }
});
test("public aggregate errors and foreign aggregate rows cannot become zero metrics or another item link", async () => {
  for (const table of ["variant_market_summary", "variant_sightings_public", "asks"]) {
    const f = fixture({ watchlist: [watch(1)] }, (c) =>
      c.table === table
        ? Response.json({ message: "PRIVATE failure" }, { status: 503 })
        : undefined,
    );
    await assert.rejects(f.read(true), /Could not load saved listings/);
    assert.equal(f.calls.filter((c) => c.table === table).length, 1);
  }
  const f = fixture({ watchlist: [watch(1)] }, (c) =>
    c.table === "asks"
      ? Response.json([{ id: id(99), variant_id: id(2) }], {
          headers: { "content-range": "0-0/1" },
        })
      : undefined,
  );
  await assert.rejects(f.read(true), /Could not load saved listings/);
  const malformed = fixture({
    saved_partner_homes: [
      {
        ...partner("mashvisor-1", "other-real-estate"),
        snapshot: card("mashvisor-2", "other-real-estate"),
      },
    ],
  });
  await assert.rejects(malformed.account(), /Could not load saved listings/);
});
test("saved reads share an eight-second deadline and disable retries including stalled aggregate bodies", async (t) => {
  const timeout = AbortSignal.timeout.bind(AbortSignal);
  t.mock.method(AbortSignal, "timeout", (ms) => {
    assert.equal(ms, 8000);
    return timeout(25);
  });
  const keep = setTimeout(() => {}, 1500);
  t.after(() => clearTimeout(keep));
  const f = fixture({ watchlist: [watch(1)] }, (c) =>
    c.table === "asks"
      ? new Promise((_, reject) => {
          c.init.signal.addEventListener("abort", () => reject(c.init.signal.reason), {
            once: true,
          });
        })
      : undefined,
  );
  await assert.rejects(f.read(true), /Could not load saved listings/);
  assert.equal(f.calls.filter((c) => c.table === "asks").length, 1);
  assert(f.calls.every((c) => c.init.signal === f.calls[0].init.signal));
});
test("removing sold/unavailable favorites is owner-scoped, bounded and idempotent without reading a listing or expanding consent", async () => {
  const tables = { watchlist: [watch(1), watch(2, "furniture", { user_id: b })] };
  const f = fixture(tables);
  assert.deepEqual(await removeAccountSavedVariants(f.client, a, [id(1), id(2), id(1)]), {
    removed: true,
  });
  assert.deepEqual(await removeAccountSavedVariants(f.client, a, [id(1)]), { removed: true });
  assert.equal(tables.watchlist.length, 1);
  assert.equal(tables.watchlist[0].user_id, b);
  assert(f.calls.every((c) => c.table === "watchlist" && c.init.method === "DELETE"));
  const before = f.calls.length;
  for (const ids of [[], ["bad"], Array.from({ length: 101 }, (_, i) => id(i))])
    await assert.rejects(removeAccountSavedVariants(f.client, a, ids));
  assert.equal(f.calls.length, before);
  const broken = fixture({}, () => Response.json({ message: "PRIVATE fail" }, { status: 503 }));
  await assert.rejects(
    removeAccountSavedVariants(broken.client, a, [id(1)]),
    (e) => e.message === "Could not remove saved listings. Please retry." && !e.cause,
  );
  assert.equal(broken.calls.length, 1);
});

test("unavailable partner snapshots remain removable without resolving a live listing, exposing another owner or accepting prohibited references", async () => {
  for (const [table, key] of [
    ["saved_partner_vehicles", "marketcheck-dealer-retired"],
    ["saved_partner_homes", "mashvisor-123"],
    ["saved_partner_jobs", "rescuegroups-456"],
  ]) {
    const tables = {
      [table]: [partner(key, "general"), { ...partner(key, "general"), user_id: b }],
    };
    const f = fixture(tables);
    assert.deepEqual(await removeAccountSavedPartner(f.client, a, key), { removed: true });
    assert.deepEqual(await removeAccountSavedPartner(f.client, a, key), { removed: true });
    assert.equal(tables[table].length, 1);
    assert.equal(tables[table][0].user_id, b);
    assert(f.calls.every((c) => c.table === table && c.init.method === "DELETE"));
  }
  const f = fixture();
  for (const key of ["avantlink-123", "firearms", "../../watchlist", "unknown-1"])
    await assert.rejects(removeAccountSavedPartner(f.client, a, key));
  assert.equal(f.calls.length, 0);
});
