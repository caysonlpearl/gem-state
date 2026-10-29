import test from "node:test";
import assert from "node:assert/strict";
import {
  AVANTLINK_ACCOUNT,
  MERCHANDISE_SCOPES,
  approvedMerchandise,
  merchandiseSearchUrl,
  normalizeMerchandise,
} from "../src/lib/avantlink-contract.ts";
import {
  canIncludeMerchandise,
  merchandiseCard,
  merchandiseCards,
  merchandiseDetail,
} from "../src/lib/avantlink-listings.server.ts";
import { refreshMerchandisePage } from "../src/lib/avantlink.server.ts";

// Shape and field names captured from a real Guns.com ProductSearch response.
const row = {
  lngProductId: "1067506",
  lngDatafeedId: 6417,
  lngMerchantId: "16393",
  strProductSKU: "68721",
  strProductName: "LONG SLEEVE LOGO TEE",
  strBrandName: "Guns.Com",
  dblProductPrice: "28.99",
  dblProductSalePrice: "24.99",
  txtLongDescription: "<p>A comfortable cotton shirt.</p><script>alert(1)</script>",
  txtShortDescription: "Cotton tee",
  strDepartmentName: "Gear",
  strCategoryName: "Apparel",
  strSubCategoryName: "",
  strLargeImage: "https://images.guns.com/prod/shirt.jpg",
  strMediumImage: "https://images.guns.com/prod/shirt.jpg?w=400",
  strThumbnailImage: "https://images.guns.com/prod/shirt.jpg?impolicy=thumb",
  strBuyURL:
    "https://www.avantlink.com/click.php?tt=pl&ti=6417&pw=448337&mi=16393&pt=3&pri=1067506",
  strProductURL: "https://www.guns.com/gear/p/shirt?c=12",
  txtVariants: "<variant>Size M</variant>",
  strActionCommission: "5.50%",
  strProductContentWidgetScript: "<script src='http://untrusted.test'></script>",
};
const timestamps = {
  first_seen_at: "2026-10-29T12:00:00Z",
  source_refreshed_at: "2026-10-29T13:00:00Z",
};

function database(handler) {
  const calls = [];
  const db = {
    calls,
    async rpc(name, args) {
      calls.push({ rpc: name, args });
      return handler({ rpc: name, args });
    },
    from(table) {
      const call = { table, ops: [] };
      const chain = new Proxy(
        {},
        {
          get(_, method) {
            if (method === "then")
              return (resolve, reject) => {
                calls.push(structuredClone(call));
                return Promise.resolve(handler(call)).then(resolve, reject);
              };
            return (...args) => {
              call.ops.push({ method, args });
              return chain;
            };
          },
        },
      );
      return chain;
    },
  };
  return db;
}

test("normalizes real field names, exact cents, complete descriptions, options and one photo", () => {
  const p = normalizeMerchandise(row);
  assert.ok(p);
  assert.equal(p.priceCents, 2499);
  assert.equal(p.retailPriceCents, 2899);
  assert.equal(p.description, "A comfortable cotton shirt.");
  assert.equal(p.variants, "Size M");
  assert.deepEqual(p.images, [row.strLargeImage]);
  assert.equal(p.sku, "68721");
  assert.equal(p.location, null);
  assert.equal(p.raw.strActionCommission, "5.50%");
  assert.equal(p.raw.strProductContentWidgetScript, undefined);
  const card = merchandiseCard(p, timestamps);
  assert.equal(card.categorySlug, "apparel-accessories");
  assert.equal(card.state, "");
  assert.equal(card.city, "");
  assert.equal(card.createdAt, timestamps.first_seen_at);
  assert.equal(card.externalMerchandise.refreshedAt, timestamps.source_refreshed_at);
  assert.equal(card.raw, undefined);
});

test("vetoes unsupported categories and miscategorized weapons/components", () => {
  for (const department of [
    "Handguns",
    "Rifles",
    "Shotguns",
    "Ammo",
    "Gun Parts",
    "Magazines",
    "Silencers",
    "Silencer Accessories",
    "Unknown",
  ]) {
    assert.equal(normalizeMerchandise({ ...row, strDepartmentName: department }), null);
  }
  for (const title of [
    "UPPER RECEIVER",
    "TRIGGER ASSEMBLY",
    "RIFLE SCOPE",
    "CARTRIDGES",
    "COMBAT KNIFE",
    "FOLDING STOCK",
    "9mm HANDGUN",
  ]) {
    assert.equal(normalizeMerchandise({ ...row, strProductName: title }), null);
  }
  assert.equal(
    normalizeMerchandise({ ...row, strProductURL: "https://www.guns.com/firearms/p/incorrect" }),
    null,
  );
  assert.equal(approvedMerchandise({ ...row, strProductName: "RIFLE LOGO TEE" }), true);
  assert.equal(normalizeMerchandise(row, ["Gear", "Hats"]), null);
});

test("rejects spoofed merchants, affiliate links and unsafe destinations", () => {
  assert.equal(normalizeMerchandise({ ...row, lngMerchantId: "999" }), null);
  assert.equal(normalizeMerchandise({ ...row, lngDatafeedId: "999" }), null);
  for (const url of [
    "javascript:alert(1)",
    row.strBuyURL.replace("www.avantlink.com", "avantlink.com.evil.test"),
    row.strBuyURL.replace("448337", "999"),
    row.strBuyURL + "&url=https://evil.test",
    row.strBuyURL + "&pri=1",
    row.strBuyURL.replace("https://", "http://"),
  ]) {
    assert.equal(normalizeMerchandise({ ...row, strBuyURL: url }), null);
  }
  assert.equal(
    normalizeMerchandise({
      ...row,
      strLargeImage: "https://evil.test/shirt.jpg",
      strMediumImage: "javascript:x",
      strThumbnailImage: "",
    }).images.length,
    0,
  );
});

test("retains distinct images, rejects invalid money, and never invents discounts", () => {
  assert.equal(
    normalizeMerchandise({ ...row, strMediumImage: "https://images.guns.com/prod/back.jpg" }).images
      .length,
    2,
  );
  assert.equal(
    normalizeMerchandise({ ...row, dblProductPrice: "bogus", dblProductSalePrice: "-1" }),
    null,
  );
  assert.equal(normalizeMerchandise({ ...row, dblProductSalePrice: "35" }).priceCents, 2899);
});

test("every upstream request is pinned to the account and a positive merchandise category", () => {
  for (const scope of MERCHANDISE_SCOPES) {
    const p = merchandiseSearchUrl(scope, 1000).searchParams;
    assert.equal(p.get("website_id"), AVANTLINK_ACCOUNT.websiteId);
    assert.equal(p.get("datafeed_ids"), "6417");
    assert.equal(p.get("search_department"), scope[0]);
    assert.equal(p.get("search_category"), scope[1]);
    assert.equal(p.get("search_results_base"), "1000");
    assert.equal(p.get("search_results_count"), "1000");
    assert.equal(p.has("auth_key"), false);
  }
  assert.throws(() => merchandiseSearchUrl(["Rifles", "Semi Auto"]));
  assert.throws(() => merchandiseSearchUrl(MERCHANDISE_SCOPES[0], 10000));
});

test("strict geographic and other unsupported filters never fabricate a local match", () => {
  assert.equal(
    canIncludeMerchandise({ category: "outdoor-sporting", hasPhotos: true, q: "bag" }),
    true,
  );
  for (const filter of [
    { state: "ID" },
    { state: "UT" },
    { state: "CA" },
    { city: "Boise" },
    { radiusMiles: 50 },
    { latitude: 43 },
    { longitude: -116 },
    { region: "Treasure Valley" },
    { postalCode: "83702" },
    { fulfillment: "local_pickup" },
    { condition: "new_with_tags" },
    { sellerSlug: "someone" },
    { category: "firearms" },
    { jobPayMin: 0 },
    { petSpecies: "dog" },
    { postedWithin: "day" },
    { firearmBrand: "anything" },
  ]) {
    assert.equal(canIncludeMerchandise(filter), false, JSON.stringify(filter));
  }
});

test("a cache-only listing read exposes complete data and honors moderation without provider calls", async () => {
  const p = normalizeMerchandise(row);
  const db = database((call) => ({
    data: call.table === "avantlink_merchandise" ? { payload: p, ...timestamps } : [],
    error: null,
  }));
  const detail = await merchandiseDetail("avantlink-1067506", db);
  assert.equal(detail.description, p.description);
  assert.equal(detail.images.length, 1);
  assert.equal(detail.seller, null);
  assert.equal(detail.externalMerchandise.buyUrl, row.strBuyURL);
  assert.equal(
    db.calls.some((c) => c.rpc),
    false,
  );
  const removed = database((c) => ({
    data: c.table === "partner_job_reports" ? [{ id: "report" }] : { payload: p, ...timestamps },
    error: null,
  }));
  assert.equal(await merchandiseDetail("avantlink-1067506", removed), null);
  const bad = database((c) => ({
    data:
      c.table === "partner_job_reports"
        ? []
        : { payload: { raw: { ...row, strDepartmentName: "Rifles" } }, ...timestamps },
    error: null,
  }));
  assert.equal(await merchandiseDetail("avantlink-1067506", bad), null);
});

test("browse pages past Supabase row caps and excludes reviewed inventory", async () => {
  const p = normalizeMerchandise(row);
  const db = database((call) => {
    if (call.table === "partner_job_reports")
      return { data: [{ listing_id: "avantlink-1067506" }], error: null };
    const range = call.ops.filter((o) => o.method === "range").at(-1).args;
    return {
      data:
        range[0] === 0
          ? Array.from({ length: 500 }, () => ({ payload: p, ...timestamps }))
          : [{ payload: p, ...timestamps }],
      count: 501,
      error: null,
    };
  });
  const result = await merchandiseCards({ category: "apparel-accessories" }, db);
  assert.equal(result.cards.length, 0);
  assert.equal(result.limited, false);
  assert.equal(db.calls.filter((c) => c.table === "avantlink_merchandise").length, 2);
  const blocked = await merchandiseCards(
    { state: "ID" },
    {
      from() {
        throw new Error("must not read");
      },
    },
  );
  assert.deepEqual(blocked, { cards: [], limited: false });
});

test("no provider call occurs when the DB budget or concurrent lease denies it", async () => {
  for (const reason of ["daily_budget", "hourly_budget", "fresh_or_in_progress"]) {
    const db = database(() => ({ data: { allowed: false, reason }, error: null }));
    const result = await refreshMerchandisePage(MERCHANDISE_SCOPES[0], db, () => {
      throw new Error("provider must not run");
    });
    assert.equal(result.skipped, true);
    assert.equal(result.reason, reason);
  }
});

test("successful refresh deduplicates products and retires absent rows only after a complete scan", async () => {
  const db = database((c) =>
    c.rpc
      ? { data: { allowed: true, offset: 0, generation: timestamps.first_seen_at }, error: null }
      : { error: null },
  );
  const result = await refreshMerchandisePage(MERCHANDISE_SCOPES[0], db, async () =>
    Response.json([row, row, { ...row, strDepartmentName: "Rifles" }]),
  );
  assert.equal(result.received, 3);
  assert.equal(result.accepted, 1);
  assert.equal(result.complete, true);
  const write = db.calls.find((c) => c.ops?.some((o) => o.method === "upsert"));
  assert.equal(write.ops.find((o) => o.method === "upsert").args[0].length, 1);
  assert.equal(
    db.calls.some((c) =>
      c.ops?.some((o) => o.method === "lt" && o.args[1] === timestamps.first_seen_at),
    ),
    true,
  );
});

test("malformed/provider failures preserve previous cache and a full page advances pagination", async () => {
  for (const body of [{ error: "bad" }, Array(1001).fill(row)]) {
    const db = database((c) =>
      c.rpc
        ? { data: { allowed: true, offset: 0, generation: timestamps.first_seen_at }, error: null }
        : { error: null },
    );
    const r = await refreshMerchandisePage(MERCHANDISE_SCOPES[0], db, async () =>
      Response.json(body),
    );
    assert.ok(r.error);
    assert.equal(
      db.calls.some((c) => c.table === "avantlink_merchandise"),
      false,
    );
  }
  const db = database((c) =>
    c.rpc
      ? { data: { allowed: true, offset: 0, generation: timestamps.first_seen_at }, error: null }
      : { error: null },
  );
  const result = await refreshMerchandisePage(MERCHANDISE_SCOPES[0], db, async () =>
    Response.json(Array(1000).fill(row)),
  );
  assert.equal(result.complete, false);
  assert.equal(
    db.calls.some((c) => c.ops?.some((o) => o.method === "lt")),
    false,
  );
  assert.equal(
    db.calls
      .findLast((c) => c.table === "avantlink_merchandise_scopes")
      .ops.find((o) => o.method === "update").args[0].next_offset,
    1000,
  );
});
