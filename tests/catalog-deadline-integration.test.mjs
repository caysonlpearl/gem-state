import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import ts from "typescript";
import { createClient } from "@supabase/supabase-js";
import { withCatalogReadDeadline, CatalogReadTimeoutError } from "../src/lib/catalog-read-deadline.ts";
import { shortCache } from "../src/lib/short-cache.server.ts";

function declaration(path, name) {
  const source = readFileSync(new URL(path, import.meta.url), "utf8");
  const file = ts.createSourceFile(path, source, ts.ScriptTarget.Latest, true);
  const node = file.statements.find((node) => ts.isFunctionDeclaration(node) && node.name?.text === name);
  assert.ok(node);
  return node.getText(file);
}
function run(source, scope, entry) {
  return vm.runInNewContext(ts.transpile(source, { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 }) + `\n${entry}`, scope);
}
function mockClient(fetch) {
  return createClient("https://catalog.mock.test", "mock-key", { auth: { persistSession: false }, global: { fetch } });
}
const bounded = (query) => withCatalogReadDeadline(query, 10);
const hang = (signal) => new Promise((_resolve, reject) => signal.addEventListener("abort", () => reject(signal.reason), { once: true }));


test("homepage counts deadline is not cached as a zero count", async () => {
  let calls = 0;
  const db = mockClient(async (_url, init) => ++calls === 1 ? hang(init.signal) : Response.json([{ products: { categories: { slug: "cars-trucks" } } }]));
  const counts = run(declaration("../src/lib/classifieds.functions.ts", "loadClassifiedsHomeCategoryData"), {
    Date, publicServerClient: () => db, withCatalogReadDeadline: bounded,
    require: () => ({ shortCache: (key, ttl, load) => shortCache(`deadline-test-${key}`, ttl, load), PUBLIC_PAGE_CACHE_MS: 60000 }),
  }, "loadClassifiedsHomeCategoryData");
  await assert.rejects(counts(), CatalogReadTimeoutError);
  const result = await counts();
  assert.equal(result.totalActive, 1);
  assert.equal(result.categoryCounts["cars-trucks"], 1);
});

test("RescueGroups cache deadline rejects before reservation, provider or cache writes", async () => {
  const methods = [];
  const db = mockClient(async (_url, init) => { methods.push(init.method); return hang(init.signal); });
  const pets = run(declaration("../src/lib/rescuegroups.server.ts", "centerPets"), {
    cacheDb: () => db, apiKey: () => "mock-key", withCatalogReadDeadline: bounded,
  }, "centerPets");
  await assert.rejects(pets({ key: "mock-center" }), CatalogReadTimeoutError);
  assert.deepEqual(methods, ["GET"]);
});
