import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import {
  valuationInput,
  compareVehiclePrice,
  canonicalValuationModel,
} from "../src/lib/vehicle-price-insights.ts";
import {
  valuationProviders,
  providerRequest,
  normalizeVehicleEstimate,
} from "../src/lib/vehicle-valuation-providers.server.ts";
import {
  resolveVehicleEstimate,
  listingPriceInsight,
  valuationCacheKey,
} from "../src/lib/vehicle-price-insights.server.ts";

const input = {
  year: 2021,
  make: "Toyota",
  model: "Camry",
  trim: "SE",
  miles: 45000,
  state: "ID",
  city: "Twin Falls",
  zip: "83301",
  vin: "4T1G11AK5MU123456",
  condition: "used",
  certified: false,
  sellerType: "private",
  dealerType: null,
};
const listing = {
  categorySlug: "cars-trucks",
  priceCents: 2500000,
  state: "ID",
  city: "Twin Falls",
  condition: "used",
  vehicle: {
    year: 2021,
    make: "Toyota",
    model: "Camry",
    trim: "SE",
    mileage: 45000,
    vin: input.vin,
    titleStatus: "clean",
  },
};
const vehicleBody = {
  coverage: { status: "in_domain" },
  meta: { dataThrough: new Date().toISOString() },
  currency: "USD",
  source: "vehicles.dev",
  estimateUsd: 26096,
  medianApePct: 6,
  inputs: { ...input, year: 2021 },
};
const configs = [
  { provider: "vehicles", key: "test-vehicles", lifetimeLimit: 250, monthlyLimit: 250 },
  { provider: "vinaudit", key: "test-vinaudit", lifetimeLimit: 100, monthlyLimit: 100 },
];

test("private vehicle insights are standard; missing mileage, ended, demo, branded-title and nonvehicle listings never spend quota", () => {
  assert.equal(valuationInput(listing).sellerType, "private");
  assert.equal(valuationInput({ ...listing, condition: "new_with_tags" }).condition, "new");
  assert.equal(valuationInput({ ...listing, dealer: { slug: "example" } }).sellerType, "dealer");
  for (const patch of [
    { vehicle: { ...listing.vehicle, mileage: null } },
    { vehicle: { ...listing.vehicle, titleStatus: "salvage" } },
    { categorySlug: "motorcycles" },
    { ended: {} },
    { isMock: true },
    { priceCents: 0 },
  ])
    assert.equal(valuationInput({ ...listing, ...patch }), null);
  assert.equal(
    valuationInput({ ...listing, vehicle: { ...listing.vehicle, model: "CROSSTREK" } }).model,
    "Crosstrek",
  );
});
test("free trial backups require an explicit production entitlement and budgets cannot silently become unlimited", () => {
  const env = { VEHICLES_API_KEY: "a", VINAUDIT_API_KEY: "b", MARKETCHECK_API_KEY: "c" };
  assert.deepEqual(
    valuationProviders((k) => env[k] ?? "").map((p) => p.provider),
    ["vehicles"],
  );
  env.VINAUDIT_VALUATION_PRODUCTION_ALLOWED = "true";
  env.MARKETCHECK_VALUATION_PRODUCTION_ALLOWED = "true";
  assert.deepEqual(
    valuationProviders((k) => env[k] ?? "").map((p) => p.provider),
    ["vehicles", "vinaudit", "marketcheck"],
  );
  assert.equal(valuationProviders((k) => env[k] ?? "")[2].lifetimeLimit, 0);
});
test("provider contracts use documented authentication and only supported retail predictions", () => {
  const r = providerRequest(configs[0], input);
  assert.equal(r.url.origin, "https://api.vehicles.dev");
  assert.equal(r.headers.Authorization, "Bearer test-vehicles");
  assert.equal(r.url.searchParams.get("miles"), "45000");
  assert.equal(providerRequest(configs[1], { ...input, vin: null }), null);
  const mc = { ...configs[0], provider: "marketcheck" };
  assert.equal(providerRequest(mc, input), null);
  assert.equal(
    providerRequest(mc, {
      ...input,
      dealerType: "franchise",
      sellerType: "dealer",
    }).url.searchParams.get("dealer_type"),
    "franchise",
  );
  assert.equal(providerRequest(mc, { ...input, dealerType: "franchise", condition: "new" }), null);
});
test("reject malformed, mismatched or weak estimates; model error widens comparison threshold without inventing a confidence range", () => {
  const estimate = normalizeVehicleEstimate("vehicles", vehicleBody, input);
  assert.equal(estimate.estimateCents, 2609600);
  for (const patch of [
    { currency: "CAD" },
    { estimateUsd: -1 },
    { medianApePct: 50 },
    { inputs: { ...vehicleBody.inputs, miles: 30000 } },
    { inputs: { ...vehicleBody.inputs, model: "camry" } },
  ])
    assert.equal(normalizeVehicleEstimate("vehicles", { ...vehicleBody, ...patch }, input), null);
  assert.equal(compareVehiclePrice(estimate, 2500000).comparison, "near");
  assert.equal(compareVehiclePrice(estimate, 2000000).comparison, "below");
  assert.equal(compareVehiclePrice(estimate, 3500000).comparison, "above");
});

test("rejection diagnostics identify the failed check without vehicle identifiers", () => {
  for (const [patch, reason] of [
    [{ coverage: { status: "out_of_domain" } }, "coverage_out_of_domain"],
    [{ meta: {} }, "source_date_missing_or_invalid"],
    [{ inputs: { ...vehicleBody.inputs, miles: 1 } }, "input_mileage_mismatch"],
    [{ medianApePct: 40 }, "model_error_invalid"],
  ]) {
    const diagnostics = {};
    assert.equal(
      normalizeVehicleEstimate(
        "vehicles",
        { ...vehicleBody, ...patch },
        input,
        new Date(),
        diagnostics,
      ),
      null,
    );
    assert.equal(diagnostics.reason, reason);
    assert.ok(!JSON.stringify(diagnostics).includes(input.vin));
  }
});
test("eligible unavailable estimates have a visible status; opt-outs and ineligible items remain hidden", async () => {
  const unavailable = await listingPriceInsight(listing, fakeDb({ missing: true }));
  assert.deepEqual(unavailable, { status: "unavailable" });
  assert.equal(
    await listingPriceInsight({ ...listing, categorySlug: "furniture" }, fakeDb()),
    null,
  );
  assert.equal(
    await listingPriceInsight(
      { ...listing, dealer: { slug: "example" } },
      fakeDb({ enabled: false }),
    ),
    null,
  );
});

test("gauge pointer and status share the same neutral band and clamp extreme prices", () => {
  const estimate = normalizeVehicleEstimate("vehicles", vehicleBody, input);
  const near = compareVehiclePrice(estimate, estimate.estimateCents);
  assert.equal(near.pointerPercent, 50);
  assert.equal(near.tolerancePct, 12);
  const tolerance = estimate.estimateCents * 0.12;
  for (const sign of [-1, 1]) {
    const at = compareVehiclePrice(estimate, estimate.estimateCents + sign * tolerance);
    assert.equal(at.comparison, "near");
    assert.ok(Math.abs(at.pointerPercent - (sign < 0 ? 200 / 3 : 100 / 3)) < 0.001);
    const outside = compareVehiclePrice(estimate, estimate.estimateCents + sign * (tolerance + 1));
    assert.equal(outside.comparison, sign < 0 ? "below" : "above");
  }
  assert.equal(compareVehiclePrice(estimate, 1).pointerPercent, 97);
  assert.equal(compareVehiclePrice(estimate, estimate.estimateCents * 10).pointerPercent, 3);
});

test("specific listing features are normalized, sent, echoed, and separated in the cache key", async () => {
  const detailed = valuationInput({
    ...listing,
    vehiclePricing: { msrpCents: 3500000 },
    vehicle: {
      ...listing.vehicle,
      model: "EDGE",
      drivetrain: "All Wheel Drive",
      fuelType: "Gasoline",
      transmission: "Auto, 8-Speed",
      bodyStyle: "Sport Utility",
      exteriorColor: "Magnetic Gray Metallic",
    },
  });
  assert.equal(detailed.model, "Edge");
  assert.equal(canonicalValuationModel("WRX"), "WRX");
  assert.equal(canonicalValuationModel("Escalade ESV"), "Escalade ESV");
  assert.equal(canonicalValuationModel("CR-V"), "CR-V");
  assert.equal(canonicalValuationModel("RAV4"), "RAV4");
  assert.equal(detailed.color, "gray");
  const request = providerRequest(configs[0], detailed);
  const features = {
    drivetrain: "awd",
    fuel: "gasoline",
    transmission: "automatic",
    body_style: "suv",
    color: "gray",
    base_msrp: "35000",
  };
  for (const [key, value] of Object.entries(features))
    assert.equal(request.url.searchParams.get(key), value);
  const body = { ...vehicleBody, inputs: { ...detailed, ...features, base_msrp: 35000 } };
  assert.deepEqual(normalizeVehicleEstimate("vehicles", body, detailed).providerInputs, [
    "year",
    "make",
    "model",
    "miles",
    "state",
    "condition",
    "trim",
    ...Object.keys(features),
  ]);
  for (const field of Object.keys(features)) {
    const ignored = { ...body.inputs };
    delete ignored[field];
    const partial = normalizeVehicleEstimate("vehicles", { ...body, inputs: ignored }, detailed);
    assert.ok(partial);
    assert.ok(!partial.providerInputs.includes(field));
    assert.deepEqual(partial.unconfirmedInputs, [field]);
    assert.equal(
      normalizeVehicleEstimate(
        "vehicles",
        { ...body, inputs: { ...body.inputs, [field]: "wrong" } },
        detailed,
      ),
      null,
    );
  }
  assert.equal(
    normalizeVehicleEstimate(
      "vehicles",
      { ...body, inputs: { ...body.inputs, condition: "new" } },
      detailed,
    ),
    null,
  );
  assert.notEqual(
    await valuationCacheKey(detailed),
    await valuationCacheKey({ ...detailed, drivetrain: "fwd" }),
  );
  const certified = { ...detailed, certified: true };
  assert.equal(providerRequest(configs[0], certified).url.searchParams.get("condition"), "cpo");
  assert.equal(normalizeVehicleEstimate("vehicles", body, certified), null);
});

function fakeDb({
  cache = null,
  allowed = true,
  enabled = true,
  claim = true,
  missing = false,
} = {}) {
  const calls = [],
    writes = [];
  return {
    calls,
    writes,
    rpc: async (name, args) => {
      calls.push([name, args]);
      return { data: name === "claim_vehicle_price_insight" ? claim : { allowed }, error: null };
    },
    from: (table) => ({
      select() {
        return this;
      },
      eq() {
        return this;
      },
      maybeSingle: async () => ({
        data: table === "dealer_profiles" ? { price_insights_enabled: enabled } : cache,
        error: missing ? {} : null,
      }),
      upsert: async (data) => {
        writes.push([table, data]);
        return { error: null };
      },
    }),
  };
}
test("cached estimates are reused and missing storage or duplicate leases never call providers", async () => {
  for (const options of [
    { missing: true },
    { claim: false },
    {
      cache: {
        payload: normalizeVehicleEstimate("vehicles", vehicleBody, input),
        expires_at: "2099-01-01",
      },
    },
  ]) {
    let requests = 0;
    await resolveVehicleEstimate(fakeDb(options), input, configs, async () => {
      requests++;
      throw Error();
    });
    assert.equal(requests, 0);
  }
  assert.equal(await valuationCacheKey(input), await valuationCacheKey({ ...input }));
  assert.notEqual(
    await valuationCacheKey(input),
    await valuationCacheKey({ ...input, miles: 50000 }),
  );
});
test("hosted fetch uses manual redirects and never forwards a provider key to a redirect target", async () => {
  let requests = 0;
  const result = await resolveVehicleEstimate(fakeDb(), input, [configs[0]], async (_url, init) => {
    requests++;
    assert.equal(init.redirect, "manual", "edge runtime rejects the error redirect mode");
    return new Response(null, {
      status: 302,
      headers: { Location: "https://untrusted.example/collect" },
    });
  });
  assert.equal(result, null);
  assert.equal(requests, 1);
});
test("quota or failures use the next authorized backup; the first success stops the chain", async () => {
  const db = fakeDb();
  const urls = [];
  const result = await resolveVehicleEstimate(db, input, configs, async (url) => {
    urls.push(url.origin);
    return urls.length === 1
      ? new Response(null, { status: 429 })
      : Response.json({
          success: true,
          vin: input.vin,
          count: 100,
          certainty: 95,
          mileage: 45000,
          type: "retail",
          prices: { average: 25500 },
        });
  });
  assert.equal(result.provider, "vinaudit");
  assert.deepEqual(urls, ["https://api.vehicles.dev", "https://marketvalue.vinaudit.com"]);
  assert.ok(db.writes.some(([table]) => table === "vehicle_valuation_provider_state"));
  let requests = 0;
  await resolveVehicleEstimate(fakeDb(), input, configs, async () => {
    requests++;
    return Response.json(vehicleBody);
  });
  assert.equal(requests, 1);
  requests = 0;
  await resolveVehicleEstimate(fakeDb({ allowed: false }), input, configs, async () => {
    requests++;
    throw Error();
  });
  assert.equal(requests, 0);
});
test("dealer opt-out is checked before every cache read and private sellers do not inherit a dealer setting", async () => {
  const db = fakeDb({ enabled: false });
  assert.equal(await listingPriceInsight({ ...listing, dealer: { slug: "example" } }, db), null);
  assert.equal(db.calls.length, 0);
});

test("real PostgreSQL guards lifetime/monthly limits, leases and cache privacy across callers", async () => {
  const db = new PGlite();
  try {
    await db.exec(
      "create role anon;create role authenticated;create role service_role; create table public.dealer_profiles(id uuid primary key);",
    );
    await db.exec(
      await readFile(
        new URL(
          "../supabase/migrations/20261111013000_vehicle_price_insights.sql",
          import.meta.url,
        ),
        "utf8",
      ),
    );
    assert.equal(
      (await db.query("select price_insights_enabled from dealer_profiles where false")).rows
        .length,
      0,
    );
    await db.exec("insert into dealer_profiles(id) values(gen_random_uuid())");
    assert.equal(
      (await db.query("select price_insights_enabled from dealer_profiles")).rows[0]
        .price_insights_enabled,
      true,
    );
    assert.equal(
      (await db.query("select claim_vehicle_price_insight('one') as ok")).rows[0].ok,
      true,
    );
    assert.equal(
      (await db.query("select claim_vehicle_price_insight('one') as ok")).rows[0].ok,
      false,
    );
    for (let i = 0; i < 2; i++)
      assert.equal(
        (
          await db.query("select reserve_vehicle_valuation_call('vehicles',$1,2,2) as r", [
            String(i),
          ])
        ).rows[0].r.allowed,
        true,
      );
    assert.equal(
      (await db.query("select reserve_vehicle_valuation_call('vehicles','third',2,2) as r")).rows[0]
        .r.reason,
      "lifetime_limit",
    );
    await db.exec("update vehicle_valuation_requests set created_at=now()-interval '35 days'");
    assert.equal(
      (await db.query("select reserve_vehicle_valuation_call('vehicles','next-month',2,2) as r"))
        .rows[0].r.reason,
      "lifetime_limit",
      "one-time allowance never resets monthly",
    );
    await db.exec("set role anon");
    await assert.rejects(
      db.query("select * from vehicle_price_insight_cache"),
      /permission denied/,
    );
    await assert.rejects(
      db.query("select reserve_vehicle_valuation_call('vehicles','bad',250,250)"),
      /permission denied/,
    );
  } finally {
    await db.close();
  }
});
