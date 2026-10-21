import test from "node:test";
import assert from "node:assert/strict";
import { createClient } from "@supabase/supabase-js";
import { withCatalogReadDeadline, CatalogReadTimeoutError } from "../src/lib/catalog-read-deadline.ts";
import { shortCache } from "../src/lib/short-cache.server.ts";

function client(fetch) {
  return createClient("https://catalog.mock.test", "mock-key", { auth: { persistSession: false }, global: { fetch } });
}

test("read deadline aborts a stalled SELECT once and rejects instead of returning empty success", async () => {
  let calls = 0;
  const db = client(async (_url, init) => {
    calls++;
    return new Promise((_resolve, reject) => {
      init.signal.addEventListener("abort", () => reject(init.signal.reason), { once: true });
    });
  });
  await assert.rejects(withCatalogReadDeadline(db.from("catalog").select("id"), 10), CatalogReadTimeoutError);
  assert.equal(calls, 1, "SDK must not multiply the expired read");
});

test("read deadline remains active after headers while the response body stalls", async () => {
  let calls = 0;
  const db = client(async (_url, init) => {
    calls++;
    const body = new ReadableStream({ start(controller) {
      controller.enqueue(new TextEncoder().encode("["));
      init.signal.addEventListener("abort", () => controller.error(init.signal.reason), { once: true });
    } });
    return new Response(body, { headers: { "content-type": "application/json" } });
  });
  await assert.rejects(withCatalogReadDeadline(db.from("catalog").select("id"), 10), CatalogReadTimeoutError);
  assert.equal(calls, 1);
});

test("successful empty and populated reads retain their exact results", async () => {
  for (const rows of [[], [{ id: "real-row" }]]) {
    const db = client(async () => Response.json(rows));
    const result = await withCatalogReadDeadline(db.from("catalog").select("id"), 1000);
    assert.deepEqual(result.data, rows);
    assert.equal(result.error, null);
  }
});

test("a deadline failure is evicted from shortCache and a retry can load real rows", async () => {
  let calls = 0;
  const db = client(async (_url, init) => {
    calls++;
    if (calls === 1) return new Promise((_resolve, reject) => init.signal.addEventListener("abort", () => reject(init.signal.reason), { once: true }));
    return Response.json([{ id: "recovered" }]);
  });
  const load = () => withCatalogReadDeadline(db.from("catalog").select("id"), 10);
  await assert.rejects(shortCache("deadline-regression", 60000, load), CatalogReadTimeoutError);
  const recovered = await shortCache("deadline-regression", 60000, load);
  assert.deepEqual(recovered.data, [{ id: "recovered" }]);
  assert.equal(calls, 2);
});

test("successful read clears its deadline and preserves ordinary database errors", async () => {
  let signal;
  const db = client(async (_url, init) => {
    signal = init.signal;
    return Response.json({ code: "TEST", message: "ordinary error" }, { status: 400 });
  });
  const result = await withCatalogReadDeadline(db.from("catalog").select("id"), 10);
  assert.equal(result.error.code, "TEST");
  await new Promise((resolve) => setTimeout(resolve, 20));
  assert.equal(signal.aborted, false);
});
