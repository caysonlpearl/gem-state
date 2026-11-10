import assert from "node:assert/strict";
import { register } from "node:module";
register(new URL("./worker-wasm-test-loader.mjs", import.meta.url));
process.env.GEM_STATE_SUPABASE_URL = "https://dealer-db-fixture.invalid";
process.env.GEM_STATE_SUPABASE_PUBLISHABLE_KEY = "sb_publishable_fixture";
process.env.GEM_STATE_SUPABASE_SERVICE_ROLE_KEY = "sb_secret_fixture";
const id = "10000000-0000-4000-8000-000000000001";
const dealer = {
  slug: "fixture-subaru",
  display_name: "Fixture Subaru",
  website: "https://dealer.example",
  phone: "2085550100",
  address_line1: "1 Main St",
  city: "Twin Falls",
  state: "ID",
  postal_code: "83301",
};
const vehicle = {
  id,
  dealer_slug: dealer.slug,
  title: "2026 Subaru Forester Fixture",
  description: "Authorized dealer description.",
  price_cents: 3500000,
  vehicle_year: 2026,
  vehicle_make: "Subaru",
  vehicle_model: "Forester",
  stock_number: "S123",
  vehicle_mileage: 10,
  condition: "New",
  city: "Twin Falls",
  state: "ID",
  postal_code: "83301",
  source_url: "https://dealer.example/inventory/forester",
  first_seen_at: new Date().toISOString(),
  last_seen_at: new Date().toISOString(),
  photos: ["https://images.example/one.jpg", "https://images.example/two.jpg"],
  private_extra: "never-public-private-feed-key",
};
let mode = "active";
const calls = [];
const originalFetch = globalThis.fetch,
  originalError = console.error;
globalThis.fetch = async (input, init = {}) => {
  const url = new URL(typeof input === "string" ? input : (input.url ?? input.href));
  assert.ok(
    ["dealer-db-fixture.invalid", "udxxfuticbxwiehoepeg.supabase.co"].includes(url.hostname),
    "no external traffic",
  );
  calls.push({ path: url.pathname, method: init.method ?? "GET" });
  if (url.pathname === "/rest/v1/rpc/read_published_dealer_inventory") {
    if (mode === "offline") return Response.json({ message: "Fixture outage" }, { status: 503 });
    return Response.json(
      mode === "revoked"
        ? { dealers: [], vehicles: [] }
        : {
            dealers: [dealer],
            vehicles: [
              { ...vehicle, price_cents: mode === "unpriced" ? null : vehicle.price_cents },
            ],
          },
    );
  }
  return Response.json([], { headers: { "content-range": "0-0/0" } });
};
console.error = () => {};
try {
  const worker = (await import(new URL("../.output/server/index.mjs", import.meta.url))).default;
  const request = async (path) =>
    worker.fetch(new Request("https://onbluebird.com" + path), {}, { waitUntil() {} });
  const detail = "/listings/dealerfeed-" + id;
  let r = await request(detail);
  let html = await r.text();
  assert.equal(r.status, 200);
  assert.ok(html.includes(vehicle.title));
  assert.ok(html.includes(vehicle.description));
  assert.ok(html.includes(dealer.phone));
  assert.ok(html.includes(vehicle.source_url));
  assert.ok(html.includes(vehicle.photos[1]));
  assert.ok(html.includes("Inventory provided with permission by"));
  assert.ok(!html.includes("Vehicle listing data provided by MarketCheck"));
  assert.ok(!html.includes(vehicle.private_extra));
  assert.ok(!html.includes("sb_secret_fixture"));
  r = await request("/dealers/" + dealer.slug);
  html = await r.text();
  assert.equal(r.status, 200);
  assert.ok(html.includes(dealer.display_name));
  assert.ok(html.includes(vehicle.title));
  r = await request(
    "/browse?dealerSlug=" + dealer.slug + "&category=cars-trucks&vehicleMode=results",
  );
  html = await r.text();
  assert.equal(r.status, 200);
  assert.ok(html.includes(vehicle.title));
  r = await request("/media/listings/dealerfeed-" + id + "/0");
  assert.equal(r.status, 302);
  assert.equal(r.headers.get("Location"), vehicle.photos[0]);
  mode = "revoked";
  r = await request(detail);
  assert.equal(r.status, 404);
  r = await request("/dealers/" + dealer.slug);
  assert.equal(r.status, 404);
  mode = "unpriced";
  r = await request(detail);
  assert.equal(r.status, 404);
  mode = "offline";
  r = await request(detail);
  assert.equal(r.status, 500);
  assert.ok(
    calls.every(
      (c) => c.method === "GET" || c.path === "/rest/v1/rpc/read_published_dealer_inventory",
    ),
    "public browsing never writes inventory or makes provider calls",
  );
  console.log(
    JSON.stringify({
      productionDealerFeedPublication: "passed",
      cases: [
        "authorized detail and dealer contact",
        "storefront",
        "scoped browse",
        "public photos",
        "revoked permission",
        "unpriced exclusion",
        "source outage",
      ],
      externalTraffic: 0,
    }),
  );
} finally {
  globalThis.fetch = originalFetch;
  console.error = originalError;
}
