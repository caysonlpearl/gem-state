import test from "node:test";
import assert from "node:assert/strict";

import { marketCheckCards, prepareHomeMarketCheckCache } from "../src/lib/marketcheck.server.ts";
import { normalizeMarketCheckSearch } from "../src/lib/marketcheck-contract.ts";

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

async function withMockMarketCheck({ initialCache = [], allowReservation, onProvider, onCacheRead }, run) {
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
  const cache = new Map(initialCache.map((row) => [row.cache_key, row]));
  const cacheWrites = [];
  const cacheReads = [];
  const reservations = [];
  const providerCalls = [];

  process.env.GEM_STATE_SUPABASE_URL = "https://supabase.mock.test";
  process.env.SUPABASE_URL = "";
  process.env.GEM_STATE_SUPABASE_SERVICE_ROLE_KEY = "test-service-role-key";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "";
  process.env.MARKETCHECK_API_KEY = "test-marketcheck-key";
  delete process.env.MARKETCHECK_MONTHLY_CALL_LIMIT;

  globalThis.fetch = async (input, init = {}) => {
    const requestUrl = typeof input === "string" || input instanceof URL ? input : input.url;
    const url = new URL(requestUrl);
    const method = (init.method ?? "GET").toUpperCase();

    if (url.hostname === "supabase.mock.test") {
      if (url.pathname.endsWith("/rpc/reserve_marketcheck_call")) {
        const body = JSON.parse(init.body);
        const allowed = allowReservation(body, reservations);
        reservations.push({ ...body, allowed, providerCallsAtReservation: providerCalls.length });
        return Response.json({ allowed });
      }
      if (url.pathname.endsWith("/marketcheck_cache") && method === "GET") {
        const filter = url.searchParams.get("cache_key");
        cacheReads.push({ filter, selection: url.searchParams.get("select") });
        const override = await onCacheRead?.(init);
        if (override) return override;
        let rows = filter?.startsWith("eq.")
          ? [cache.get(filter.slice(3))].filter(Boolean)
          : [...cache.values()];
        if (filter?.startsWith("in.(")) {
          let keys;
          try {
            // PostgREST quoted-list values require escaped inner quotes.
            keys = JSON.parse(`[${filter.slice(4, -1)}]`);
          } catch {
            return Response.json({ code: "PGRST100", message: "Invalid quoted IN filter" }, { status: 400 });
          }
          rows = rows.filter((row) => keys.includes(row.cache_key));
        }
        return Response.json(rows);
      }
      if (url.pathname.endsWith("/marketcheck_cache") && method === "POST") {
        const payload = JSON.parse(init.body);
        const rows = Array.isArray(payload) ? payload : [payload];
        for (const row of rows) {
          cache.set(row.cache_key, row);
          cacheWrites.push(row);
        }
        return new Response(null, { status: 201 });
      }
      throw new Error(`Unexpected mocked database request: ${method} ${url.pathname}`);
    }

    if (url.hostname !== "api.marketcheck.com")
      throw new Error(`Unexpected network destination: ${url.hostname}`);

    const state = url.searchParams.get("state");
    const start = Number(url.searchParams.get("start"));
    const kind = url.pathname.includes("/fsbo/") ? "fsbo" : "dealer";
    const call = { state, start, kind };
    providerCalls.push(call);
    return onProvider(call);
  };

  try {
    await run({ cache, cacheWrites, cacheReads, reservations, providerCalls });
  } finally {
    globalThis.fetch = originalFetch;
    for (const name of envNames) {
      if (previousEnv[name] === undefined) delete process.env[name];
      else process.env[name] = previousEnv[name];
    }
  }
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

test("quota denials gate provider calls and repeated refreshes preserve stale cache retention", async () => {
  const staleDealerKey = JSON.stringify({ v: 3, kind: "dealer", state: "WA", start: 0 });
  const staleExpiresAt = "2026-01-01T00:00:00.000Z";
  const staleDealerPayload = normalizeMarketCheckSearch(
    {
      num_found: 1,
      listings: [providerListing("WA", "dealer", 0, 500)],
    },
    "dealer",
  );
  let allowedReservations = 0;
  await withMockMarketCheck(
    {
      initialCache: [
        {
          cache_key: staleDealerKey,
          payload: staleDealerPayload,
          expires_at: staleExpiresAt,
        },
      ],
      allowReservation: ({ p_cache_key }) => {
        const key = JSON.parse(p_cache_key);
        if (key.kind === "fsbo" && allowedReservations === 0) {
          allowedReservations += 1;
          return true;
        }
        return false;
      },
      onProvider: ({ state, kind, start }) =>
        Response.json({
          num_found: 1,
          listings: [providerListing(state, kind, start, 501)],
        }),
    },
    async ({ cache, cacheWrites, reservations, providerCalls }) => {
      const browse = { group: "motors", state: "Washington" };
      const firstResult = await marketCheckCards(browse, { forceRefresh: true });

      assert.equal(allowedReservations, 1);
      assert.equal(reservations.length, 2);
      assert.equal(reservations.filter((entry) => entry.allowed).length, 1);
      assert.ok(reservations.every((entry) => entry.p_monthly_limit === 450));
      assert.deepEqual(providerCalls, [{ state: "WA", start: 0, kind: "fsbo" }]);
      assert.ok(firstResult.some((card) => card.externalVehicle.sourceKind === "dealer"));
      assert.ok(firstResult.some((card) => card.externalVehicle.sourceKind === "fsbo"));
      assert.ok(
        reservations.some((entry) => entry.p_cache_key === staleDealerKey && !entry.allowed),
      );
      assert.ok(!providerCalls.some((call) => call.kind === "dealer"));

      const retainedRowsAfterFirstAttempt = new Map(
        [...cache].map(([key, row]) => [key, row.expires_at]),
      );
      assert.equal(cache.get(staleDealerKey).expires_at, staleExpiresAt);
      assert.equal(
        cacheWrites.some((row) => row.cache_key === staleDealerKey),
        false,
      );

      for (let attempt = 0; attempt < 3; attempt += 1)
        await marketCheckCards(browse, { forceRefresh: true });

      assert.equal(providerCalls.length, 1, "denied and repeated refreshes must not call upstream");
      assert.equal(cacheWrites.length, 1, "denied refreshes must not rewrite cache retention");
      assert.deepEqual(
        new Map([...cache].map(([key, row]) => [key, row.expires_at])),
        retainedRowsAfterFirstAttempt,
      );

      const allowedKeys = new Set(
        reservations.filter((entry) => entry.allowed).map((entry) => entry.p_cache_key),
      );
      for (const call of providerCalls) {
        const key = JSON.stringify({ v: 3, kind: call.kind, state: call.state, start: call.start });
        assert.ok(allowedKeys.has(key), `provider call ${key} must be budget-approved`);
      }
      for (const denied of reservations.filter((entry) => !entry.allowed)) {
        const key = JSON.parse(denied.p_cache_key);
        assert.ok(
          !providerCalls
            .slice(denied.providerCallsAtReservation)
            .some(
              (call) =>
                call.state === key.state && call.kind === key.kind && call.start === key.start,
            ),
          `denied cache key ${denied.p_cache_key} must not reach provider`,
        );
      }
    },
  );
});


test("fresh state inventory escapes JSON cache keys and stays on two bulk reads", async () => {
  const initialCache = ["dealer", "fsbo"].flatMap((kind) => {
    const pages = kind === "dealer" ? 6 : 4;
    return Array.from({ length: pages }, (_, page) => ({
      cache_key: JSON.stringify({ v: 3, kind, state: "ID", start: page * 50 }),
      expires_at: new Date(Date.now() + 60000).toISOString(),
      payload: normalizeMarketCheckSearch({ num_found: pages * 50, listings: Array.from({ length: 50 }, (_, i) => providerListing("ID", kind, page * 50, i)) }, kind),
    }));
  });
  await withMockMarketCheck({ initialCache, allowReservation: () => { throw new Error("Fresh cache must not reserve provider calls"); }, onProvider: () => { throw new Error("Fresh cache must not call provider"); } }, async ({ cacheReads, providerCalls, reservations }) => {
    const cards = await marketCheckCards({ category: "cars-trucks", state: "ID", sort: "newest", page: 1 });
    assert.equal(cards.length, 500);
    assert.equal(cacheReads.length, 2, "no sequential per-page fallback reads");
    for (const read of cacheReads) {
      assert.ok(read.filter.startsWith("in.("));
      const keys = JSON.parse(`[${read.filter.slice(4, -1)}]`);
      assert.ok(keys.every((key) => JSON.parse(key).state === "ID"));
      assert.ok(keys.includes(initialCache.find((row) => JSON.parse(row.cache_key).kind === JSON.parse(keys[0]).kind).cache_key));
    }
    assert.deepEqual(providerCalls, []);
    assert.deepEqual(reservations, []);
  });
});


test("home cache preparation performs only two reads and reuses them after validation", async () => {
  const initialCache = ["dealer", "fsbo"].map((kind) => ({
    cache_key: JSON.stringify({ v: 3, kind, state: "ID", start: 0 }),
    expires_at: new Date(Date.now() + 60000).toISOString(),
    payload: normalizeMarketCheckSearch({ num_found: 1, listings: [providerListing("ID", kind, 0, 0)] }, kind),
  }));
  await withMockMarketCheck({ initialCache, allowReservation: () => { throw new Error("No paid calls"); }, onProvider: () => { throw new Error("No provider calls"); } }, async ({ cacheReads, providerCalls, reservations }) => {
    const preparedHomeCache = prepareHomeMarketCheckCache();
    await Promise.all([preparedHomeCache.dealer, preparedHomeCache.fsbo]);
    assert.equal(cacheReads.length, 2, "both reads start before card computation");
    assert.equal(providerCalls.length, 0);
    assert.equal(reservations.length, 0);
    const input = { category: "cars-trucks", state: "ID", sort: "newest", page: 1 };
    const cards = await marketCheckCards(input, { preparedHomeCache });
    assert.equal(cacheReads.length, 2, "consume without duplicate bulk queries");
    const control = await marketCheckCards(input);
    assert.deepEqual(cards, control, "preparation preserves all card fields and ordering");
    assert.equal(cacheReads.length, 4);
  });
});

test("home preparation with missing inventory does not reserve until consumption", async () => {
  await withMockMarketCheck({ allowReservation: () => false, onProvider: () => { throw new Error("Quota denial must prevent provider"); } }, async ({ cacheReads, reservations, providerCalls }) => {
    const preparedHomeCache = prepareHomeMarketCheckCache();
    await Promise.all([preparedHomeCache.dealer, preparedHomeCache.fsbo]);
    assert.equal(cacheReads.length, 2);
    assert.equal(reservations.length, 0);
    const cards = await marketCheckCards({ category: "cars-trucks", state: "ID" }, { preparedHomeCache });
    assert.deepEqual(cards, []);
    assert.ok(reservations.length > 0, "existing quota path only runs after consumption");
    assert.deepEqual(providerCalls, []);
    assert.equal(cacheReads.filter((read) => read.filter?.startsWith("in.(")).length, 2);
  });
});

test("prepared inventory expiry is checked on consumption, not preparation", async () => {
  const now = Date.now();
  const initialCache = ["dealer", "fsbo"].map((kind) => ({
    cache_key: JSON.stringify({ v: 3, kind, state: "ID", start: 0 }),
    expires_at: new Date(now + 60000).toISOString(),
    payload: normalizeMarketCheckSearch({ num_found: 1, listings: [providerListing("ID", kind, 0, 0)] }, kind),
  }));
  await withMockMarketCheck({ initialCache, allowReservation: () => false, onProvider: () => { throw new Error("No provider calls"); } }, async ({ cacheReads }) => {
    const preparedHomeCache = prepareHomeMarketCheckCache();
    await Promise.all([preparedHomeCache.dealer, preparedHomeCache.fsbo]);
    const originalNow = Date.now;
    Date.now = () => now + 120000;
    try {
      await marketCheckCards({ category: "cars-trucks", state: "ID" }, { preparedHomeCache });
      assert.ok(cacheReads.some((read) => read.filter?.startsWith("eq.")), "expired prepared rows enter existing per-page validation rather than being accepted");
    } finally { Date.now = originalNow; }
  });
});


test("failed bulk cache reads reject once without reserving provider budget, and a later read can recover", async () => {
  let failed = true;
  const initialCache = ["dealer", "fsbo"].map((kind) => ({
    cache_key: JSON.stringify({ v: 3, kind, state: "ID", start: 0 }),
    expires_at: new Date(Date.now() + 60000).toISOString(),
    payload: normalizeMarketCheckSearch({ num_found: 1, listings: [providerListing("ID", kind, 0, 0)] }, kind),
  }));
  await withMockMarketCheck({ initialCache,
    allowReservation: () => { throw new Error("Read failure must not reserve budget"); },
    onProvider: () => { throw new Error("No provider calls"); },
    onCacheRead: () => failed ? Response.json({ code: "TEST", message: "synthetic unavailable cache" }, { status: 503 }) : undefined,
  }, async ({ cacheReads, providerCalls, reservations }) => {
    const preparedHomeCache = prepareHomeMarketCheckCache();
    await Promise.all([preparedHomeCache.dealer, preparedHomeCache.fsbo]);
    await assert.rejects(marketCheckCards({ category: "cars-trucks", state: "ID" }, { preparedHomeCache }), /temporarily|could not be verified/i);
    assert.equal(cacheReads.length, 2, "SDK retries must not multiply a failed bulk read");
    assert.deepEqual(providerCalls, []); assert.deepEqual(reservations, []);
    failed = false;
    const recovered = await marketCheckCards({ category: "cars-trucks", state: "ID" });
    assert.equal(recovered.length, 2); assert.equal(cacheReads.length, 4);
  });
});

test("bulk read deadline reaches the actual transport signal and cannot fall into paid refresh", { timeout: 2000 }, async (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  await withMockMarketCheck({
    allowReservation: () => { throw new Error("No reservation after timeout"); },
    onProvider: () => { throw new Error("No provider calls"); },
    onCacheRead: (init) => new Promise((_resolve, reject) => init.signal.addEventListener("abort", () => reject(init.signal.reason), { once: true })),
  }, async ({ cacheReads, reservations, providerCalls }) => {
    const preparedHomeCache = prepareHomeMarketCheckCache();
    for (let i = 0; i < 20; i++) await Promise.resolve();
    assert.equal(cacheReads.length, 2);
    t.mock.timers.tick(8001);
    await Promise.all([preparedHomeCache.dealer, preparedHomeCache.fsbo]);
    await assert.rejects(marketCheckCards({ category: "cars-trucks", state: "ID" }, { preparedHomeCache }), /could not be verified/i);
    assert.equal(cacheReads.length, 2); assert.deepEqual(reservations, []); assert.deepEqual(providerCalls, []);
  });
});
