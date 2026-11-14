import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { loadMobileAccountReviews } from "../src/lib/mobile-account-reviews.server.ts";
const owner = randomUUID(),
  other = randomUUID();
const review = (patch = {}) => ({
  id: randomUUID(),
  seller_id: owner,
  rating: 5,
  comment: "Helpful local seller.",
  created_at: "2026-11-14T10:00:00Z",
  ...patch,
});
function fixture(
  rows = [],
  customize,
  profile = { user_id: owner, slug: "fixture-shop", display_name: "Local fixture", bio: null },
) {
  const calls = [];
  const client = createClient("https://reviews.fixture.invalid", "fixture-key", {
    auth: { persistSession: false, autoRefreshToken: false },
    global: {
      fetch: async (url, init) => {
        const u = new URL(url),
          q = u.searchParams;
        const table = u.pathname.split("/").at(-1);
        const call = { q, init, table };
        calls.push(call);
        if (table === "seller_storefronts") {
          assert.equal(q.get("user_id"), "eq." + owner);
          assert.equal(q.get("select"), "user_id,slug,display_name,bio");
          return profile instanceof Response ? profile : Response.json(profile);
        }
        assert.equal(u.pathname, "/rest/v1/seller_reviews");
        assert.equal(init.method, "GET");
        assert.equal(q.get("seller_id"), "eq." + owner);
        assert.equal(q.get("select"), "id,seller_id,rating,comment,created_at");
        assert.equal(q.get("order"), "created_at.desc,id.asc");
        assert.equal(q.get("limit"), "20");
        assert.equal(new Headers(init.headers).get("prefer"), "count=exact");
        const replacement = await customize?.(call, calls);
        if (replacement) return replacement;
        const sorted = rows
          .filter((r) => r.seller_id === owner)
          .sort((a, b) => b.created_at.localeCompare(a.created_at) || a.id.localeCompare(b.id));
        return Response.json(sorted.slice(0, 20), {
          headers: {
            "content-range": `0-${Math.max(0, Math.min(20, sorted.length) - 1)}/${sorted.length}`,
          },
        });
      },
    },
  });
  return { calls, client, read: () => loadMobileAccountReviews(client, owner) };
}
test("reviews read only the current seller latest-20 window and return no reviewer or financial fields", async () => {
  const rows = Array.from({ length: 25 }, (_, i) =>
    review({
      rating: (i % 5) + 1,
      created_at: new Date(Date.UTC(2026, 10, i + 1)).toISOString(),
      reviewer_id: "private-person",
      payment_secret: "private-financial",
    }),
  );
  rows.push(review({ seller_id: other, comment: "Another account private review." }));
  const f = fixture(rows),
    result = await f.read();
  assert.equal(result.ownerId, owner);
  assert.equal(result.sellerSlug, "fixture-shop");
  assert.equal(result.reviews.length, 20);
  assert.deepEqual(
    result.reviews.map((r) => r.createdAt),
    rows
      .slice(5, 25)
      .reverse()
      .map((r) => r.created_at),
  );
  assert.equal(result.ratingAverage, 3);
  assert.equal(f.calls.filter((c) => c.table === "seller_reviews").length, 1);
  assert(!JSON.stringify(result).includes("private-"));
  assert(!JSON.stringify(result).includes("Another account"));
  assert.deepEqual(Object.keys(result.reviews[0]).sort(), ["comment", "createdAt", "id", "rating"]);
});
test("empty reviews and null comments are ordinary results; app-ineligible content never contributes to the rating", async () => {
  assert.deepEqual(await fixture().read(), {
    ownerId: owner,
    reviews: [],
    ratingAverage: null,
    sellerSlug: "fixture-shop",
  });
  const result = await fixture([
    review({ rating: 4, comment: null }),
    review({ rating: 1, comment: "Great seller of rifle ammunition." }),
  ]).read();
  assert.equal(result.reviews.length, 1);
  assert.equal(result.reviews[0].comment, null);
  assert.equal(result.ratingAverage, 4);
});
test("foreign ownership, duplicates, malformed data and capped projections are unavailable rather than partial reputation", async () => {
  for (const change of [
    (rows) => {
      rows[0].seller_id = other;
    },
    (rows) => {
      rows.push({ ...rows[0] });
    },
    (rows) => {
      rows[0].rating = 1.5;
    },
    (rows) => {
      rows[0].rating = 6;
    },
    (rows) => {
      rows[0].created_at = "invalid";
    },
    (rows) => {
      rows[0].comment = { private: "value" };
    },
  ]) {
    const rows = [review()];
    change(rows);
    const f = fixture([], () =>
      Response.json(rows, { headers: { "content-range": `0-${rows.length - 1}/${rows.length}` } }),
    );
    await assert.rejects(
      f.read(),
      (e) => e.status === 503 && e.code === "reviews_unavailable" && !e.message.includes("private"),
    );
  }
  for (const total of [null, "NaN", -1, 5]) {
    const f = fixture([], () =>
      Response.json([review()], {
        headers: total === null ? {} : { "content-range": `0-0/${total}` },
      }),
    );
    await assert.rejects(f.read(), /Your reviews could not be loaded/);
  }
});
test("database outages do not retry or leak provider diagnostics", async () => {
  const f = fixture([], () =>
    Response.json({ message: "private database error", code: "secret" }, { status: 503 }),
  );
  await assert.rejects(
    f.read(),
    (e) =>
      e.status === 503 &&
      e.message === "Your reviews could not be loaded. Please retry." &&
      !e.cause,
  );
  assert.equal(f.calls.filter((c) => c.table === "seller_reviews").length, 1);
});
test("a stalled response is aborted under the eight-second read budget", async (t) => {
  const real = AbortSignal.timeout.bind(AbortSignal);
  t.mock.method(AbortSignal, "timeout", (ms) => {
    assert.equal(ms, 8000);
    return real(25);
  });
  let aborted = false;
  const f = fixture(
    [],
    ({ init }) =>
      new Promise((resolve, reject) =>
        init.signal.addEventListener(
          "abort",
          () => {
            aborted = true;
            reject(new DOMException("private transport data", "AbortError"));
          },
          { once: true },
        ),
      ),
  );
  const keepAlive = setInterval(() => {}, 1000);
  try {
    await assert.rejects(f.read(), /Your reviews could not be loaded/);
  } finally {
    clearInterval(keepAlive);
  }
  assert.equal(aborted, true);
  assert.equal(f.calls.filter((c) => c.table === "seller_reviews").length, 1);
});
test("invalid caller scopes reject before any read", async () => {
  const f = fixture();
  await assert.rejects(
    loadMobileAccountReviews(f.client, "victim"),
    /Your reviews could not be loaded/,
  );
  assert.equal(f.calls.length, 0);
});

test("review links use only the current eligible public profile, with missing profiles handled normally", async () => {
  for (const profile of [
    null,
    { user_id: owner, slug: "fixture-shop", display_name: "Rifle ammunition seller", bio: null },
    {
      user_id: owner,
      slug: "fixture-shop",
      display_name: "Local shop",
      bio: "Rifle ammunition seller",
    },
  ]) {
    const result = await fixture([], undefined, profile).read();
    assert.equal(result.sellerSlug, null);
  }
  for (const profile of [
    { user_id: other, slug: "fixture-shop", display_name: "Other account", bio: null },
    { user_id: owner, slug: "../checkout", display_name: "Local", bio: null },
    Response.json({ message: "private profile error" }, { status: 503 }),
  ]) {
    await assert.rejects(
      fixture([], undefined, profile).read(),
      /Your reviews could not be loaded/,
    );
  }
});
