import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import ts from "typescript";
import { withCatalogReadDeadline } from "../src/lib/catalog-read-deadline.ts";

const source = readFileSync(
  new URL("../src/routes/media.listings.$listingId.$photo.ts", import.meta.url),
  "utf8",
);
const script = ts.transpileModule(source, {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
}).outputText;
const id = "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee";
const date = (days) => new Date(Date.now() + days * 86400000).toISOString();
function fixture({
  row,
  error = null,
  signFailure = false,
  signMissing = false,
  stalled = false,
} = {}) {
  const state = { reads: 0, filters: [], signs: [], signal: null, retry: null, columns: null };
  const record =
    row === undefined
      ? {
          status: "active",
          expires_at: date(2),
          sold_at: null,
          listing_media: [
            { storage_path: "seller/second.jpg", position: 1 },
            { storage_path: "seller/first.jpg", position: 0 },
          ],
        }
      : row;
  const db = {
    from(table) {
      assert.equal(table, "asks");
      state.reads++;
      const q = {
        select(columns) {
          state.columns = columns;
          return q;
        },
        abortSignal(signal) {
          state.signal = signal;
          return q;
        },
        retry(value) {
          state.retry = value;
          return q;
        },
        maybeSingle() {
          if (stalled)
            return new Promise((_resolve, reject) =>
              state.signal.addEventListener(
                "abort",
                () => reject(new Error("Offline interrupted SELECT")),
                { once: true },
              ),
            );
          return Promise.resolve({ data: record, error });
        },
      };
      for (const name of ["eq", "in", "not"])
        q[name] = (...args) => {
          state.filters.push([name, ...args]);
          return q;
        };
      return q;
    },
  };
  const exports = {};
  vm.runInNewContext(script, {
    exports,
    require(name) {
      if (name === "@tanstack/react-router") return { createFileRoute: () => (v) => v };
      if (name === "@/integrations/supabase/client.server") return { supabaseAdmin: db };
      if (name === "@/lib/catalog-read-deadline") return { withCatalogReadDeadline };
      if (name === "@/lib/classifieds.functions") return { ENDED_LISTING_RETENTION_DAYS: 60 };
      if (name === "@/lib/photo-storage-access")
        return {
          getPhotoStorageModule: async () => ({
            signPrivatePhotoUrls: async (bucket, paths) => {
              state.signs.push({ bucket, paths });
              if (signFailure) throw new Error("Offline signing detail must stay private");
              return signMissing
                ? new Map()
                : new Map(paths.map((path) => [path, "https://storage.invalid/" + path]));
            },
          }),
        };
      throw Error("Unexpected import " + name);
    },
    Response,
    console: { error() {} },
    Date,
    Number,
  });
  return {
    state,
    render: (listingId = id, photo = "0") =>
      exports.Route.server.handlers.GET({ params: { listingId, photo } }),
  };
}
test("malformed stable photo identifiers and invalid indexes perform zero source reads", async () => {
  const f = fixture();
  for (const [key, index] of [
    ["------------------------------------", "0"],
    ["not-an-id", "0"],
    [id, "-1"],
    [id, "20"],
    [id, "1.5"],
  ]) {
    const r = await f.render(key, index);
    assert.equal(r.status, 404);
    assert.equal(r.headers.get("Cache-Control"), "no-store");
  }
  assert.equal(f.state.reads, 0);
  assert.equal(f.state.signs.length, 0);
});
test("active photo redirects preserve order and all public visibility predicates with one bounded read", async () => {
  const f = fixture();
  const r = await f.render(id, "1");
  assert.equal(r.status, 302);
  assert.equal(r.headers.get("location"), "https://storage.invalid/seller/second.jpg");
  assert.equal(r.headers.get("Cache-Control"), "public, max-age=600");
  assert.equal(f.state.reads, 1);
  assert.equal(f.state.retry, false);
  assert.ok(f.state.signal instanceof AbortSignal);
  assert.match(f.state.columns, /sold_at/);
  for (const filter of [
    ["eq", "id", id],
    ["eq", "is_demo", false],
    ["not", "approved_at", "is", null],
    ["eq", "products.status", "published"],
  ])
    assert.ok(f.state.filters.some((v) => JSON.stringify(v) === JSON.stringify(filter)));
  assert.deepEqual(JSON.parse(JSON.stringify(f.state.filters.find((v) => v[0] === "in"))), [
    "in",
    "status",
    ["active", "expired", "cancelled"],
  ]);
});
test("genuine missing rows/photos and removed or old archives remain 404 without signing", async () => {
  for (const row of [
    null,
    { status: "active", expires_at: date(2), listing_media: [] },
    { status: "cancelled", expires_at: date(2), sold_at: null },
    { status: "expired", expires_at: date(-61), sold_at: null },
    { status: "cancelled", expires_at: date(2), sold_at: date(-61) },
  ]) {
    const f = fixture({ row });
    assert.equal((await f.render()).status, 404);
    assert.equal(f.state.signs.length, 0);
    assert.equal(f.state.reads, 1);
  }
});
test("recent sold and expired photos remain readable without a second database query", async () => {
  for (const changes of [
    { status: "cancelled", expires_at: date(2), sold_at: date(-2) },
    { status: "expired", expires_at: date(-2), sold_at: null },
  ]) {
    const f = fixture({
      row: { ...changes, listing_media: [{ storage_path: "seller/first.jpg", position: 0 }] },
    });
    assert.equal((await f.render()).status, 302);
    assert.equal(f.state.reads, 1);
  }
});
test("source and signing failures stay temporary and uncacheable without leaking signing details", async () => {
  for (const options of [
    { error: { message: "Offline database failure" } },
    { signFailure: true },
    { signMissing: true },
  ]) {
    const f = fixture(options);
    const r = await f.render();
    assert.equal(r.status, 503);
    assert.equal(r.headers.get("Retry-After"), "60");
    assert.equal(r.headers.get("Cache-Control"), "no-store");
    assert.equal((await r.text()).includes("Offline"), false);
    assert.equal(f.state.reads, 1);
  }
});
test("a stalled stable-photo SELECT aborts once under the real eight-second deadline", async () => {
  const f = fixture({ stalled: true });
  const t = performance.now();
  const r = await f.render();
  assert.equal(r.status, 503);
  assert.ok(performance.now() - t < 12000);
  assert.equal(f.state.reads, 1);
  assert.equal(f.state.retry, false);
  assert.equal(f.state.signal.aborted, true);
  assert.equal(f.state.signs.length, 0);
});
