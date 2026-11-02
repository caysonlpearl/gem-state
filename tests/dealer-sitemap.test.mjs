import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dealerSitemapEntries } from "../src/lib/dealer-sitemap.server.ts";

function reader(rows, error = null) {
  const calls = [];
  return {
    calls,
    from(table) {
      assert.equal(table, "dealer_profiles");
      const call = { table };
      calls.push(call);
      return {
        select(columns) {
          call.columns = columns;
          return this;
        },
        in(column, ids) {
          assert.equal(column, "id");
          call.ids = ids;
          return this;
        },
        eq(column, value) {
          assert.equal(column, "status");
          assert.equal(value, "ready");
          return this;
        },
        not(column, operator, value) {
          assert.equal(column, "agreements_accepted_at");
          assert.equal(operator, "is");
          assert.equal(value, null);
          return Promise.resolve({
            error,
            data: rows.filter(
              (row) =>
                call.ids.includes(row.id) && row.status === "ready" && row.agreements_accepted_at,
            ),
          });
        },
      };
    },
  };
}
const day = "2026-10-22T00:00:00Z";
const dealer = (id, extra = {}) => ({
  id,
  slug: id,
  status: "ready",
  agreements_accepted_at: day,
  updated_at: day,
  ...extra,
});
test("empty inventory performs no dealership read", async () => {
  const db = reader([dealer("empty")]);
  assert.deepEqual(
    await dealerSitemapEntries(db, [{ updated_at: day }, { dealer_id: null, updated_at: day }]),
    [],
  );
  assert.equal(db.calls.length, 0);
});
test("only public live inventory owners that are ready and accepted are included", async () => {
  const db = reader([
    dealer("active"),
    dealer("draft", { status: "draft" }),
    dealer("unsigned", { agreements_accepted_at: null }),
    dealer("empty"),
  ]);
  const entries = await dealerSitemapEntries(
    db,
    ["active", "draft", "unsigned"].map((dealer_id) => ({ dealer_id, updated_at: day })),
  );
  assert.deepEqual(entries, [{ path: "/dealers/active", lastmod: day }]);
  assert.equal(db.calls[0].columns, "id,slug,updated_at");
});
test("deduplicates owners, uses newest listing or profile update, and escapes path segments", async () => {
  const db = reader([
    dealer("a", { slug: "A & B" }),
    dealer("b", { updated_at: "2026-10-24T00:00:00Z" }),
  ]);
  const rows = [
    { dealer_id: "a", updated_at: "2026-10-23T00:00:00Z" },
    { dealer_id: "a", updated_at: day },
    { dealer_id: "b", updated_at: day },
  ];
  assert.deepEqual(await dealerSitemapEntries(db, rows), [
    { path: "/dealers/A%20%26%20B", lastmod: "2026-10-23T00:00:00Z" },
    { path: "/dealers/b", lastmod: "2026-10-24T00:00:00Z" },
  ]);
  assert.deepEqual(db.calls[0].ids, ["a", "b"]);
});
test("bounds large lookups and rejects query errors instead of publishing an empty replacement", async () => {
  const rows = Array.from({ length: 1001 }, (_, i) => ({ dealer_id: String(i), updated_at: day }));
  const db = reader(rows.map((row) => dealer(row.dealer_id)));
  assert.equal((await dealerSitemapEntries(db, rows)).length, 1001);
  assert.deepEqual(
    db.calls.map((call) => call.ids.length),
    [500, 500, 1],
  );
  assert.equal(await dealerSitemapEntries(reader([], { message: "offline" }), rows), null);
});
test("route indexability and sitemap integration use visible inventory and fail closed", () => {
  const source = (name) => readFileSync(new URL("../src/" + name, import.meta.url), "utf8");
  assert.match(
    source("routes/dealers.$slug.tsx"),
    /isIndexableStorefront\(loaderData\?\.dealer\?\.listings.length \?\? 0\)/,
  );
  assert.match(source("routes/dealers.$slug.tsx"), /noindex, follow/);
  assert.match(
    source("routes/sitemap[.]xml.ts"),
    /dealerSitemapEntries\(supabaseAdmin, listings\)/,
  );
  assert.match(
    source("routes/sitemap[.]xml.ts"),
    /if \(!dealers\) return unavailable\("dealers"\)/,
  );
  assert.match(source("lib/landing-pages.server.ts"), /id, seller_id, dealer_id, created_at/);
});
