import assert from "node:assert/strict";
import { register } from "node:module";
register(new URL("./worker-wasm-test-loader.mjs", import.meta.url));
process.env.GEM_STATE_SUPABASE_URL = "https://listing-layout-fixture.invalid";
process.env.GEM_STATE_SUPABASE_PUBLISHABLE_KEY = "sb_publishable_fixture";
process.env.GEM_STATE_SUPABASE_SERVICE_ROLE_KEY = "sb_secret_fixture";
const raw = {
  lngProductId: "1067506",
  lngDatafeedId: 6417,
  lngMerchantId: "16393",
  strProductSKU: "SKU1",
  strProductName: "Example cotton shirt",
  strBrandName: "Guns.Com",
  dblProductPrice: "28.99",
  dblProductSalePrice: "24.99",
  txtLongDescription: "A comfortable cotton shirt.",
  strDepartmentName: "Gear",
  strCategoryName: "Apparel",
  strSubCategoryName: "",
  strLargeImage: "https://images.guns.com/prod/shirt.jpg",
  strBuyURL:
    "https://www.avantlink.com/click.php?tt=pl&ti=6417&pw=448337&mi=16393&pt=3&pri=1067506",
  strProductURL: "https://www.guns.com/gear/p/shirt",
  txtVariants: "Size M",
};
const now = new Date().toISOString();
const payload = { raw };
const rows = Array.from({ length: 30 }, (_, i) => ({
  payload: {
    raw: {
      ...raw,
      lngProductId: String(1067506 + i),
      strProductName: `Example shirt ${i + 1}`,
      strBuyURL: raw.strBuyURL.replace("1067506", String(1067506 + i)),
    },
  },
  first_seen_at: now,
  source_refreshed_at: now,
}));
const fetches = [];
globalThis.fetch = async (input, init = {}) => {
  const u = new URL(typeof input === "string" ? input : (input.url ?? input.href));
  fetches.push(u);
  assert.ok(
    ["listing-layout-fixture.invalid", "udxxfuticbxwiehoepeg.supabase.co"].includes(u.hostname),
    "provider calls forbidden",
  );
  if (u.pathname === "/rest/v1/avantlink_merchandise")
    return Response.json(
      u.searchParams.has("id") ? { payload, first_seen_at: now, source_refreshed_at: now } : rows,
      { headers: { "content-range": "0-29/30" } },
    );
  return Response.json([], { headers: { "content-range": "0-0/0" } });
};
const worker = (await import("../.output/server/index.mjs")).default;
const request = (path) =>
  worker.fetch(new Request("https://onbluebird.com" + path), {}, { waitUntil() {} });
let r = await request("/listings/avantlink-1067506"),
  html = await r.text();
assert.equal(r.status, 200);
assert.ok(html.includes("Listed by"));
assert.ok(html.includes('aria-label="Listed by Guns.com"'));
assert.ok(html.includes("/retailers/guns-com"));
assert.ok(html.includes("tel:+18665824867"));
assert.ok(html.includes("https://www.guns.com/contact"));
assert.ok(html.includes('aria-label="Listing price"'));
assert.ok(!html.includes("Online retailer"));
assert.ok(!html.includes("Price checked"));
assert.ok(!html.includes("Choose available options"));
assert.ok(!html.includes('aria-label="Verified dealership"'));
assert.ok(html.includes('rel="sponsored nofollow noopener noreferrer"'));
assert.ok(html.includes("may earn a commission"));
r = await request("/retailers/guns-com?page=2");
html = await r.text();
assert.equal(r.status, 200);
assert.ok(html.includes("Example shirt 25"));
assert.ok(!html.includes("Example shirt 1<"));
assert.ok(html.replace(/<!--.*?-->/g, "").includes("Page 2 of 2"));
assert.ok(!html.includes('aria-label="Verified dealership"'));
r = await request("/retailers/not-a-retailer");
assert.equal(r.status, 404);
console.log(
  JSON.stringify({
    listingLayoutSsr: "passed",
    providerCalls: 0,
    cases: [
      "seller identity and actual contacts",
      "no retailer/check-time/verification copy",
      "affiliate destination and disclosure",
      "paginated public seller profile",
    ],
  }),
);
