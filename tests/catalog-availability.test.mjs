import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import ts from "typescript";
import { createRootRoute, createRoute, createRouter, createMemoryHistory } from "@tanstack/react-router";
import { getSsrStatus } from "@tanstack/router-core/ssr/server";
import { requireReliableIndexing } from "../src/lib/catalog-availability.ts";
import { shortCache } from "../src/lib/short-cache.server.ts";
const read = (path) => readFileSync(new URL(path, import.meta.url), "utf8");
function extract(path, name) {
  const file = ts.createSourceFile(path, read(path), ts.ScriptTarget.Latest, true);
  return file.statements.find((node) => ts.isFunctionDeclaration(node) && node.name?.text === name).getText(file).replace(/^export /, "");
}

test("genuine empty inventory remains noindex, unavailable inventory rejects, healthy partial inventory remains usable", () => {
  assert.doesNotThrow(() => requireReliableIndexing(false, false));
  assert.throws(() => requireReliableIndexing(false, true), /temporarily unavailable/);
  assert.doesNotThrow(() => requireReliableIndexing(true, true));
  assert.doesNotThrow(() => requireReliableIndexing(true, false));
});

test("an unavailable thin result is evicted rather than cached as a noindex page", async () => {
  let calls = 0;
  const load = async () => {
    calls++;
    requireReliableIndexing(calls > 1, calls === 1);
    return { total: 50, indexable: true };
  };
  await assert.rejects(shortCache("availability-retry", 60000, load), /temporarily unavailable/);
  assert.equal((await shortCache("availability-retry", 60000, load)).total, 50);
  assert.equal(calls, 2);
});

test("the actual landing fetch retains source failure across multiple pages", async () => {
  const source = extract("../src/lib/place-pages.functions.ts", "fetchListings");
  let calls = 0;
  const fetchListings = vm.runInNewContext(ts.transpile(`(${source})`, { target: ts.ScriptTarget.ES2022 }), {
    MAX_PAGES: 8,
    browseClassifieds: async () => ({ listings: [{ id: ++calls }], total: 48, pageSize: 24, incomplete: calls === 1 }),
  });
  const result = await fetchListings({ state: "ID" });
  assert.equal(result.incomplete, true);
  assert.equal(result.listings.length, 2);
  assert.equal(calls, 2);
});

test("the actual jobs adapter distinguishes provider failure from successful empty results", async () => {
  const source = extract("../src/lib/adzuna-listings.server.ts", "adzunaCards")
    .replace('import("./adzuna.server")', "Promise.resolve({ searchJobs: mockSearchJobs })")
    .replace('import("./employer-logos.server")', "Promise.resolve({ withEmployerLogos: async (cards) => cards })");
  for (const status of ["ok", "unavailable", "limited"]) {
    const reports = [];
    const adapter = vm.runInNewContext(ts.transpile(`(${source})`, { target: ts.ScriptTarget.ES2022 }), {
      usStates: [["ID", "Idaho"]], categories: {}, adzunaCard: (job) => job,
      notePartnerEmployers: async () => {}, removedPartnerJobIds: async () => new Set(),
      mockSearchJobs: async () => ({ status, jobs: [], total: 0 }),
    });
    const cards = await adapter({ city: "Twin Falls", state: "ID" }, (value) => reports.push(value));
    assert.equal(cards.length, 0);
    assert.deepEqual(reports, [status]);
  }
});

test("both place and vehicle gates reject unreliable thin inventory and browse reports native errors", () => {
  const place = read("../src/lib/place-pages.functions.ts");
  assert.equal((place.match(/requireReliableIndexing\(indexable, main\.incomplete\)/g) ?? []).length, 2);
  const browse = read("../src/lib/classifieds.functions.ts");
  assert.match(browse, /incomplete: Boolean\(error\) \|\| jobsUnavailable/);
  assert.match(browse, /jobsUnavailable = status !== "ok"/);
  assert.doesNotMatch(browse, /failed; showing preview fixtures/);
});

test("the installed server router returns 500 for unavailable inventory rather than successful empty HTML", async () => {
  const root = createRootRoute();
  const route = createRoute({ getParentRoute: () => root, path: "/availability-test", loader: () => requireReliableIndexing(false, true) });
  const router = createRouter({ routeTree: root.addChildren([route]), history: createMemoryHistory({ initialEntries: ["/availability-test"] }), isServer: true });
  await router.load();
  assert.equal(getSsrStatus(router), 500);
});
