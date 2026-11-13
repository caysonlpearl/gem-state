import test from "node:test";
import assert from "node:assert/strict";
import {
  productForFeed,
  serializeProductFeed,
  FEED_COLUMNS,
  CHATGPT_FEED_CATEGORIES,
} from "../src/lib/chatgpt-product-feed.ts";
import {
  readChatgptProductFeed,
  chatgptFeedResponse,
} from "../src/lib/chatgpt-product-feed.server.ts";

const now = Date.now();
const noDealers = async () => ({ products: [], scanned: 0, excluded: {} });
const seller = { user_id: "seller", display_name: "A public seller", slug: "a-seller" };
const sellers = new Map([[seller.user_id, seller]]);
function listing(extra = {}) {
  return {
    id: "11111111-2222-4333-8444-555555555555",
    seller_id: seller.user_id,
    price_cents: 12345,
    currency: "USD",
    item_condition: "used_excellent",
    status: "active",
    approved_at: new Date(now - 1000).toISOString(),
    expires_at: new Date(now + 86400000).toISOString(),
    is_demo: false,
    products: {
      name: "Canon camera",
      description: 'Camera with a 35mm lens, case and strap.\nSeller says "used".',
      status: "published",
      is_demo: false,
      brands: null,
      categories: { slug: "electronics", name: "Electronics" },
    },
    classified_listing_details: {
      city: "Boise",
      state: "ID",
      item_details: {},
      vehicle_make: null,
    },
    listing_media: [{ position: 0 }],
    ...extra,
  };
}
const product = (row = listing()) => {
  const decision = productForFeed(row, sellers, now);
  assert.ok("product" in decision, JSON.stringify(decision));
  return decision.product;
};
test("exports a current public listing with honest stock, seller, stable media, and discovery-only flags", () => {
  const p = product();
  assert.equal(p.price, "123.45 USD");
  assert.equal(p.brand, "Canon");
  assert.equal(p.condition, "used");
  assert.equal(p.availability, "unknown");
  assert.equal(p.seller_name, seller.display_name);
  assert.match(p.url, /^https:\/\/onbluebird.com\/listings\/canon-camera-boise-/);
  assert.equal(p.image_url, `https://onbluebird.com/media/listings/${listing().id}/0`);
  assert.equal(p.is_eligible_checkout, "false");
  assert.equal(p.is_ads_eligible, "false");
  assert.deepEqual(JSON.parse(p.target_countries), ["US"]);
  assert.ok(!JSON.stringify(p).includes("seller_id"));
});
test("publication gates reject sold, withdrawn, expired, unapproved, demo and draft data", () => {
  for (const extra of [
    { status: "cancelled" },
    { status: "expired" },
    { expires_at: new Date(now).toISOString() },
    { approved_at: null },
    { is_demo: true },
    { products: { ...listing().products, status: "draft" } },
    { products: { ...listing().products, is_demo: true } },
  ]) {
    assert.equal(productForFeed(listing(extra), sellers, now).excluded, "not-public-active");
  }
});
test("includes the surrounding-state marketplace without expanding outside its supported locations", () => {
  for (const state of ["ID", "UT", "OR", "WA"])
    product(
      listing({ classified_listing_details: { ...listing().classified_listing_details, state } }),
    );
  assert.equal(
    productForFeed(
      listing({
        classified_listing_details: { ...listing().classified_listing_details, state: "BC" },
      }),
      sellers,
      now,
    ).excluded,
    "outside-marketplace",
  );
});
test("holds non-product categories and screens prohibited goods inside otherwise allowed categories", () => {
  for (const slug of [
    "firearms",
    "pets",
    "health-beauty",
    "other-real-estate",
    "jobs",
    "services",
    "tickets-events",
    "new-category",
  ]) {
    const p = { ...listing().products, categories: { slug, name: slug } };
    assert.equal(productForFeed(listing({ products: p }), sellers, now).excluded, "category-held");
  }
  for (const description of [
    "Rifle scope and magazines",
    "Nicotine vape kit",
    "Bodybuilding supplement",
    "Pepper spray",
    "Recalled baby seat",
    "Puppies for adoption",
    "Counterfeit bag",
    "Cracked software",
    "Stolen electronics",
    "Non-running motor",
  ]) {
    assert.equal(
      productForFeed(listing({ products: { ...listing().products, description } }), sellers, now)
        .excluded,
      "restricted-or-uncertain-item",
    );
  }
  for (const slug of ["cars-trucks", "auto-parts", "furniture", "electronics", "collectibles"])
    assert.ok(CHATGPT_FEED_CATEGORIES.has(slug));
});
test("never fabricates brands, sellers, prices, conditions or photo URLs", () => {
  for (const name of [
    "A nice camera",
    "Case for Canon camera",
    "Canonical camera",
    "Dock compatible with Apple",
  ]) {
    assert.equal(
      productForFeed(listing({ products: { ...listing().products, name } }), sellers, now).excluded,
      "missing-brand",
    );
  }
  for (const brand of ["Generic", "Unknown", "Unbranded", "Other"])
    assert.equal(
      productForFeed(
        listing({
          products: { ...listing().products, name: "Camera" },
          classified_listing_details: {
            ...listing().classified_listing_details,
            item_details: { brand },
          },
        }),
        sellers,
        now,
      ).excluded,
      "missing-brand",
    );
  assert.equal(productForFeed(listing(), new Map(), now).excluded, "missing-public-seller");
  assert.equal(
    productForFeed(listing({ listing_media: [] }), sellers, now).excluded,
    "missing-photo",
  );
  for (const price_cents of [0, -1, 12.5, NaN])
    assert.equal(
      productForFeed(listing({ price_cents }), sellers, now).excluded,
      "missing-fixed-usd-price",
    );
  assert.equal(
    productForFeed(listing({ item_condition: "not_applicable" }), sellers, now).excluded,
    "unknown-condition",
  );
  assert.equal(
    productForFeed(listing({ currency: "EUR" }), sellers, now).excluded,
    "missing-fixed-usd-price",
  );
});
test("uses supplied product brands and vehicle makes and preserves accurate new/used condition", () => {
  const row = listing({
    item_condition: "new_without_tags",
    products: { ...listing().products, name: "Camera", brands: { name: "My camera maker" } },
  });
  assert.equal(product(row).brand, "My camera maker");
  assert.equal(product(row).condition, "new");
  const vehicle = listing({
    products: {
      ...listing().products,
      name: "2019 Toyota truck",
      categories: { slug: "cars-trucks", name: "Cars & Trucks" },
    },
    classified_listing_details: [
      { ...listing().classified_listing_details, vehicle_make: "Toyota" },
    ],
  });
  assert.equal(product(vehicle).brand, "Toyota");
});
test("CSV is a full deterministic snapshot with quoted commas, quotes, unicode and multiline descriptions", () => {
  const p = product();
  const csv = serializeProductFeed([p]);
  assert.equal(csv.split("\r\n")[0], FEED_COLUMNS.join(","));
  assert.ok(csv.includes('Seller says ""used"".'));
  assert.ok(csv.includes("lens, case"));
  assert.ok(csv.endsWith("\r\n"));
  assert.equal(serializeProductFeed([]), FEED_COLUMNS.join(",") + "\r\n");
});

function database(rows, options = {}) {
  const calls = [];
  return {
    calls,
    from(table) {
      const call = { table, filters: [], columns: "", range: null };
      calls.push(call);
      const q = {
        select(columns) {
          call.columns = columns;
          return q;
        },
        eq(...args) {
          call.filters.push(["eq", ...args]);
          return q;
        },
        not(...args) {
          call.filters.push(["not", ...args]);
          return q;
        },
        gt(...args) {
          call.filters.push(["gt", ...args]);
          return q;
        },
        order() {
          return q;
        },
        range(a, b) {
          call.range = [a, b];
          return q;
        },
        in() {
          return q;
        },
        abortSignal() {
          return q;
        },
        retry() {
          return q;
        },
        then(resolve, reject) {
          const offset = call.range?.[0] ?? 0;
          return Promise.resolve(
            table === "asks"
              ? options.failPage === offset
                ? { data: null, error: { message: "private database error" } }
                : { data: rows.slice(offset, offset + 500), error: null }
              : options.failSellers
                ? { data: null, error: {} }
                : { data: [seller], error: null },
          ).then(resolve, reject);
        },
      };
      return q;
    },
  };
}
test("reads every page and only public seller fields without provider calls or mutation", async () => {
  const db = database(
    Array.from({ length: 501 }, (_, i) =>
      listing({ id: `11111111-2222-4333-8444-${String(i).padStart(12, "0")}` }),
    ),
  );
  const r = await readChatgptProductFeed(db, now, noDealers);
  assert.equal(r.count, 501);
  assert.deepEqual(
    db.calls.filter((c) => c.table === "asks").map((c) => c.range),
    [
      [0, 499],
      [500, 999],
    ],
  );
  assert.ok(db.calls.every((c) => ["asks", "seller_storefronts"].includes(c.table)));
  assert.equal(
    db.calls.find((c) => c.table === "seller_storefronts").columns,
    "user_id,display_name,slug",
  );
  for (const filter of [
    ["eq", "status", "active"],
    ["eq", "is_demo", false],
    ["not", "approved_at", "is", null],
    ["eq", "products.status", "published"],
  ])
    assert.ok(db.calls[0].filters.some((f) => JSON.stringify(f) === JSON.stringify(filter)));
});
test("inventory and seller failures produce a non-cacheable 503, never partial or false empty CSV", async () => {
  const rows = Array.from({ length: 501 }, () => listing());
  for (const db of [
    database(rows, { failPage: 500 }),
    database([listing()], { failSellers: true }),
  ]) {
    const response = await chatgptFeedResponse(db, noDealers);
    assert.equal(response.status, 503);
    assert.equal(response.headers.get("cache-control"), "no-store");
    assert.ok(!(await response.text()).includes("private database error"));
  }
  const response = await chatgptFeedResponse(database([listing()]), noDealers);
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("x-bluebird-feed-items"), "1");
  assert.match(response.headers.get("content-type"), /text\/csv/);
});

test("dealer source failures cannot replace the complete feed with only native products", async () => {
  const response = await chatgptFeedResponse(database([listing()]), async () => {
    throw Error("private dealer error");
  });
  assert.equal(response.status, 503);
  assert.equal(response.headers.get("cache-control"), "no-store");
  assert.ok(!(await response.text()).includes("private dealer error"));
});
