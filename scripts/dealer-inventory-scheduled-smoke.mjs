// Exercise the compiled production cron route. All network calls are fixtures.
import assert from "node:assert/strict";
import { register } from "node:module";
register(new URL("./worker-wasm-test-loader.mjs", import.meta.url));
process.env.GEM_STATE_SUPABASE_URL = "https://inventory-db-fixture.invalid";
process.env.GEM_STATE_SUPABASE_SERVICE_ROLE_KEY = "sb_secret_fixture_only";
process.env.CRON_SECRET = "inventory-cron-fixture";

const sourceId = "10000000-0000-0000-0000-000000000001";
const runId = "10000000-0000-0000-0000-000000000002";
const feedUrl = "https://inventory-feed-fixture.invalid/inventory.xml?key=private-fixture";
const vehicle = (id, price) =>
  `<item><id>${id}</id><dealerid>2592</dealerid><stocknumber>S${id}</stocknumber><year>2026</year><make>Subaru</make><model>Forester</model><price>${price}</price><city>Twin Falls</city><state>ID</state><zipcode>83301</zipcode><miles>5</miles><image0>https://images.example.org/${id}.jpg</image0></item>`;
const xml = `<inventory>${vehicle("one", 35786)}${vehicle("two", 0)}</inventory>`;
let mode = "success",
  reconciled = null,
  released = false,
  requests = 0;
const originalFetch = globalThis.fetch;
globalThis.fetch = async (input, init = {}) => {
  requests++;
  const url = new URL(typeof input === "string" ? input : (input.url ?? input.href));
  if (url.hostname === "inventory-feed-fixture.invalid") {
    assert.match(new Headers(init.headers).get("User-Agent"), /^BluebirdMarketplace\//);
    if (mode === "html")
      return new Response("<!doctype html><html><title>Checking your browser</title></html>");
    return new Response(mode === "truncated" ? xml.slice(0, -5) : xml);
  }
  assert.equal(url.hostname, "inventory-db-fixture.invalid", "no external traffic is permitted");
  const body = init.body ? JSON.parse(init.body) : null;
  if (url.pathname.endsWith("/dealer_inventory_sources")) {
    if (mode === "query-failure")
      return Response.json({ message: `Fixture read failed at ${feedUrl}` }, { status: 400 });
    assert.match(url.searchParams.get("status"), /active,error/);
    return Response.json([
      {
        id: sourceId,
        dealer_id: null,
        file_format: "xml",
        mapping_profile: { __provider: "motive", __dealer_id: "2592" },
        minimum_row_count: 1,
        status: "error",
        feed_url: feedUrl,
        schedule: "hourly",
        last_success_at: null,
      },
    ]);
  }
  if (url.pathname.endsWith("/claim_dealer_inventory_source")) return Response.json(runId);
  if (url.pathname.endsWith("/release_dealer_inventory_source")) {
    released = true;
    return Response.json(null);
  }
  if (url.pathname.endsWith("/dealer_inventory_sync_runs"))
    return Response.json(init.method === "POST" ? { id: runId } : null);
  if (url.pathname.endsWith("/reconcile_dealer_inventory_records")) {
    reconciled = body._records;
    return Response.json({
      createdCount: reconciled.length,
      updatedCount: 0,
      unchangedCount: 0,
      staleCount: 0,
    });
  }
  if (
    url.pathname.endsWith("/touch_dealer_inventory_source") ||
    url.pathname.endsWith("/dealer_audit_events")
  )
    return Response.json(null);
  throw Error(`Unexpected fixture request: ${url.pathname}`);
};

try {
  const worker = (await import(new URL("../.output/server/index.mjs", import.meta.url))).default;
  const invoke = (token = "inventory-cron-fixture") =>
    worker.fetch(
      new Request("https://onbluebird.com/api/internal/dealer-inventory", {
        method: "POST",
        headers: { authorization: `Bearer ${token}` },
      }),
      {},
      { waitUntil() {} },
    );
  assert.equal((await invoke("wrong-fixture")).status, 401);
  assert.equal(requests, 0, "unauthenticated jobs cannot read private feeds");
  const response = await invoke();
  assert.equal(response.status, 200, await response.clone().text());
  assert.equal((await response.json())[0].status, "completed");
  assert.equal(reconciled.length, 2);
  assert.equal(reconciled[0].source_record_key, "one");
  assert.equal(reconciled[0].postal_code, "83301");
  assert.equal(reconciled[0].media.length, 1);
  assert.equal(reconciled[1].price_cents, null);
  assert.equal(reconciled[1].inventory_status, "invalid");
  assert.ok(released);
  mode = "truncated";
  reconciled = null;
  released = false;
  const rejected = await invoke();
  assert.equal(rejected.status, 200, await rejected.clone().text());
  assert.equal((await rejected.json())[0].status, "failed");
  assert.equal(reconciled, null, "an incomplete feed cannot reach reconciliation");
  assert.ok(released);
  mode = "html";
  reconciled = null;
  const blocked = await invoke();
  const blockedResult = await blocked.json();
  assert.equal(blockedResult[0].status, "failed");
  assert.match(blockedResult[0].message, /browser-check page/);
  assert.equal(reconciled, null);
  mode = "query-failure";
  const failed = await invoke();
  assert.equal(failed.status, 500);
  const detail = await failed.json();
  assert.match(detail.reason, /Fixture read failed/);
  assert.ok(!JSON.stringify(detail).includes("private-fixture"));
  console.log(
    JSON.stringify({
      productionScheduledInventoryRoute: "passed",
      externalRequests: 0,
      cases: [
        "authentication",
        "Motive import",
        "unpriced vehicles",
        "truncated snapshot",
        "lease release",
        "redacted runtime failure",
      ],
    }),
  );
} finally {
  globalThis.fetch = originalFetch;
}
