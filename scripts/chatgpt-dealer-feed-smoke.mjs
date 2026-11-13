import assert from "node:assert/strict";
import { register } from "node:module";
register(new URL("./worker-wasm-test-loader.mjs", import.meta.url));
process.env.GEM_STATE_SUPABASE_URL = "https://chatgpt-feed-fixture.invalid";
process.env.GEM_STATE_SUPABASE_PUBLISHABLE_KEY = "sb_publishable_fixture";
process.env.GEM_STATE_SUPABASE_SERVICE_ROLE_KEY = "sb_secret_fixture";
process.env.MARKETCHECK_API_KEY = "fixture-never-send-to-provider";
const now = Date.now(),
  id = "10000000-0000-4000-8000-000000000001";
const dealer = {
  slug: "fixture-subaru",
  display_name: "Fixture Subaru",
  website: "https://dealer.example",
  city: "Twin Falls",
  state: "ID",
  postal_code: "83301",
  phone: null,
  address_line1: null,
};
const direct = {
  id,
  dealer_slug: dealer.slug,
  title: "2026 Subaru Forester",
  price_cents: 3500000,
  vehicle_make: "Subaru",
  vehicle_model: "Forester",
  vehicle_year: 2026,
  condition: "New",
  last_seen_at: new Date(now).toISOString(),
  photos: ["https://images.example/subaru.jpg"],
};
const cached = (id, extra = {}) => ({
  id,
  heading: "2022 Ford F150",
  price: 25000,
  inventory_type: "used",
  last_seen_at: new Date(now).toISOString(),
  build: { make: "Ford", model: "F150", year: 2022 },
  dealer: { name: "Fixture Ford", website: "https://ford.example", city: "Boise", state: "ID" },
  vdp_url: "https://ford.example/inventory/car",
  media: { photo_links: ["https://images.example/ford.jpg"] },
  private_key: "never-export-private-field",
  ...extra,
});
let mode = "active";
let calls = 0;
globalThis.fetch = async (input, init = {}) => {
  const u = new URL(typeof input === "string" ? input : (input.url ?? input.href));
  calls++;
  assert.ok(
    ["chatgpt-feed-fixture.invalid", "udxxfuticbxwiehoepeg.supabase.co"].includes(u.hostname),
    "No provider/photo requests or external traffic",
  );
  assert.ok(!/insert|update|delete/i.test(u.pathname));
  if (u.pathname === "/rest/v1/rpc/read_published_dealer_inventory")
    return mode === "direct-offline"
      ? Response.json({ message: "private failure" }, { status: 503 })
      : Response.json(
          mode === "revoked"
            ? { dealers: [], vehicles: [] }
            : { dealers: [dealer], vehicles: [direct] },
        );
  if (u.pathname === "/rest/v1/marketcheck_cache") {
    if (mode === "cache-offline")
      return Response.json({ message: "private cache failure" }, { status: 503 });
    if (!(u.searchParams.get("cache_key") ?? "").includes("ID")) return Response.json([]);
    return Response.json([
      {
        expires_at: new Date(now + 86400000).toISOString(),
        payload: {
          listings: [
            cached("ford-one"),
            cached("reported"),
            cached("old-direct", {
              vdp_url: "https://dealer.example/old",
              dealer: {
                name: dealer.display_name,
                website: dealer.website,
                city: "Twin Falls",
                state: "ID",
              },
            }),
            cached("stale", { last_seen_at: new Date(now - 8 * 86400000).toISOString() }),
            cached("unpriced", { price: null }),
          ],
        },
      },
    ]);
  }
  if (u.pathname === "/rest/v1/partner_vehicle_reports")
    return Response.json([{ listing_id: "marketcheck-dealer-reported" }]);
  if (u.pathname === "/rest/v1/dealer_feed_publications")
    return Response.json([{ website: dealer.website }]);
  return Response.json([], { headers: { "content-range": "0-0/0" } });
};
const worker = (await import("../.output/server/index.mjs")).default;
const request = () =>
  worker.fetch(new Request("https://onbluebird.com/feeds/chatgpt.csv"), {}, { waitUntil() {} });
let r = await request(),
  csv = await r.text();
assert.equal(r.status, 200);
assert.equal(r.headers.get("x-bluebird-feed-version"), "2026-11-13-v3");
assert.equal(r.headers.get("x-bluebird-feed-items"), "2");
assert.ok(csv.includes("bluebird-dealerfeed-" + id));
assert.ok(csv.includes("bluebird-marketcheck-dealer-ford-one"));
assert.ok(csv.includes("Fixture Subaru"));
assert.ok(csv.includes("Fixture Ford"));
assert.ok(csv.includes("Make: Ford"));
for (const forbidden of [
  "never-export-private-field",
  "sb_secret_fixture",
  "fixture-never-send-to-provider",
  "marketcheck-dealer-reported",
  "marketcheck-dealer-old-direct",
  "marketcheck-dealer-stale",
  "marketcheck-dealer-unpriced",
])
  assert.ok(!csv.includes(forbidden), forbidden);
mode = "revoked";
r = await request();
csv = await r.text();
assert.equal(r.status, 200);
assert.equal(r.headers.get("x-bluebird-feed-items"), "1");
assert.ok(!csv.includes("old-direct"));
assert.ok(!csv.includes("bluebird-dealerfeed-"));
for (mode of ["cache-offline", "direct-offline"]) {
  r = await request();
  csv = await r.text();
  assert.equal(r.status, 503);
  assert.equal(r.headers.get("cache-control"), "no-store");
  assert.ok(!csv.includes("private"));
}
console.log(
  JSON.stringify({
    chatgptDealerFeed: "passed",
    externalRequests: 0,
    readOnlyDatabaseCalls: calls,
    cases: [
      "direct and cached inventory",
      "factual descriptions and seller attribution",
      "reviewed reports",
      "revoked source cannot resurface in cache",
      "stale and unpriced exclusions",
      "private field omission",
      "failures never publish partial feeds",
    ],
  }),
);
