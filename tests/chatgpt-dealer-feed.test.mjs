import test from "node:test";
import assert from "node:assert/strict";
import { publishedFeedVehicle } from "../src/lib/dealer-feed-contract.ts";
import { normalizeMarketCheckListing } from "../src/lib/marketcheck-contract.ts";
import { dealerProductForFeed } from "../src/lib/chatgpt-dealer-products.ts";
import { readChatgptDealerProducts } from "../src/lib/chatgpt-dealer-products.server.ts";
import { chatgptFeedResponse } from "../src/lib/chatgpt-product-feed.server.ts";
const now = Date.now(),
  id = "10000000-0000-4000-8000-000000000001";
const dealer = {
  slug: "test-dealer",
  display_name: "Test Dealer",
  website: "https://dealer.example",
  phone: null,
  address_line1: null,
  city: "Boise",
  state: "ID",
  postal_code: null,
};
const row = {
  id,
  dealer_slug: dealer.slug,
  title: "2026 Subaru Forester",
  description: "All-wheel drive vehicle.",
  price_cents: 3500000,
  vehicle_make: "Subaru",
  vehicle_model: "Forester",
  vehicle_year: 2026,
  condition: "New",
  last_seen_at: new Date(now).toISOString(),
  photos: ["https://images.example/car.jpg"],
};
const vehicle = () => publishedFeedVehicle(row, dealer);
const cached = (extra = {}) =>
  normalizeMarketCheckListing(
    {
      id: "cache-one",
      heading: "2022 Ford F150",
      price: 25000,
      inventory_type: "used",
      last_seen_at: new Date(now).toISOString(),
      vin: "CACHEVIN",
      build: { make: "Ford", model: "F150", year: 2022 },
      dealer: {
        name: "Other Dealer",
        website: "https://other.example",
        city: "Boise",
        state: "ID",
      },
      media: { photo_links: ["https://images.example/ford.jpg"] },
      vdp_url: "https://other.example/vehicle",
      ...extra,
    },
    "dealer",
  );
function db(feed = { dealers: [dealer], vehicles: [row] }, error = null) {
  return {
    rpc(name) {
      assert.equal(name, "read_published_dealer_inventory");
      const q = {
        abortSignal() {
          return q;
        },
        retry() {
          return q;
        },
        then(resolve, reject) {
          return Promise.resolve({ data: feed, error }).then(resolve, reject);
        },
      };
      return q;
    },
  };
}
test("direct and cached dealer offers retain actual make, seller, stable identity and factual descriptions", () => {
  const direct = dealerProductForFeed(
    vehicle(),
    "https://onbluebird.com/dealers/test-dealer",
    now,
  ).product;
  assert.equal(direct.brand, "Subaru");
  assert.equal(direct.seller_name, "Test Dealer");
  assert.equal(direct.condition, "new");
  assert.equal(direct.price, "35000.00 USD");
  assert.equal(direct.url, "https://onbluebird.com/listings/dealerfeed-" + id);
  assert.equal(direct.seller_url, "https://onbluebird.com/dealers/test-dealer");
  assert.equal(direct.availability, "unknown");
  assert.equal(direct.is_ads_eligible, "false");
  const p = dealerProductForFeed(cached(), undefined, now).product;
  assert.equal(p.brand, "Ford");
  assert.equal(p.seller_name, "Other Dealer");
  assert.match(p.description, /Make: Ford/);
  assert.equal(p.condition, "used");
  assert.equal(p.seller_url, "https://other.example/");
});
test("dealer feed holds unknown prices, conditions, brands, stale/ended stock, outside scope and unsafe photos", () => {
  for (const [changes, reason] of [
    [{ price: null }, "missing-fixed-usd-price"],
    [{ price: 1.001 }, "missing-fixed-usd-price"],
    [{ inventoryType: null }, "unknown-condition"],
    [{ build: { ...vehicle().build, make: null } }, "missing-brand"],
    [{ lastSeenAt: new Date(now - 8 * 86400000).toISOString() }, "stale-dealer-inventory"],
    [{ vehicleStatus: "sold" }, "ended-dealer-inventory"],
    [{ availabilityStatus: "out_of_stock" }, "ended-dealer-inventory"],
    [{ location: { ...vehicle().location, state: "CA" } }, "outside-marketplace"],
    [
      {
        media: { photoLinks: ["https://images.example/photo?token=private"], photoLinksCached: [] },
      },
      "missing-photo",
    ],
    [{ sourceKind: "fsbo" }, "not-dealer-inventory"],
  ])
    assert.equal(
      dealerProductForFeed({ ...vehicle(), ...changes }, undefined, now).excluded,
      reason,
    );
});
test("combines public RPC inventory with cached dealers, preferring direct source and deduplicating VINs", async () => {
  const direct = vehicle();
  const duplicate = cached({ vin: direct.vin });
  duplicate.vin = "DIRECTVIN";
  const feed = { dealers: [dealer], vehicles: [{ ...row, vin: "DIRECTVIN" }] };
  const oldSameDealer = cached({ id: "old-dealer-car", vdp_url: "https://dealer.example/old" });
  const result = await readChatgptDealerProducts(db(feed), now, async () => [
    duplicate,
    oldSameDealer,
    cached(),
    cached(),
  ]);
  assert.equal(result.products.length, 2);
  assert.equal(result.products[0].brand, "Subaru");
  assert.equal(result.products[1].brand, "Ford");
});
test("empty or revoked publications remain empty and dealer outages never publish partial replacement feeds", async () => {
  assert.equal(
    (await readChatgptDealerProducts(db({ dealers: [], vehicles: [] }), now, async () => []))
      .products.length,
    0,
  );
  await assert.rejects(() =>
    readChatgptDealerProducts(db(null, { message: "private error" }), now, async () => []),
  );
  await assert.rejects(() =>
    readChatgptDealerProducts(db(), now, async () => {
      throw Error("private provider key");
    }),
  );
  const response = await chatgptFeedResponse(
    {
      from() {
        throw Error("source unavailable");
      },
    },
    async () => {
      throw Error("secret");
    },
  );
  assert.equal(response.status, 503);
  assert.equal(response.headers.get("cache-control"), "no-store");
  assert.ok(!(await response.text()).includes("secret"));
});

test("automotive towing receivers and Gun Metallic paint do not mask actual firearm references", () => {
  const v = vehicle();
  for (const text of [
    "Class IV Trailer Hitch Receiver and brake controller.",
    "Class IV receiver hitch.",
    "Exterior in a stylish Gun Metallic color.",
  ])
    assert.ok(
      dealerProductForFeed({ ...v, extra: { ...v.extra, sellerComments: text } }, undefined, now)
        .product,
    );
  for (const text of [
    "Gun receiver included.",
    "Gun Metallic paint; rifle and ammunition included.",
  ])
    assert.equal(
      dealerProductForFeed({ ...v, extra: { ...v.extra, sellerComments: text } }, undefined, now)
        .excluded,
      "restricted-or-uncertain-item",
    );
});
