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
  dealer_id: "20000000-0000-4000-8000-000000000001",
  owner_user_id: "30000000-0000-4000-8000-000000000001",
  logo_url: "https://images.example/dealer-logo.png",
  email: "sales@dealer.example",
  inbox_enabled: true,
};
const vehicle = {
  id,
  dealer_slug: dealer.slug,
  title: "2026 Subaru Forester Fixture",
  description: "Authorized dealer description.",
  price_cents: 3500000,
  msrp: 39000,
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
            dealers: [
              { ...dealer, ...(mode === "no-email" ? { email: null, inbox_enabled: false } : {}) },
            ],
            vehicles:
              mode === "paging"
                ? Array.from({ length: 49 }, (_, i) => ({
                    ...vehicle,
                    id: `10000000-0000-4000-8000-${String(i + 1).padStart(12, "0")}`,
                    title: `Page fixture vehicle ${i + 1}`,
                  }))
                : [
                    {
                      ...vehicle,
                      price_cents: ["unpriced", "empty"].includes(mode)
                        ? null
                        : vehicle.price_cents,
                      photos: ["no-photos", "empty"].includes(mode) ? [] : vehicle.photos,
                    },
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
  assert.ok(html.includes(dealer.logo_url));
  assert.ok(html.includes(dealer.email));
  assert.ok(html.includes("Contact dealership"));
  assert.ok(html.includes('aria-label="Message dealership"'));
  assert.ok(html.includes('aria-label="Vehicle listing summary"'));
  assert.ok(html.includes(">Fixture Subaru</a>"));
  assert.ok(html.includes("$39,000") && html.includes("$4,000"));
  assert.ok(html.includes('aria-label="Verified dealership"'));
  assert.ok(!html.includes("Reach the seller through the original listing"));
  assert.ok(html.includes(vehicle.source_url));
  assert.ok(html.includes(vehicle.photos[1]));
  assert.ok(!html.includes("Inventory provided with permission by"));
  assert.ok(!html.includes("Vehicle listing data provided by MarketCheck"));
  assert.ok(!html.includes(vehicle.private_extra));
  assert.ok(!html.includes("sb_secret_fixture"));
  const legacyDetail = "/listings/2026-subaru-forester-fixture-twin-falls-dealerfeed-" + id;
  r = await request(legacyDetail);
  assert.equal(
    r.status,
    301,
    "older readable dealer links redirect instead of showing unavailable",
  );
  assert.equal(new URL(r.headers.get("Location"), "https://onbluebird.com").pathname, detail);
  r = await request("/dealers/" + dealer.slug);
  html = await r.text();
  assert.equal(r.status, 200);
  assert.ok(html.includes(dealer.display_name));
  assert.ok(html.includes(dealer.logo_url));
  assert.ok(html.includes(dealer.email));
  assert.ok(
    !html.includes("dealer-message-trigger"),
    "storefront keeps only the Contact dealership entry point",
  );
  assert.ok(!html.includes("Your local dealership"));
  assert.ok(html.includes("Twin Falls, Idaho"));
  assert.ok(html.includes(vehicle.title));
  assert.ok(html.includes('aria-label="Verified dealership"'));
  assert.ok(html.includes('href="tel:2085550100"'));
  assert.ok(html.includes("maps/search/?api=1"));
  assert.ok(html.includes(dealer.postal_code));
  assert.ok(html.includes('href="#dealer-inventory"'));
  mode = "no-email";
  r = await request("/dealers/" + dealer.slug);
  html = await r.text();
  assert.equal(r.status, 200);
  assert.ok(!html.includes("mailto:" + dealer.email));
  assert.ok(!html.includes("Email dealership"));
  assert.ok(!html.includes("Sign in to message dealership"));
  assert.ok(html.includes("Call dealership") && html.includes("Get directions"));
  mode = "paging";
  r = await request("/dealers/" + dealer.slug + "?page=2");
  html = await r.text();
  assert.equal(r.status, 200);
  assert.ok(html.includes("Page fixture vehicle 25") && html.includes("Page fixture vehicle 48"));
  assert.ok(!html.includes("Page fixture vehicle 1<"));
  assert.ok(html.includes('aria-label="Dealership inventory pages"'));
  mode = "active";
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
  r = await request(legacyDetail);
  assert.equal(r.status, 404, "legacy links cannot bypass revoked inventory permission");
  r = await request("/dealers/" + dealer.slug);
  assert.equal(r.status, 404);
  mode = "unpriced";
  r = await request(detail);
  html = await r.text();
  assert.equal(r.status, 200);
  assert.ok(html.includes("Contact For Price"));
  assert.ok(!html.includes("Estimated payment"));
  assert.ok(!html.includes('"price":"0.00"'));
  assert.ok(!html.includes("$0.00"));
  assert.ok(html.includes("Contact dealership"));
  r = await request("/dealers/" + dealer.slug);
  assert.ok((await r.text()).includes("Contact For Price"));
  mode = "no-photos";
  r = await request(detail);
  html = await r.text();
  assert.equal(r.status, 200);
  assert.ok(html.includes("$35,000"));
  mode = "empty";
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
        "branded storefront and dealership inbox",
        "scoped browse",
        "public photos",
        "revoked permission",
        "photo-only contact pricing, price-only listings and empty exclusion",
        "source outage",
      ],
      externalTraffic: 0,
    }),
  );
} finally {
  globalThis.fetch = originalFetch;
  console.error = originalError;
}
