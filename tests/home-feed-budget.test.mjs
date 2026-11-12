import * as homeRegions from "../src/lib/home-feed-regions.ts";
import * as redfin from "../src/lib/redfin-contract.ts";
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import ts from "typescript";
import * as contract from "../src/lib/openwebninja-contract.ts";
import { hasCompleteHomeDetails } from "../src/lib/openwebninja-cache.ts";
function fixture({
  age = 1,
  complete = [],
  recent = [],
  fail = false,
  limitedProvider = null,
  due = [],
  searchError = false,
  requestsError = false,
  backup = false,
} = {}) {
  const calls = [],
    saved = new Set(complete);
  let api;
  const provider = {
    cacheDb: () => ({
      from(table) {
        return {
          select() {
            return this;
          },
          gte() {
            return this;
          },
          limit() {
            return this;
          },
          like() {
            return this;
          },
          then(resolve) {
            if (table === "openwebninja_api_requests")
              return Promise.resolve(resolve({ data: recent, error: requestsError ? {} : null }));
            return Promise.resolve(
              resolve({
                data: api.OPENWEBNINJA_AREAS.flatMap((area) =>
                  ["buy", "rent"].map((mode) => ({
                    cache_key: provider.areaSearchKey("ID", area.key, mode),
                    expires_at: new Date(
                      Date.now() + provider.CACHE_MS - age * 86400000,
                    ).toISOString(),
                    payload: { homes: [{ id: area.key === "treasure-valley" ? "1" : "2" }] },
                  })),
                ),
                error: searchError ? {} : null,
              }),
            );
          },
        };
      },
    }),
    openWebNinjaConfigured: (provider) => provider !== "redfin",
    homeProviderAccounts: () => (backup ? ["primary", "backup"] : ["primary"]),
    CACHE_MS: 30 * 86400000,
    areaSearchKey: (state, area, mode) =>
      JSON.stringify({ v: 1, kind: "area-search", state, area, mode }),
    completeHomeDetailIds: async () => saved,
    propertyDetailRefreshIds: async () => new Set(due),
    cachedHomes: async () => [
      { id: "1", address: "1 Main St", city: "Boise", state: "ID" },
      { id: "2", address: "2 Main St", city: "Idaho Falls", state: "ID" },
      { id: "3", address: "3 Main St", city: "Boise", state: "ID" },
    ],
    searchHomesArea: async (...args) => {
      calls.push({
        type: "search",
        provider: args[3].provider,
        ...(args[3].account === "backup" ? { account: "backup" } : {}),
      });
      return { homes: [] };
    },
    propertyDetails: async (id, _url, options) => {
      calls.push({
        type: "detail",
        id,
        provider: options.provider,
        ...(options.account === "backup" ? { account: "backup" } : {}),
      });
      if (options.provider === limitedProvider) return { ok: false, status: "limited" };
      return fail ? { ok: false, status: "unavailable" } : { ok: true, value: {} };
    },
  };
  const exports = {};
  vm.runInNewContext(
    ts.transpile(
      readFileSync(new URL("../src/lib/openwebninja-listings.server.ts", import.meta.url), "utf8"),
      {
        target: ts.ScriptTarget.ES2022,
        module: ts.ModuleKind.CommonJS,
      },
    ),
    {
      exports,
      console,
      require(name) {
        if (name === "./openwebninja.server") return provider;
        if (name === "./home-feed-regions") return homeRegions;
        if (name === "./redfin-contract") return redfin;
        if (name === "./openwebninja-contract") return contract;
        if (name === "./openwebninja-cache") return { hasCompleteHomeDetails };
        if (name === "./landing-card-pool") return {};
        throw new Error(name);
      },
    },
  );
  api = exports;
  return { api, calls, recent, saved };
}
const request = (id, provider = "zillow") => ({
  provider,
  cache_key: JSON.stringify({ v: 3, kind: "property", id }),
});
test("remaining monthly allowance is usable after three calls today, without duplicate home work", async () => {
  const f = fixture({ recent: [request("old1"), request("old2"), request("old3")] });
  await f.api.advanceHomeFeed();
  assert.deepEqual(f.calls, [
    { type: "detail", id: "1", provider: "zillow" },
    { type: "detail", id: "2", provider: "realestate" },
  ]);
});
test("more than 25 calls today do not stop remaining monthly detail allowance", async () => {
  const f = fixture({
    recent: ["zillow", "realestate"].flatMap((provider) =>
      Array.from({ length: 30 }, (_, i) => request("old-" + i, provider)),
    ),
  });
  await f.api.advanceHomeFeed();
  assert.equal(f.calls.length, 2);
});
test("configured regions refresh their inventory weekly before filling details", async () => {
  const f = fixture({ age: 8 });
  await f.api.advanceHomeFeed();
  assert.ok(f.calls.every((call) => call.type === "search"));
});
test("published regions still refresh weekly to maintain prices and availability", async () => {
  const f = fixture({ age: 8, complete: ["1"] });
  await f.api.advanceHomeFeed();
  assert.deepEqual(
    f.calls.map((call) => call.type),
    ["search", "search"],
  );
});
test("preview searches refresh before their 30-day cache expires", async () => {
  const f = fixture({ age: 26 });
  await f.api.advanceHomeFeed();
  assert.ok(f.calls.every((call) => call.type === "search"));
});
test("recent failed detail ids are skipped across subscriptions instead of blocking the queue", async () => {
  const f = fixture({ recent: [request("1")] });
  await f.api.advanceHomeFeed();
  assert.deepEqual(
    f.calls.map((call) => call.id),
    ["3", "2"],
  );
});
test("failed calls keep the home incomplete and the remaining count accurate", async () => {
  const f = fixture({ fail: true, recent: [request("1")] });
  const result = await f.api.advanceHomeFeed();
  assert.equal(result.zillow.ok, false);
  assert.equal(result.zillow.remaining, 2);
  assert.equal(f.saved.size, 0);
});
test("cache or request-ledger outages fail closed without provider calls", async () => {
  for (const options of [{ searchError: true }, { requestsError: true }]) {
    const f = fixture(options);
    await f.api.advanceHomeFeed();
    assert.equal(f.calls.length, 0);
  }
});

test("an exhausted subscription never borrows another region's subscription", async () => {
  const f = fixture({ limitedProvider: "zillow" });
  const result = await f.api.advanceHomeFeed();
  assert.equal(result.zillow.ok, false);
  assert.equal(result.realestate.ok, true);
  assert.deepEqual(
    f.calls.map((call) => call.id),
    ["1", "2"],
  );
});

test("detail acquisition cannot spend credits reserved for future weekly refreshes", async () => {
  const recent = Array.from({ length: 86 }, (_, i) => ({
    ...request("old-" + i),
    created_at: new Date(Date.now() - 2 * 86400000).toISOString(),
  }));
  const f = fixture({ recent });
  const result = await f.api.advanceHomeFeed();
  assert.equal(result.zillow.skipped, "weekly refresh allowance protected");
  assert.equal(
    f.calls.some((call) => call.provider === "zillow"),
    false,
  );
});

test("monthly detail renewals take priority over new acquisitions in each region", async () => {
  const f = fixture({ due: ["3"] });
  await f.api.advanceHomeFeed();
  assert.equal(f.calls.find((call) => call.provider === "zillow").id, "3");
});

test("a shared weekly reserve permits use of primary credits while backup remains available", async () => {
  const f = fixture({
    backup: true,
    recent: Array.from({ length: 93 }, (_, i) => ({
      ...request("primary-" + i),
      account: "primary",
      created_at: new Date(Date.now() - 2 * 86400000).toISOString(),
    })),
  });
  await f.api.advanceHomeFeed();
  assert.deepEqual(
    f.calls.find((c) => c.provider === "zillow"),
    { type: "detail", id: "1", provider: "zillow" },
  );
  assert.equal(f.calls.find((c) => c.provider === "realestate").account, undefined);
});

test("primary monthly exhaustion uses backup without retrying a failed property", async () => {
  const f = fixture({
    backup: true,
    recent: Array.from({ length: 100 }, (_, i) => ({
      ...request(i === 0 ? "1" : "primary-" + i),
      account: "primary",
    })),
  });
  await f.api.advanceHomeFeed();
  assert.deepEqual(
    f.calls.find((c) => c.provider === "zillow"),
    { type: "detail", id: "3", provider: "zillow", account: "backup" },
  );
});

test("both accounts stop at their independent monthly allowances", async () => {
  const f = fixture({
    backup: true,
    recent: ["primary", "backup"].flatMap((account) =>
      Array.from({ length: 100 }, (_, i) => ({ ...request(account + "-" + i), account })),
    ),
  });
  const result = await f.api.advanceHomeFeed();
  assert.equal(result.zillow.skipped, "monthly allowance reached");
  assert.equal(
    f.calls.some((c) => c.provider === "zillow"),
    false,
  );
});

test("searches use backup only after primary's monthly allowance is exhausted", async () => {
  const f = fixture({
    backup: true,
    age: 8,
    recent: Array.from({ length: 100 }, (_, i) => ({
      ...request("primary-" + i),
      created_at: new Date(Date.now() - 2 * 86400000).toISOString(),
    })),
  });
  await f.api.advanceHomeFeed();
  assert.deepEqual(
    f.calls.find((c) => c.provider === "zillow"),
    { type: "search", provider: "zillow", account: "backup" },
  );
});
