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
  searchError = false,
  requestsError = false,
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
    openWebNinjaConfigured: () => true,
    CACHE_MS: 30 * 86400000,
    areaSearchKey: (state, area, mode) =>
      JSON.stringify({ v: 1, kind: "area-search", state, area, mode }),
    completeHomeDetailIds: async () => saved,
    cachedHomes: async () => [{ id: "1" }, { id: "2" }, { id: "3" }],
    searchHomesArea: async (...args) => {
      calls.push({ type: "search", provider: args[3].provider });
      return { homes: [] };
    },
    propertyDetails: async (id, _url, options) => {
      calls.push({ type: "detail", id, provider: options.provider });
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
  assert.equal(f.api.HOME_DETAIL_DAILY_PACE, 25);
});
test("the existing 25-call daily ceiling still stops each provider", async () => {
  const f = fixture({
    recent: ["zillow", "realestate"].flatMap((provider) =>
      Array.from({ length: 25 }, (_, i) => request(String(i), provider)),
    ),
  });
  const result = await f.api.advanceHomeFeed();
  assert.equal(f.calls.length, 0);
  assert.equal(result.zillow.skipped, "daily pace reached");
  assert.equal(result.realestate.skipped, "daily pace reached");
});
test("preview regions do not consume weekly refresh requests before full details are filled", async () => {
  const f = fixture({ age: 8 });
  await f.api.advanceHomeFeed();
  assert.ok(f.calls.every((call) => call.type === "detail"));
});
test("published regions still refresh weekly to maintain prices and availability", async () => {
  const f = fixture({ age: 8, complete: ["1"] });
  await f.api.advanceHomeFeed();
  assert.deepEqual(
    f.calls.map((call) => call.type),
    ["search", "detail"],
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
    ["2", "3"],
  );
});
test("failed calls keep the home incomplete and the remaining count accurate", async () => {
  const f = fixture({ fail: true, recent: [request("1")] });
  const result = await f.api.advanceHomeFeed();
  assert.equal(result.zillow.ok, false);
  assert.equal(result.zillow.remaining, 3);
  assert.equal(f.saved.size, 0);
});
test("cache or request-ledger outages fail closed without provider calls", async () => {
  for (const options of [{ searchError: true }, { requestsError: true }]) {
    const f = fixture(options);
    await f.api.advanceHomeFeed();
    assert.equal(f.calls.length, 0);
  }
});

test("an exhausted subscription does not prevent the other subscription filling the same home", async () => {
  const f = fixture({ limitedProvider: "zillow" });
  const result = await f.api.advanceHomeFeed();
  assert.equal(result.zillow.ok, false);
  assert.equal(result.realestate.ok, true);
  assert.deepEqual(
    f.calls.map((call) => call.id),
    ["1", "1"],
  );
});
