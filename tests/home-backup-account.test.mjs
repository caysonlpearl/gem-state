import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import ts from "typescript";
function fixture({ backupProviders = "zillow,realestate", sameKey = false, cached = false } = {}) {
  const reservations = [],
    requests = [];
  const env = {
    OPENWEBNINJA_API_KEY: "primary-test-key",
    OPENWEBNINJA_REDFIN_ENABLED: "true",
    OPENWEBNINJA_BACKUP_API_KEY: sameKey ? "primary-test-key" : "backup-test-key",
    OPENWEBNINJA_BACKUP_HOME_PROVIDERS: backupProviders,
    SUPABASE_URL: "https://database.invalid",
    SUPABASE_SERVICE_ROLE_KEY: "database-test-key",
  };
  const db = {
    rpc: async (name, args) => {
      reservations.push({ name, args });
      return {
        data: cached ? { cached: true, payload: { alreadySaved: true } } : { allowed: true },
      };
    },
    from: () => ({ upsert: async () => ({ error: null }) }),
  };
  const exports = {};
  vm.runInNewContext(
    ts.transpile(
      readFileSync(new URL("../src/lib/openwebninja.server.ts", import.meta.url), "utf8"),
      { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
    ) + "\nexports.call=cachedCall;",
    {
      exports,
      Headers,
      AbortSignal,
      console,
      require(name) {
        if (name === "@supabase/supabase-js") return { createClient: () => db };
        if (name === "./runtime-env.server") return { serverEnv: (key) => env[key] ?? "" };
        return {};
      },
      fetch: async (url, options) => {
        requests.push({ url, key: options.headers["x-api-key"] });
        return Response.json({ complete: true });
      },
    },
  );
  return { api: exports, reservations, requests };
}
test("backup imports reserve the backup ledger and use only the backup credential", async () => {
  const f = fixture();
  assert.equal(
    (
      await f.api.call("property-key", "property-details", (x) => x, {
        provider: "zillow",
        account: "backup",
      })
    ).ok,
    true,
  );
  assert.deepEqual(JSON.parse(JSON.stringify(f.reservations)), [
    {
      name: "reserve_openwebninja_account_call",
      args: { p_cache_key: "property-key", p_provider: "zillow", p_account: "backup" },
    },
  ]);
  assert.equal(f.requests[0].key, "backup-test-key");
  await f.api.call("primary-key", "property-details", (x) => x, { provider: "zillow" });
  assert.equal(f.reservations[1].name, "reserve_openwebninja_call");
  assert.equal(f.requests[1].key, "primary-test-key");
});
test("unactivated backup subscriptions and duplicate credentials cannot spend a second budget", async () => {
  for (const options of [{ backupProviders: "" }, { sameKey: true }]) {
    const f = fixture(options);
    assert.equal(
      (
        await f.api.call("key", "property-details", (x) => x, {
          provider: "zillow",
          account: "backup",
        })
      ).ok,
      false,
    );
    assert.equal(f.requests.length, 0);
    assert.equal(f.reservations.length, 0);
  }
  const f = fixture();
  assert.deepEqual(Array.from(f.api.homeProviderAccounts("redfin")), ["primary"]);
});
test("backup reuses shared saved results without issuing a provider request", async () => {
  const f = fixture({ cached: true });
  const result = await f.api.call("key", "property-details", (x) => x, {
    provider: "realestate",
    account: "backup",
  });
  assert.equal(result.value.alreadySaved, true);
  assert.equal(f.requests.length, 0);
});

test("scheduled details reserve weekly-update credits with the actual account set", async () => {
  const f = fixture();
  await f.api.call("detail", "property-details", (x) => x, {
    provider: "zillow",
    account: "backup",
    budget: { accounts: ["primary", "backup"], reservedSearches: 12 },
  });
  assert.equal(f.reservations[0].name, "reserve_openwebninja_home_call");
  assert.deepEqual(JSON.parse(JSON.stringify(f.reservations[0].args)), {
    p_cache_key: "detail",
    p_provider: "zillow",
    p_account: "backup",
    p_accounts: ["primary", "backup"],
    p_reserved_searches: 12,
  });
});
