import assert from "node:assert/strict";
import { register } from "node:module";
register(new URL("./worker-wasm-test-loader.mjs", import.meta.url));
process.env.GEM_STATE_SUPABASE_URL = "https://home-layout-fixture.invalid";
process.env.GEM_STATE_SUPABASE_PUBLISHABLE_KEY = "sb_publishable_fixture";
process.env.GEM_STATE_SUPABASE_SERVICE_ROLE_KEY = "sb_secret_fixture";
const now = Date.now();
const expiry = new Date(now + 31 * 86400000).toISOString();
const images = ["https://example.com/home-one.jpg", "https://example.com/home-two.jpg"];
const extra = {
  images,
  description: "A complete home description.",
  bedrooms: 4,
  bathrooms: 3,
  squareFeet: 2100,
  yearBuilt: 2005,
  url: "https://www.redfin.com/ID/Rathdrum/137-Main-St/home/123",
  amenities: [
    "Appliances: Gas Range, Washer, Refrigerator",
    "Flooring: Tile, Carpet",
    "Has Attached Garage",
    "Virtual Tour Unbranded (External Link): https://example.com/tour?view=pano",
  ],
  parking: "Parking Features: Paved Parking · Has Attached Garage",
  specialFeatures:
    "Appliances: Gas Range, Washer, Refrigerator, Flooring: Tile, Carpet, Virtual Tour Unbranded (External Link): https://example.com/tour?view=pano",
  schools: ["Example School"],
  priceHistory: [
    { label: "Listed for sale", amount: 425500, date: "2026-08-18" },
    { label: "Price change", amount: 409900, date: "2026-09-18" },
  ],
  taxHistory: [{ date: "2025", amount: 1700, value: 41000 }],
  listedBy: {
    agentName: "Example Agent",
    brokerName: "Example Realty",
    agentPhone: null,
    brokerPhone: null,
  },
};
const homes = ["buy", "rent"].map((mode, i) => ({
  id: `redfin-${123 + i}`,
  provider: "redfin",
  address: `${137 + i} Main St`,
  city: "Rathdrum",
  state: "ID",
  zip: "83858",
  mode,
  priceCents: mode === "buy" ? 40990000 : 240000,
  beds: 4,
  baths: 3,
  sqft: 2100,
  imageUrl: images[0],
  propertyType: "House",
  latitude: 47.8,
  longitude: -116.9,
  sourceUrl: extra.url,
  observedAt: new Date(now).toISOString(),
  listedAt: "2026-09-18",
  isFeatured: false,
}));
let requests = 0;
globalThis.fetch = async (input, init = {}) => {
  const u = new URL(typeof input === "string" ? input : (input.url ?? input.href));
  requests++;
  assert.ok(
    ["home-layout-fixture.invalid", "udxxfuticbxwiehoepeg.supabase.co"].includes(u.hostname),
    "No provider requests permitted",
  );
  assert.equal(init.method ?? "GET", "GET", "Public home views must not write or reserve calls");
  if (u.pathname === "/rest/v1/openwebninja_cache") {
    const key = u.searchParams.get("cache_key") ?? "";
    if (key.includes('"kind":"property"'))
      return Response.json(
        [123, 124].map((id) => ({
          cache_key: JSON.stringify({ v: 4, kind: "property", id: `redfin-${id}` }),
          payload: extra,
          expires_at: expiry,
          ...extra,
        })),
      );
    return Response.json(
      homes.map((home) => ({
        cache_key: JSON.stringify({
          v: 3,
          kind: "area-search",
          area: "north-idaho",
          mode: home.mode,
        }),
        payload: { homes: [home] },
        expires_at: new Date(now + 8 * 86400000).toISOString(),
      })),
    );
  }
  return Response.json([], { headers: { "content-range": "0-0/0" } });
};
const worker = (await import("../.output/server/index.mjs")).default;
for (const [id, rental] of [
  [123, false],
  [124, true],
]) {
  const response = await worker.fetch(
    new Request(`https://onbluebird.com/listings/openwebninja-redfin-${id}`),
    {},
    { waitUntil() {} },
  );
  const html = await response.text();
  assert.equal(response.status, 200, html.slice(0, 200));
  for (const marker of [
    'id="home-overview"',
    'id="home-facts"',
    'id="home-history"',
    'id="home-neighborhood"',
    'href="#home-facts"',
    "Request a tour",
    "Contact agent",
    "Safe. Simple. Trusted.",
    "Example School",
  ])
    assert.ok(html.includes(marker), marker);
  assert.ok(html.includes("Property address map"));
  assert.ok(html.includes("137%20Main%20St") || html.includes("138%20Main%20St"));
  assert.ok(!html.includes("Contact details are on the original listing"));
  assert.ok(!html.includes("Opens the original listing in a new tab"));
  const rendered = html.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, "");
  assert.ok(rendered.includes("View virtual tour"));
  assert.ok(!rendered.includes("Virtual Tour Unbranded (External Link):"));
  assert.ok(!rendered.includes('class="max-w-[65%] text-right font-semibold"'));
  assert.equal(html.includes('id="home-payment"'), !rental);
  assert.equal(html.includes("Price cut:"), !rental);
}
console.log(
  JSON.stringify({
    homeListingLayout: "passed",
    cases: 2,
    providerRequests: 0,
    cacheReads: requests,
  }),
);
