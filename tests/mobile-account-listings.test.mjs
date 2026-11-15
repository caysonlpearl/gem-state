import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import {
  loadMobileAccountListings,
  loadMobileOwnedThumbnail,
} from "../src/lib/mobile-account-listings.server.ts";
const owner = randomUUID(),
  other = randomUUID();
function listing(patch = {}) {
  return {
    id: randomUUID(),
    seller_id: owner,
    variant_id: randomUUID(),
    price_cents: 1200,
    currency: "USD",
    status: "active",
    is_demo: false,
    created_at: "2026-11-14T10:00:00Z",
    expires_at: "2026-12-14T10:00:00Z",
    approved_at: null,
    sold_at: null,
    products: {
      slug: "local-desk",
      name: "Local desk",
      description: "A useful local desk in good condition.",
      status: "active",
      categories: { slug: "furniture" },
    },
    product_variants: { size: null, color: null, edition: null },
    ...patch,
  };
}
function fixture(rows, override) {
  const calls = [];
  const client = createClient("https://owned-listings.fixture.invalid", "fixture", {
    auth: { persistSession: false, autoRefreshToken: false },
    global: {
      fetch: async (url, init) => {
        const u = new URL(url),
          q = u.searchParams,
          table = u.pathname.split("/").at(-1),
          call = { table, q, init };
        calls.push(call);
        assert.equal(init.method, "GET");
        assert(init.signal instanceof AbortSignal);
        const custom = await override?.(call, calls);
        if (custom) return custom;
        if (table === "seller_profiles") {
          assert.equal(q.get("select"), "user_id");
          assert.equal(q.get("user_id"), "eq." + owner);
          return Response.json({ user_id: owner });
        }
        if (table === "asks") {
          assert.equal(q.get("seller_id"), "eq." + owner);
          assert.equal(q.get("is_demo"), "eq.false");
          if (q.has("id")) return Response.json(rows[0] ?? null);
          assert.equal(q.get("order"), "id.asc");
          assert.equal(new Headers(init.headers).get("prefer"), "count=exact");
          const offset = Number(q.get("offset") || 0),
            limit = Number(q.get("limit"));
          return Response.json(
            rows
              .slice()
              .sort((a, b) => a.id.localeCompare(b.id))
              .slice(offset, offset + limit),
            {
              headers: {
                "content-range": `${offset}-${Math.min(rows.length - 1, offset + limit - 1)}/${rows.length}`,
              },
            },
          );
        }
        assert(
          [
            "classified_listing_metrics",
            "conversations",
            "listing_inquiries",
            "variant_market_summary",
          ].includes(table),
        );
        assert(
          q
            .get(table === "variant_market_summary" ? "variant_id" : "listing_id")
            .startsWith("in.("),
        );
        if (["conversations", "listing_inquiries"].includes(table)) {
          assert.equal(q.get("seller_id"), "eq." + owner);
          assert.equal(q.get("select"), "id,listing_id,seller_id");
        }
        return Response.json([], { headers: { "content-range": "0-0/0" } });
      },
    },
  });
  return {
    client,
    calls,
    read: () => loadMobileAccountListings(client, owner),
    photo: (id, sign) => loadMobileOwnedThumbnail(client, owner, id, sign),
  };
}
test("owned listing metadata pages beyond 500, uses sanitized shared rows and never signs photos or reads private buyer/billing data", async () => {
  const rows = Array.from({ length: 501 }, () => listing());
  rows.push(
    listing({
      products: {
        name: "Rifle ammunition",
        description: "Restricted inventory",
        categories: { slug: "firearms" },
      },
    }),
  );
  const f = fixture(rows),
    r = await f.read();
  assert.equal(r.ownerId, owner);
  assert.equal(r.listings.length, 501);
  assert.equal(r.sellerExists, true);
  assert.deepEqual(r.unavailableMetrics, []);
  assert.equal(f.calls.filter((c) => c.table === "asks").length, 2);
  const json = JSON.stringify(r);
  assert(!json.includes("Rifle"));
  assert(!json.includes("seller_id"));
  assert(!json.includes("storage_path"));
  assert.equal(r.listings[0].productName, "Local desk");
  assert.equal(r.listings[0].views, 0);
  assert.equal(r.listings[0].variantLabel, "One variation");
});
test("empty listings are complete without metric calls; missing seller profile is normal", async () => {
  const f = fixture([], (c) => (c.table === "seller_profiles" ? Response.json(null) : undefined)),
    r = await f.read();
  assert.deepEqual(r, {
    ownerId: owner,
    listings: [],
    sellerExists: false,
    unavailableMetrics: [],
  });
  assert.equal(f.calls.length, 2);
});
test("core ownership, duplicate, malformed, unavailable count and capped reads reject rather than partial results", async () => {
  for (const mutate of [
    (r) => {
      r[0].seller_id = other;
    },
    (r) => {
      r[0].is_demo = true;
    },
    (r) => {
      r.push({ ...r[0] });
    },
    (r) => {
      r[0].price_cents = null;
    },
    (r) => {
      r[0].expires_at = "bad";
    },
  ]) {
    const rows = [listing()];
    mutate(rows);
    await assert.rejects(fixture(rows).read(), (e) => e.status === 503 && !e.cause);
  }
  for (const count of [null, 5001, -1, "NaN", 3]) {
    const f = fixture([listing()], (c) =>
      c.table === "asks"
        ? Response.json([listing()], {
            headers: count === null ? {} : { "content-range": `0-0/${count}` },
          })
        : undefined,
    );
    await assert.rejects(f.read(), /Your listings could not be loaded/);
  }
});
test("failed optional metrics have explicit unavailable flags, not misleading zero-valued metrics", async () => {
  for (const bad of [null, "", -1, "NaN", 1.5]) {
    const row = listing();
    const f = fixture([row], (c) =>
      c.table === "classified_listing_metrics"
        ? Response.json([{ listing_id: row.id, views: bad, impressions: 10 }], {
            headers: { "content-range": "0-0/1" },
          })
        : undefined,
    );
    assert.deepEqual((await f.read()).unavailableMetrics, ["views", "impressions"]);
  }
  const f = fixture([listing()], (c) =>
    ["conversations", "variant_market_summary"].includes(c.table)
      ? Response.json({ message: "private diagnostics" }, { status: 503 })
      : undefined,
  );
  assert.deepEqual((await f.read()).unavailableMetrics, ["leads", "offers"]);
  assert.equal(f.calls.filter((c) => c.table === "conversations").length, 1);
});
test("metrics outside current listing/owner scope are unavailable and never counted", async () => {
  const row = listing(),
    f = fixture([row], (c) =>
      c.table === "conversations"
        ? Response.json([{ id: randomUUID(), listing_id: row.id, seller_id: other }], {
            headers: { "content-range": "0-0/1" },
          })
        : undefined,
    );
  assert.deepEqual((await f.read()).unavailableMetrics, ["leads"]);
});
test("thumbnail reads authorize one eligible owner row before signing exactly one path; no raw path is returned", async () => {
  const row = listing({ listing_media: [{ storage_path: owner + "/photo.jpg", position: 0 }] }),
    f = fixture([row]);
  let signed = [];
  assert.deepEqual(
    await f.photo(row.id, async (paths) => {
      signed = paths;
      return new Map([[paths[0], "https://images.fixture.invalid/signed.jpg"]]);
    }),
    { url: "https://images.fixture.invalid/signed.jpg" },
  );
  assert.deepEqual(signed, [owner + "/photo.jpg"]);
  const q = f.calls[0].q;
  assert.equal(q.get("listing_media.limit"), "1");
  assert.equal(q.get("listing_media.order"), "position.asc,id.asc");
  for (const patch of [
    { seller_id: other },
    { is_demo: true },
    {
      products: {
        name: "Rifle ammunition",
        description: "Restricted",
        categories: { slug: "firearms" },
      },
    },
  ]) {
    const x = listing({ ...patch, listing_media: row.listing_media }),
      g = fixture([x]);
    await assert.rejects(
      g.photo(x.id, async () => {
        assert.fail("must authorize before signing");
      }),
      (e) => e.status === 404,
    );
  }
});
test("thumbnail missing photos, signing failures, unsafe URLs and provider diagnostics are handled accurately", async () => {
  let row = listing({ listing_media: [] }),
    f = fixture([row]);
  assert.deepEqual(
    await f.photo(row.id, async () => {
      assert.fail("no signing for empty media");
    }),
    { url: null },
  );
  for (const sign of [
    async () => {
      throw Error("private credential detail");
    },
    async (paths) => new Map([[paths[0], "javascript:bad"]]),
    async () => new Map(),
  ]) {
    row = listing({ listing_media: [{ storage_path: owner + "/photo.jpg", position: 0 }] });
    f = fixture([row]);
    await assert.rejects(
      f.photo(row.id, sign),
      (e) => e.status === 503 && !e.message.includes("private") && !e.cause,
    );
  }
});
test("invalid scope rejects without transport and stalled core responses abort once", async (t) => {
  const f = fixture([]);
  await assert.rejects(loadMobileAccountListings(f.client, "victim"));
  assert.equal(f.calls.length, 0);
  const real = AbortSignal.timeout.bind(AbortSignal);
  t.mock.method(AbortSignal, "timeout", (ms) => {
    assert.equal(ms, 8000);
    return real(25);
  });
  let aborted = 0;
  const g = fixture([listing()], (c) =>
    c.table === "asks"
      ? new Promise((resolve, reject) =>
          c.init.signal.addEventListener(
            "abort",
            () => {
              aborted++;
              reject(Error("private timeout"));
            },
            { once: true },
          ),
        )
      : undefined,
  );
  const keep = setInterval(() => {}, 1000);
  try {
    await assert.rejects(g.read(), /Your listings could not be loaded/);
  } finally {
    clearInterval(keep);
  }
  assert.equal(aborted, 1);
  assert.equal(g.calls.filter((c) => c.table === "asks").length, 1);
});
