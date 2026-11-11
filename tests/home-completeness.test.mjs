import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import ts from "typescript";
import { createClient } from "@supabase/supabase-js";
import { withCatalogReadDeadline } from "../src/lib/catalog-read-deadline.ts";
import { hasCompleteHomeDetails } from "../src/lib/openwebninja-cache.ts";
import * as contract from "../src/lib/openwebninja-contract.ts";
const full = {
  images: ["https://example.com/a.jpg", "https://example.com/b.jpg"],
  description: "A complete property description.",
  bedrooms: 3,
  bathrooms: 2,
  squareFeet: 1500,
  yearBuilt: 2001,
};
test("homes require multiple unique photos, a description and property specifications", () => {
  assert.equal(hasCompleteHomeDetails(full), true);
  for (const value of [
    null,
    {},
    { ...full, images: [] },
    { ...full, images: [full.images[0]] },
    { ...full, images: [full.images[0], full.images[0]] },
    { ...full, description: "  " },
    { ...full, bedrooms: null, bathrooms: null, squareFeet: null },
    { ...full, bedrooms: "3", bathrooms: "2", squareFeet: "1500", yearBuilt: null },
  ])
    assert.equal(hasCompleteHomeDetails(value), false);
});
function compileFunction(file, name, globals) {
  const source = ts.createSourceFile(
    file,
    readFileSync(new URL(file, import.meta.url), "utf8"),
    ts.ScriptTarget.Latest,
    true,
  );
  const node = source.statements.find(
    (item) => ts.isFunctionDeclaration(item) && item.name?.text === name,
  );
  const exports = {};
  vm.runInNewContext(
    ts.transpile(node.getText(source) + `\nexports.read = ${name};`, {
      target: ts.ScriptTarget.ES2022,
      module: ts.ModuleKind.CommonJS,
    }),
    { exports, ...globals },
  );
  return exports.read;
}
test("bulk eligibility accepts legacy detail keys and omits incomplete, malformed and failed reads", async () => {
  let fail = false;
  const db = createClient("https://fixture.invalid", "fixture-key", {
    auth: { persistSession: false },
    global: {
      fetch: async (url, init) => {
        assert.equal(init.method, "GET");
        assert.equal(new URL(url).searchParams.get("cache_key"), 'like.%"kind":"property"%');
        return fail
          ? Response.json({ message: "offline" }, { status: 503 })
          : Response.json([
              { cache_key: '{"v":1,"kind":"property","id":"1"}', ...full },
              { cache_key: '{"v":3,"kind":"property","id":"2"}', ...full, description: null },
              { cache_key: "not-json", ...full },
            ]);
      },
    },
  });
  const read = compileFunction("../src/lib/openwebninja.server.ts", "completeHomeDetailIds", {
    cacheDb: () => db,
    withCatalogReadDeadline,
    hasCompleteHomeDetails,
    shortCache: (_key, _ttl, load) => load(),
    PUBLIC_PAGE_CACHE_MS: 60000,
  });
  assert.deepEqual(Array.from(await read()), ["1"]);
  fail = true;
  await assert.rejects(read(), /temporarily unavailable/);
});
test("direct home links reject previews; complete homes keep photos, descriptions and specifications", async () => {
  let extra = null;
  let providerCalls = 0;
  const provider = {
    searchHomesArea: () => {
      throw new Error("Unexpected search");
    },
    cachedHome: async () => ({
      home: {
        id: "1",
        address: "1 Main St",
        city: "Boise",
        state: "ID",
        mode: "buy",
        priceCents: 40000000,
        beds: 3,
        baths: 2,
        sqft: 1500,
        imageUrl: full.images[0],
      },
    }),
    propertyDetails: async (_id, _url, options) => {
      assert.equal(options.cacheOnly, true);
      if (!options.cacheOnly) providerCalls++;
      return extra ? { ok: true, value: extra } : { ok: false, status: "limited" };
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
      require(name) {
        if (name === "./openwebninja.server") return provider;
        if (name === "./openwebninja-contract") return contract;
        if (name === "./openwebninja-cache") return { hasCompleteHomeDetails };
        if (name === "./landing-card-pool") return {};
        throw new Error(name);
      },
    },
  );
  assert.equal(await exports.openWebNinjaDetail("openwebninja-1"), null);
  extra = { ...full, description: null };
  assert.equal(await exports.openWebNinjaDetail("openwebninja-1"), null);
  extra = full;
  const listing = await exports.openWebNinjaDetail("openwebninja-1");
  assert.equal(listing.images.length, 2);
  assert.equal(listing.description, full.description);
  assert.equal(listing.home.yearBuilt, 2001);
  assert.equal(providerCalls, 0);
});
