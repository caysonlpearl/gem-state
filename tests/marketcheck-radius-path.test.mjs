import test from "node:test";
import assert from "node:assert/strict";

import { marketCheckCards } from "../src/lib/marketcheck.server.ts";

const supportedStates = ["ID", "UT", "OR", "WA"];

function providerListing(state, kind, start, index) {
  const cities = { ID: "Boise", UT: "Salt Lake City", OR: "Portland", WA: "Seattle" };
  const id = `${state}-${kind}-${start}-${index}`;
  const city = cities[state];
  return {
    id,
    vin: `TEST-${id}`,
    heading: `2024 Toyota Camry ${id}`,
    price: 20000,
    miles: 1000,
    seller_type: kind === "dealer" ? "dealer" : "private",
    inventory_type: "used",
    vdp_url: `https://seller.example/${id}`,
    car_location: { city, state, zip: "83702" },
    ...(kind === "dealer" ? { dealer: { name: `${city} Dealer`, city, state } } : {}),
    media: { photo_links: [`https://images.example/${id}.jpg`] },
    build: {
      year: 2024,
      make: "Toyota",
      model: "Camry",
      trim: "LE",
      body_type: "Sedan",
      transmission: "Automatic",
      drivetrain: "FWD",
      fuel_type: "Gasoline",
    },
  };
}

test("radius browse fetches supported-state caches within page/budget ceilings, then filters by distance", async () => {
  const envNames = [
    "GEM_STATE_SUPABASE_URL",
    "SUPABASE_URL",
    "GEM_STATE_SUPABASE_SERVICE_ROLE_KEY",
    "SUPABASE_SERVICE_ROLE_KEY",
    "MARKETCHECK_API_KEY",
    "MARKETCHECK_MONTHLY_CALL_LIMIT",
  ];
  const previousEnv = Object.fromEntries(envNames.map((name) => [name, process.env[name]]));
  const originalFetch = globalThis.fetch;
  const providerCalls = [];
  const reservations = [];
  let responseMode = "page-ceilings";

  process.env.GEM_STATE_SUPABASE_URL = "https://supabase.mock.test";
  process.env.SUPABASE_URL = "";
  process.env.GEM_STATE_SUPABASE_SERVICE_ROLE_KEY = "test-service-role-key";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "";
  process.env.MARKETCHECK_API_KEY = "test-marketcheck-key";
  delete process.env.MARKETCHECK_MONTHLY_CALL_LIMIT;

  globalThis.fetch = async (input, init = {}) => {
    const url = new URL(typeof input === "string" ? input : input.url);
    const method = (init.method ?? "GET").toUpperCase();

    if (url.hostname === "supabase.mock.test") {
      if (url.pathname.endsWith("/rpc/reserve_marketcheck_call")) {
        const body = JSON.parse(init.body);
        reservations.push(body);
        return Response.json({ allowed: true });
      }
      if (url.pathname.endsWith("/marketcheck_cache") && method === "GET") return Response.json([]);
      if (url.pathname.endsWith("/marketcheck_cache") && method === "POST")
        return new Response(null, { status: 201 });
      throw new Error(`Unexpected mocked database request: ${method} ${url.pathname}`);
    }

    if (url.hostname !== "api.marketcheck.com")
      throw new Error(`Unexpected network destination: ${url.hostname}`);

    const state = url.searchParams.get("state");
    const start = Number(url.searchParams.get("start"));
    const kind = url.pathname.includes("/fsbo/") ? "fsbo" : "dealer";
    providerCalls.push({ state, start, kind });
    assert.ok(supportedStates.includes(state), `unexpected state fetch: ${state}`);

    if (responseMode === "page-ceilings") {
      return Response.json({
        num_found: 1000,
        listings: Array.from({ length: 50 }, (_, index) =>
          providerListing(state, kind, start, index),
        ),
      });
    }

    return Response.json({
      num_found: 1,
      listings: [providerListing(state, kind, start, 0)],
    });
  };

  try {
    const radiusCards = await marketCheckCards({
      group: "motors",
      state: "ID",
      city: "Boise",
      radiusMiles: 350,
    });

    assert.deepEqual(new Set(providerCalls.map((call) => call.state)), new Set(supportedStates));
    assert.equal(providerCalls.length, 22);
    assert.equal(reservations.length, 22);
    assert.ok(reservations.every((entry) => entry.p_monthly_limit === 450));

    const startsByStateAndKind = new Map();
    for (const call of providerCalls) {
      const key = `${call.state}:${call.kind}`;
      startsByStateAndKind.set(key, [...(startsByStateAndKind.get(key) ?? []), call.start]);
    }
    assert.deepEqual(startsByStateAndKind.get("ID:dealer"), [0, 50, 100, 150, 200, 250]);
    assert.deepEqual(startsByStateAndKind.get("ID:fsbo"), [0, 50, 100, 150]);
    for (const state of ["UT", "OR", "WA"]) {
      assert.deepEqual(startsByStateAndKind.get(`${state}:dealer`), [0, 50]);
      assert.deepEqual(startsByStateAndKind.get(`${state}:fsbo`), [0, 50]);
    }

    assert.ok(radiusCards.length > 0);
    assert.ok(radiusCards.every((card) => card.state !== "WA"));
    assert.ok(radiusCards.some((card) => card.state === "ID"));
    assert.ok(radiusCards.some((card) => card.state === "UT"));
    assert.ok(radiusCards.some((card) => card.state === "OR"));

    providerCalls.length = 0;
    reservations.length = 0;
    responseMode = "single-page";
    const stateOnlyCards = await marketCheckCards({ group: "motors", state: "Washington" });
    assert.deepEqual(
      providerCalls.map((call) => `${call.state}:${call.kind}`),
      ["WA:dealer", "WA:fsbo"],
    );
    assert.equal(reservations.length, 2);
    assert.ok(stateOnlyCards.every((card) => card.state === "WA"));

    providerCalls.length = 0;
    reservations.length = 0;
    await marketCheckCards({
      group: "motors",
      state: "OR",
      city: "Unmapped Town, OR",
      radiusMiles: 25,
    });
    assert.deepEqual(providerCalls, []);
    assert.deepEqual(reservations, []);
  } finally {
    globalThis.fetch = originalFetch;
    for (const name of envNames) {
      if (previousEnv[name] === undefined) delete process.env[name];
      else process.env[name] = previousEnv[name];
    }
  }
});
