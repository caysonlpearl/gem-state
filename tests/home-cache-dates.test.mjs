import * as homeRegions from "../src/lib/home-feed-regions.ts";
import * as redfin from "../src/lib/redfin-contract.ts";
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import ts from "typescript";
import * as contract from "../src/lib/openwebninja-contract.ts";
import { homesFromSavedSearches } from "../src/lib/openwebninja-cache.ts";
import { hasCurrentHomeCache, isIndexablePlaceInventory } from "../src/lib/seo-policy.ts";
const now = Date.parse("2026-11-01T12:00:00Z");

test("expanded search pages replace older copies, including successful empty responses", () => {
  const row = (page, numHomes, age, homes) => ({
    cache_key: JSON.stringify({
      v: 3,
      kind: "area-search",
      area: "north-idaho",
      provider: "redfin",
      mode: "buy",
      page,
      numHomes,
    }),
    expires_at: new Date(now + (8 - age) * 86400000).toISOString(),
    payload: { homes },
  });
  const home = (id) => ({ id, city: "Sandpoint", state: "ID", mode: "buy" });
  const result = homesFromSavedSearches(
    [row(1, 40, 1, [home("old")]), row(1, 350, 0, []), row(2, 350, 1, [home("other-page")])],
    now,
  );
  assert.deepEqual(
    result.map((h) => h.id),
    ["other-page"],
  );
});

test("source posting dates and observed days-on-market remain stable across cache reads", () => {
  const row = {
    zpid: 1,
    address: { streetAddress: "1 Main St", city: "Boise", state: "ID" },
    price: 2000,
    daysOnMarket: 4,
  };
  const home = contract.normalizeOpenWebNinjaResult({ data: [row] }, "rent", now).homes[0];
  assert.equal(contract.listedAt(home, now), "2026-10-28T12:00:00.000Z");
  assert.equal(contract.listedAt(home, now + 10 * 86400000), "2026-10-28T12:00:00.000Z");
  assert.equal(
    contract.listedAt({ ...home, listedAt: "2026-10-20" }, now),
    "2026-10-20T00:00:00.000Z",
  );
  assert.equal(contract.listedAt({ daysOnMarket: 0 }, now), "");
  assert.equal(contract.listedAt({ daysOnMarket: 4 }, now + 86400000), "");
  assert.equal(contract.listedAt({ listedAt: "2099-01-01" }, now), "");
});
test("cache validity qualifies inventory without becoming a posting or modification date", () => {
  const home = {
    externalHome: { source: "OpenWeb Ninja", cacheExpiresAt: "2026-11-10T00:00:00Z" },
  };
  assert.equal(hasCurrentHomeCache(home, now), true);
  assert.equal(isIndexablePlaceInventory(5, "", now, 5, hasCurrentHomeCache(home, now)), true);
  assert.equal(isIndexablePlaceInventory(4, "", now, 5, true), false);
  assert.equal(hasCurrentHomeCache(home, now + 20 * 86400000), false);
  assert.equal(
    hasCurrentHomeCache(
      { externalHome: { source: "OpenWeb Ninja", cacheExpiresAt: "2099-01-01" } },
      now,
    ),
    false,
  );
  assert.equal(
    hasCurrentHomeCache(
      { externalHome: { source: "Mashvisor", cacheExpiresAt: "2026-11-10" } },
      now,
    ),
    false,
  );
});
test("saved city variants canonicalize without changing state or inventing a date", () => {
  const homes = homesFromSavedSearches(
    [
      {
        cache_key: JSON.stringify({ kind: "area-search", mode: "rent" }),
        expires_at: "2026-11-10T00:00:00Z",
        payload: {
          homes: [{ id: "1", city: "Coeur D Alene", state: "ID", mode: "rent", daysOnMarket: 1 }],
        },
      },
    ],
    now,
  );
  assert.equal(homes[0].city, "Coeur d'Alene");
  assert.equal(contract.listedAt(homes[0], now), "");
  assert.equal(homes[0].cacheExpiresAt, "2026-11-10T00:00:00Z");
});

function cacheFixture(mode) {
  const original = { payload: { status: "ok", homes: [] }, expires_at: "2026-11-10T00:00:00Z" };
  let row = original,
    calls = 0;
  const writes = [];
  const db = {
    from() {
      return {
        select() {
          return {
            eq() {
              return {
                async maybeSingle() {
                  return { data: row };
                },
              };
            },
          };
        },
        delete() {
          return {
            async eq() {
              row = null;
              return { error: null };
            },
          };
        },
        async upsert(value) {
          writes.push(value);
          if (mode === "storage_error" && value.payload.fresh)
            return { error: { message: "write failed" } };
          row = value;
          return { error: null };
        },
      };
    },
    async rpc() {
      return mode === "reservation_error"
        ? { error: { message: "offline" } }
        : { data: { allowed: mode !== "limited" } };
    },
  };
  const exports = {};
  vm.runInNewContext(
    ts.transpile(
      readFileSync(new URL("../src/lib/openwebninja.server.ts", import.meta.url), "utf8"),
      { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
    ) + "\nexports.testCachedCall = cachedCall;",
    {
      exports,
      Headers,
      AbortSignal,
      console,
      require(name) {
        if (name === "@supabase/supabase-js") return { createClient: () => db };
        if (name === "./catalog-read-deadline")
          return { withCatalogReadDeadline: (query) => query };
        if (name === "./short-cache.server")
          return { shortCache: (_key, _ttl, load) => load(), PUBLIC_PAGE_CACHE_MS: 60000 };
        if (name === "./runtime-env.server") return { serverEnv: () => "test-only-value" };
        if (name === "./openwebninja-cache") return { homesFromSavedSearches };
        if (name === "./home-feed-regions") return homeRegions;
        if (name === "./redfin-contract") return redfin;
        if (name === "./openwebninja-contract") return contract;
        throw new Error(name);
      },
      async fetch() {
        calls++;
        if (mode === "network_error") throw new Error("offline");
        return mode === "storage_error"
          ? Response.json({ fresh: true })
          : new Response(null, { status: 500 });
      },
    },
  );
  return {
    run: (options = {}) =>
      exports.testCachedCall("key", "search", (value) => value, { forceRefresh: true, ...options }),
    original,
    writes,
    calls: () => calls,
  };
}
for (const mode of ["limited", "reservation_error", "network_error", "provider_error"]) {
  test(`failed ${mode} refresh restores original expiry instead of making stale homes fresh`, async () => {
    const f = cacheFixture(mode);
    const result = await f.run();
    assert.equal(result.ok, true);
    assert.equal(f.writes.length, 1);
    assert.equal(f.writes[0].expires_at, f.original.expires_at);
    assert.equal(f.calls(), ["limited", "reservation_error"].includes(mode) ? 0 : 1);
  });
}

test("monthly detail refreshes do not relabel stale data as fresh when the provider fails", async () => {
  const f = cacheFixture("provider_error");
  const result = await f.run({ allowStale: false });
  assert.equal(result.ok, false);
  assert.equal(f.writes.at(-1).expires_at, f.original.expires_at);
});
test("a failed cache write cannot count a fetched payload as saved", async () => {
  const f = cacheFixture("storage_error");
  const result = await f.run({ allowStale: false });
  assert.equal(result.ok, false);
  assert.equal(f.writes.at(-1).expires_at, f.original.expires_at);
});
