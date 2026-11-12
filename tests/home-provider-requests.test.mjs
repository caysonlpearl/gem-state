import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import ts from "typescript";
import * as regions from "../src/lib/home-feed-regions.ts";
import * as zillow from "../src/lib/openwebninja-contract.ts";
import * as redfin from "../src/lib/redfin-contract.ts";
const source = ts.createSourceFile(
  "provider.ts",
  readFileSync(new URL("../src/lib/openwebninja.server.ts", import.meta.url), "utf8"),
  ts.ScriptTarget.Latest,
  true,
);
const fn = source.statements.find(
  (n) => ts.isFunctionDeclaration(n) && n.name?.text === "searchHomesArea",
);
function fixture(payload, enabled = true) {
  const calls = [],
    exports = {};
  vm.runInNewContext(
    ts.transpile(fn.getText(source) + "\nexports.read=searchHomesArea;", {
      target: ts.ScriptTarget.ES2022,
      module: ts.ModuleKind.CommonJS,
    }),
    {
      exports,
      URLSearchParams,
      Math,
      REGIONAL_SEARCH_CACHE_MS: 8 * 86400000,
      ...regions,
      ...zillow,
      ...redfin,
      openWebNinjaConfigured: () => enabled,
      areaSearchKey: (...args) => JSON.stringify(args),
      cachedCall: async (key, path, normalize, options) => {
        calls.push({ key, path, options });
        return { ok: true, value: normalize(payload) };
      },
    },
  );
  return { calls, read: exports.read };
}
test("Zillow region searches filter outside homes and use documented sale pagination", async () => {
  const f = fixture({
    data: [
      { zpid: "1", streetAddress: "1 Main St", city: "Boise", state: "ID", price: 300000 },
      { zpid: "2", streetAddress: "2 Main St", city: "Sandpoint", state: "ID", price: 300000 },
    ],
  });
  const result = await f.read("ID", regions.HOME_FEED_REGIONS[0], "buy", {
    provider: "zillow",
    page: 2,
  });
  assert.equal(result.homes.length, 1);
  assert.equal(result.homes[0].city, "Boise");
  const url = new URL("https://fixture.invalid/" + f.calls[0].path);
  assert.equal(url.pathname, "/search-polygon");
  assert.equal(url.searchParams.get("page"), "2");
  assert.equal(url.searchParams.get("home_status"), "FOR_SALE");
  assert.equal(f.calls[0].options.provider, "zillow");
});
test("Redfin rentals use coordinate bounds, status, page size and namespaced property IDs", async () => {
  const f = fixture({
    data: {
      results: [
        {
          property_id: "123",
          street_address: "1 Main St",
          city: "Sandpoint",
          state: "ID",
          price: 1800,
        },
      ],
    },
  });
  const result = await f.read("ID", regions.HOME_FEED_REGIONS[2], "rent", { provider: "redfin" });
  assert.equal(result.homes[0].id, "redfin-123");
  const url = new URL("https://fixture.invalid/" + f.calls[0].path);
  assert.equal(url.pathname, "/search-coordinates");
  assert.equal(url.searchParams.get("ne_lat"), "49.1");
  assert.equal(url.searchParams.get("ne_lng"), "-115.1");
  assert.equal(url.searchParams.get("sw_lat"), "47");
  assert.equal(url.searchParams.get("sw_lng"), "-117.2");
  assert.equal(url.searchParams.has("polygon"), false);
  assert.equal(url.searchParams.get("status"), "for_rent");
  assert.equal(url.searchParams.get("num_homes"), "350");
  assert.equal(url.searchParams.has("home_status"), false);
  assert.equal(f.calls[0].options.provider, "redfin");
});
test("an inactive Redfin subscription cannot reserve or spend requests", async () => {
  const f = fixture({}, false);
  assert.equal(
    (await f.read("ID", regions.HOME_FEED_REGIONS[2], "buy", { provider: "redfin" })).status,
    "unavailable",
  );
  assert.equal(f.calls.length, 0);
});

test("coordinate search keys cannot reuse the empty Redfin polygon response", () => {
  const declaration = source.statements.find(
    (node) =>
      ts.isVariableStatement(node) &&
      node.declarationList.declarations.some((d) => d.name.getText(source) === "areaSearchKey"),
  );
  const exports = {};
  vm.runInNewContext(
    ts.transpile(declaration.getText(source) + "\nexports.key=areaSearchKey;", {
      target: ts.ScriptTarget.ES2022,
      module: ts.ModuleKind.CommonJS,
    }),
    { exports },
  );
  for (const provider of ["redfin", "zillow", "realestate"]) {
    const old = JSON.stringify({
      v: 3,
      kind: "area-search",
      state: "ID",
      area: "north-idaho",
      mode: "buy",
      provider,
      page: 1,
    });
    const current = exports.key("ID", "north-idaho", "buy", provider);
    if (provider === "redfin") assert.notEqual(current, old);
    else assert.equal(current, old);
  }
});
