import test from "node:test";
import assert from "node:assert/strict";
import {
  summarizeComparables,
  resolveComparableEvidence,
} from "../src/lib/vehicle-comparables.server.ts";
import { compareComparablePrice } from "../src/lib/vehicle-price-insights.ts";
const input = {
  year: 2017,
  make: "Cadillac",
  model: "Escalade ESV",
  trim: "Platinum Sport Utility 4D",
  miles: 98752,
  state: "ID",
  city: "Boise",
  zip: "83713",
  vin: "1GYS4KKJ5HR123456",
  condition: "used",
  certified: false,
  sellerType: "dealer",
  dealerType: "independent",
  drivetrain: "4wd",
  fuel: "gasoline",
  transmission: "automatic",
  bodyStyle: "suv",
};
const checkedAt = "2026-11-11T19:00:00Z";
const rows = Array.from({ length: 9 }, (_, i) => ({
  key: String(i),
  priceCents: (23000 + i * 500) * 100,
  vehicle: { ...input, vin: null, trim: "Platinum" },
}));
const segment = { checkedAt, rows };
const config = { provider: "vehicles", key: "test-key", lifetimeLimit: 248, monthlyLimit: 250 };
const rawRows = Array.from({ length: 9 }, (_, i) => ({
  vin: "1" + String(i + 1).padStart(16, "0"),
  year: 2017,
  make: "Cadillac",
  model: "Escalade ESV",
  trim: "Platinum",
  miles: 98000,
  price: 23000 + i * 500,
  condition: "used",
  state: "ID",
  is_active: 1,
  vin_valid: 1,
  drivetrain: "4WD",
  fuel: "Gasoline",
  transmission: "Automatic",
  body_style: "SUV",
  title_status: null,
  seller_type: "dealer",
  data_quality: 1,
}));
function dbFixture({ allowed = true } = {}) {
  const cache = new Map(),
    calls = [];
  return {
    cache,
    calls,
    rpc: async (name, args) => {
      calls.push([name, args]);
      return { data: name === "claim_vehicle_price_insight" ? true : { allowed }, error: null };
    },
    from: () => {
      let key;
      return {
        select() {
          return this;
        },
        eq(_field, value) {
          key = value;
          return this;
        },
        maybeSingle: async () => ({ data: cache.get(key) ?? null, error: null }),
        upsert: async (row) => {
          cache.set(row.cache_key, row);
          return { error: null };
        },
      };
    },
  };
}
test("range uses the actual middle 50%, exact sample count and collection time", () => {
  const evidence = summarizeComparables(segment, input, "state", "self");
  assert.equal(evidence.count, 9);
  assert.equal(evidence.lowerCents, 2400000);
  assert.equal(evidence.medianCents, 2500000);
  assert.equal(evidence.upperCents, 2600000);
  assert.equal(evidence.checkedAt, checkedAt);
  assert.equal(evidence.mileageTolerance, 20000);
  assert.equal(evidence.scope, "state");
});
test("exclude the subject, deduplicate VINs, and never count unmatched trim, mileage, condition or drive as comparable", () => {
  for (const patch of [
    { trim: "Luxury" },
    { miles: 150000 },
    { condition: "new" },
    { certified: true },
    { drivetrain: "rwd" },
    { fuel: "diesel" },
    { transmission: "manual" },
    { bodyStyle: "sedan" },
    { year: 2016 },
    { model: "Escalade" },
    { state: "UT" },
  ]) {
    assert.equal(
      summarizeComparables(
        { checkedAt, rows: rows.map((r) => ({ ...r, vehicle: { ...r.vehicle, ...patch } })) },
        input,
        "state",
        null,
      ),
      null,
    );
  }
  const evidence = summarizeComparables(
    { checkedAt, rows: [...rows, rows[0], { key: "self", priceCents: 9999900, vehicle: input }] },
    input,
    "state",
    "self",
  );
  assert.equal(evidence.count, 9);
  assert.equal(evidence.medianCents, 2500000);
  assert.equal(
    summarizeComparables({ ...segment, rows: rows.slice(0, 7) }, input, "state", null),
    null,
  );
});
test("verdict, percentage reference and pointer share the same observed range", () => {
  const evidence = summarizeComparables(segment, input, "state", null);
  const estimate = {
    provider: "vehicles",
    estimateCents: 3000000,
    modelErrorPct: 6,
    updatedAt: checkedAt,
    dataThrough: null,
  };
  const fair = compareComparablePrice(estimate, evidence, 2575000);
  assert.equal(fair.estimateCents, 2500000);
  assert.equal(fair.differenceCents / fair.estimateCents, 0.03);
  assert.equal(fair.comparison, "near");
  assert.equal(compareComparablePrice(estimate, evidence, 2600000).comparison, "near");
  assert.equal(compareComparablePrice(estimate, evidence, 2600001).comparison, "above");
  assert.equal(compareComparablePrice(estimate, evidence, 2399999).comparison, "below");
  assert.equal(compareComparablePrice(estimate, evidence, 2500000).pointerPercent, 50);
  assert.ok(
    Math.abs(compareComparablePrice(estimate, evidence, 2600000).pointerPercent - 100 / 3) < 0.001,
  );
});
test("asymmetric or repeated-price samples keep both quartile boundaries on the fair band", () => {
  const evidence = { ...summarizeComparables(segment, input, "state", null), medianCents: 2400000 };
  const estimate = {
    provider: "vehicles",
    estimateCents: 3000000,
    modelErrorPct: 6,
    updatedAt: checkedAt,
    dataThrough: null,
  };
  assert.ok(
    Math.abs(
      compareComparablePrice(estimate, evidence, evidence.lowerCents).pointerPercent - 200 / 3,
    ) < 0.001,
  );
  assert.ok(
    Math.abs(
      compareComparablePrice(estimate, evidence, evidence.upperCents).pointerPercent - 100 / 3,
    ) < 0.001,
  );
  assert.equal(compareComparablePrice(estimate, evidence, evidence.medianCents).comparison, "near");
});

test("requests are budgeted, authenticated, complete and cached without raw VINs or repeated calls", async () => {
  const db = dbFixture();
  let calls = 0;
  const fetcher = async (url, init) => {
    calls++;
    assert.equal(url.origin, "https://api.vehicles.dev");
    assert.equal(url.pathname, "/v1/vehicles/listings");
    assert.equal(url.searchParams.get("state"), "ID");
    assert.equal(url.searchParams.get("active"), "true");
    assert.equal(url.searchParams.get("year_min"), "2017");
    assert.equal(init.redirect, "manual");
    assert.equal(init.headers.Authorization, "Bearer test-key");
    return Response.json({ source: "vehicles.dev", total: rawRows.length, results: rawRows });
  };
  const result = await resolveComparableEvidence(db, input, config, fetcher, new Date(checkedAt));
  assert.equal(result.count, 9);
  assert.equal(calls, 1);
  assert.equal(db.calls.filter(([name]) => name === "reserve_vehicle_valuation_call").length, 1);
  assert.ok(!JSON.stringify([...db.cache.values()]).includes(rawRows[0].vin));
  await resolveComparableEvidence(db, input, config, fetcher, new Date(checkedAt));
  assert.equal(calls, 1);
});
test("missing unrelated metadata cannot exclude otherwise complete comparable prices", async () => {
  const result = await resolveComparableEvidence(
    dbFixture(),
    input,
    config,
    async (url) => {
      assert.equal(url.searchParams.has("sold"), false);
      assert.equal(url.searchParams.has("min_quality"), false);
      return Response.json({
        source: "vehicles.dev",
        total: rawRows.length,
        results: rawRows.map(({ data_quality, ...row }) => row),
      });
    },
    new Date(checkedAt),
  );
  assert.equal(result.count, 9);
});

test("national fallback is explicit and a partial sorted page cannot manufacture an observed range", async () => {
  let calls = 0;
  const result = await resolveComparableEvidence(
    dbFixture(),
    input,
    config,
    async () => {
      calls++;
      return Response.json({
        source: "vehicles.dev",
        total: calls === 1 ? 0 : 9,
        results: calls === 1 ? [] : rawRows.map((r) => ({ ...r, state: "UT" })),
      });
    },
    new Date(checkedAt),
  );
  assert.equal(calls, 2);
  assert.equal(result.scope, "national");
  assert.equal(result.count, 9);
  const incomplete = await resolveComparableEvidence(
    dbFixture(),
    input,
    config,
    async () => Response.json({ source: "vehicles.dev", total: 501, results: rawRows }),
    new Date(checkedAt),
  );
  assert.equal(incomplete, null);
});
test("caps, missing identity and failures produce no fabricated evidence or extra paid fallback", async () => {
  let requests = 0;
  const result = await resolveComparableEvidence(
    dbFixture({ allowed: false }),
    input,
    config,
    async () => {
      requests++;
      throw Error("must not call");
    },
  );
  assert.equal(requests, 0);
  assert.equal(result, null);
  assert.equal(
    await resolveComparableEvidence(dbFixture(), { ...input, vin: null }, config, async () => {
      requests++;
    }),
    null,
  );
  assert.equal(requests, 0);
  const failure = await resolveComparableEvidence(
    dbFixture(),
    input,
    config,
    async () => new Response(null, { status: 402 }),
    new Date(checkedAt),
  );
  assert.equal(failure, null);
});
