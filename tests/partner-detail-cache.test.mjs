import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import ts from "typescript";
import { createClient } from "@supabase/supabase-js";
import { withCatalogReadDeadline } from "../src/lib/catalog-read-deadline.ts";
import { homesFromSavedSearches } from "../src/lib/openwebninja-cache.ts";

function compile(file, name, globals) {
  const source = ts.createSourceFile(
    file,
    readFileSync(new URL(file, import.meta.url), "utf8"),
    ts.ScriptTarget.Latest,
    true,
  );
  const node = source.statements.find(
    (item) => ts.isFunctionDeclaration(item) && item.name?.text === name,
  );
  assert.ok(node);
  const exports = {};
  vm.runInNewContext(
    ts.transpile(node.getText(source) + `\nexports.subject = ${name};`, {
      target: ts.ScriptTarget.ES2022,
      module: ts.ModuleKind.CommonJS,
    }),
    { exports, withCatalogReadDeadline, ...globals },
  );
  return exports.subject;
}
function database(read) {
  return createClient("https://fixture.invalid", "fixture-only", {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { fetch: async (url, init) => read(new URL(url), init) },
  });
}
const date = (days) => new Date(Date.now() + days * 86400000).toISOString();

test("home details select only matching live source feeds while browse retains the statewide query", async () => {
  const requests = [],
    cacheKeys = [];
  const rows = [
    {
      cache_key: '{"kind":"area-search","mode":"buy"}',
      expires_at: date(1),
      payload: { homes: [{ id: "123", city: "Pocatello", state: "ID", mode: "buy" }] },
    },
    {
      cache_key: '{"kind":"search","mode":"rent"}',
      expires_at: date(2),
      payload: { homes: [{ id: "123", city: "Pocatello", state: "ID", mode: "rent" }] },
    },
    {
      cache_key: '{"kind":"search","mode":"buy"}',
      expires_at: date(1),
      payload: { homes: [{ id: "456", city: "Boise", state: "ID", mode: "buy" }] },
    },
    {
      cache_key: '{"kind":"search","mode":"rent"}',
      expires_at: date(-1),
      payload: { homes: [{ id: "789", city: "Boise", state: "ID", mode: "rent" }] },
    },
  ];
  const db = database((url) => {
    requests.push(url);
    const contains = url.searchParams.get("payload");
    const id = contains ? JSON.parse(contains.slice(3)).homes[0].id : null;
    return Response.json(
      id ? rows.filter((row) => row.payload.homes.some((home) => home.id === id)) : rows,
    );
  });
  const read = compile("../src/lib/openwebninja.server.ts", "cachedHomes", {
    cacheDb: () => db,
    PUBLIC_PAGE_CACHE_MS: 60000,
    shortCache: (key, ttl, load) => {
      cacheKeys.push(key);
      return load();
    },
    homesFromSavedSearches,
  });
  const scoped = await read("123");
  assert.equal(scoped.length, 1);
  assert.equal(scoped[0].id, "123");
  assert.equal(scoped[0].mode, "rent", "newest live copy still wins when a home changes mode");
  const all = await read();
  assert.deepEqual(
    Array.from(all, (home) => home.id),
    ["123", "456"],
  );
  assert.equal(requests[0].searchParams.get("payload"), 'cs.{"homes":[{"id":"123"}]}');
  assert.equal(requests[1].searchParams.has("payload"), false);
  for (const url of requests) {
    assert.equal(url.searchParams.get("cache_key"), 'like.%search"%');
    assert.ok(url.searchParams.get("expires_at").startsWith("gt."));
    assert.equal(url.searchParams.get("order"), "expires_at.desc");
    assert.equal(url.searchParams.get("limit"), "100");
  }
  assert.notEqual(cacheKeys[0], cacheKeys[1]);
});

test("home detail visibility lookup passes its exact ID into the scoped read", async () => {
  const ids = [];
  const home = { id: "123", city: "Pocatello", state: "ID", mode: "buy" };
  const read = compile("../src/lib/openwebninja.server.ts", "cachedHome", {
    cachedHomes: async (id) => {
      ids.push(id);
      return [home];
    },
  });
  assert.equal((await read("123")).home.id, "123");
  assert.deepEqual(ids, ["123"]);
});

test("vehicle fallback scopes source kind and provider ID before returning cache payloads", async () => {
  let request;
  const listing = { providerId: "VIN123", heading: "Saved vehicle" };
  const db = database((url, init) => {
    request = url;
    assert.equal(init.method, "GET");
    return Response.json([
      { cache_key: '{"v":1,"kind":"fsbo"}', payload: { listings: [listing] } },
    ]);
  });
  const read = compile("../src/lib/marketcheck.server.ts", "cachedSearchListing", {
    cacheDb: () => db,
    repairCachedListing: (value, kind) => ({ ...value, kind }),
    MarketCheckLookupError: class extends Error {},
  });
  const result = await read("fsbo", "VIN123");
  assert.equal(result.providerId, "VIN123");
  assert.equal(result.kind, "fsbo");
  assert.equal(request.searchParams.get("cache_key"), 'like.%"kind":"fsbo"%');
  assert.equal(request.searchParams.get("payload"), 'cs.{"listings":[{"providerId":"VIN123"}]}');
  assert.equal(request.searchParams.get("limit"), "100");
});

test("vehicle cache failures remain temporary errors without retries or provider fallthrough", async () => {
  for (const name of ["cachedOnly", "cachedSearchListing"]) {
    let requests = 0;
    const db = database(() => {
      requests++;
      return Response.json({ message: "offline" }, { status: 503 });
    });
    const read = compile("../src/lib/marketcheck.server.ts", name, {
      cacheDb: () => db,
      MarketCheckLookupError: class extends Error {},
    });
    await assert.rejects(read("fsbo", "VIN123"), /unavailable/);
    assert.equal(requests, 1);
  }
});
