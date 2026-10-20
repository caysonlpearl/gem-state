import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";
import ts from "typescript";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { classifiedCategories } from "../src/config/classifieds.ts";

const source = readFileSync(
  new URL("../src/lib/classifieds.functions.ts", import.meta.url),
  "utf8",
);
const ast = ts.createSourceFile("functions.ts", source, ts.ScriptTarget.Latest, true);
function loader(name, runBrowseClassifieds) {
  const fn = ast.statements.find((n) => ts.isFunctionDeclaration(n) && n.name?.text === name);
  assert.ok(fn, `Production ${name} exists`);
  const cache = new Map();
  const context = vm.createContext({
    PUBLIC_PAGE_CACHE_MS: 60_000,
    shortCache(key, _ttl, load) {
      if (!cache.has(key)) {
        const pending = load();
        cache.set(key, pending);
        pending.catch(() => cache.delete(key));
      }
      return cache.get(key);
    },
    runBrowseClassifieds,
  });
  vm.runInContext(
    fn
      .getText(ast)
      .replace(
        /const \{ shortCache, PUBLIC_PAGE_CACHE_MS \} = await import\("\.\/short-cache.server"\);/,
        "",
      ),
    context,
  );
  return () => vm.runInContext(`${name}()`, context);
}

test("homepage Cars & Trucks query excludes newer parts and trailers before pagination", async () => {
  const rows = [
    ...Array.from({ length: 40 }, (_, i) => ({
      id: `newer-noise-${i}`,
      categorySlug: i % 2 ? "auto-parts" : "trailers",
      state: "ID",
    })),
    ...Array.from({ length: 5 }, (_, i) => ({
      id: `car-${i}`,
      categorySlug: "cars-trucks",
      state: "ID",
    })),
    { id: "far-car", categorySlug: "cars-trucks", state: "UT" },
  ];
  const calls = [];
  const load = loader("loadClassifiedsHomeCarsTrucks", async (input) => {
    calls.push(input);
    return {
      listings: rows
        .filter(
          (row) =>
            (!input.category || row.categorySlug === input.category) && row.state === input.state,
        )
        .slice(0, 24),
    };
  });
  const [first, second] = await Promise.all([load(), load()]);
  assert.deepEqual(
    first.map((row) => row.id),
    ["car-0", "car-1", "car-2", "car-3", "car-4"],
  );
  assert.equal(first, second);
  assert.deepEqual(JSON.parse(JSON.stringify(calls)), [
    { category: "cars-trucks", state: "ID", sort: "newest", page: 1 },
  ]);
});

test("Cars & Trucks loader preserves empty success, rejects failure and allows retry", async () => {
  let fail = true;
  const load = loader("loadClassifiedsHomeCarsTrucks", async () => {
    if (fail) throw new Error("Synthetic network interruption");
    return { listings: [] };
  });
  await assert.rejects(load(), /Synthetic network interruption/);
  fail = false;
  assert.deepEqual(await load(), []);
});

test("broader Motors taxonomy and query still include parts and trailers", async () => {
  const slugs = classifiedCategories.filter((c) => c.group === "motors").map((c) => c.slug);
  assert.ok(slugs.includes("auto-parts"));
  assert.ok(slugs.includes("trailers"));
  let query;
  const load = loader("loadClassifiedsHomeMotors", async (input) => {
    query = input;
    return { listings: ["cars-trucks", "auto-parts", "trailers"] };
  });
  assert.deepEqual(JSON.parse(JSON.stringify(await load())), [
    "cars-trucks",
    "auto-parts",
    "trailers",
  ]);
  assert.equal(query.group, "motors");
  assert.equal(query.category, undefined);
});

test("featured endpoint uses Cars & Trucks while the secondary homepage endpoint stays broad", async () => {
  const names = ["loadClassifiedsHomeLead", "getClassifiedsHome"];
  const selected = ast.statements.filter(
    (node) =>
      (ts.isFunctionDeclaration(node) && names.includes(node.name?.text)) ||
      (ts.isVariableStatement(node) &&
        node.declarationList.declarations.some(
          (decl) => decl.name.getText(ast) === "getClassifiedsHome",
        )),
  );
  assert.equal(selected.length, 2);
  const cars = [{ id: "featured-car", categorySlug: "cars-trucks" }];
  const motors = [
    { id: "motor-trailer", categorySlug: "trailers" },
    { id: "motor-parts", categorySlug: "auto-parts" },
  ];
  const context = vm.createContext({
    createServerFn: () => ({ handler: (fn) => fn }),
    shortCache: (_key, _ttl, load) => load(),
    PUBLIC_PAGE_CACHE_MS: 0,
    loadClassifiedsHomeCarsTrucks: async () => cars,
    loadClassifiedsHomeMotors: async () => motors,
    loadClassifiedsHomeCategoryData: async () => ({
      totalActive: 3,
      categoryCounts: { trailers: 1, "auto-parts": 1, "cars-trucks": 1 },
    }),
    runBrowseClassifieds: async () => ({ listings: [], total: 0 }),
  });
  const code = selected
    .map((node) => node.getText(ast))
    .join("\n")
    .replaceAll("export ", "")
    .replace(
      /const \{ shortCache, PUBLIC_PAGE_CACHE_MS \} = await import\("\.\/short-cache.server"\);/g,
      "",
    );
  vm.runInContext(ts.transpile(code, { target: ts.ScriptTarget.ES2022 }), context);
  const lead = await vm.runInContext("loadClassifiedsHomeLead()", context);
  const home = await vm.runInContext("getClassifiedsHome()", context);
  assert.equal(lead.motors, cars);
  assert.equal(home.motors, motors);
  assert.equal(home.categoryCounts.trailers, 1);
  assert.equal(home.categoryCounts["auto-parts"], 1);
});

test("a car promoted to the featured row is excluded from already loaded Keep browsing items", () => {
  const route = readFileSync(new URL("../src/routes/index.tsx", import.meta.url), "utf8");
  const file = ts.createSourceFile(
    "index.tsx",
    route,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TSX,
  );
  const feed = file.statements.find(
    (node) => ts.isFunctionDeclaration(node) && node.name?.text === "HomeFeed",
  );
  assert.ok(feed);
  const context = vm.createContext({
    React,
    useState: React.useState,
    useServerFn: (fn) => fn,
    browseClassifieds: () => {
      throw new Error("Unexpected fetch");
    },
    ListingCard: ({ listing }) =>
      React.createElement("span", { "data-listing": listing.id }, listing.id),
  });
  vm.runInContext(
    ts.transpile(feed.getText(file), { target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.React }),
    context,
  );
  const props = {
    initial: [{ id: "promoted-car" }, { id: "other-item" }],
    shownIds: new Set(),
    hasMore: false,
    location: {},
  };
  const before = renderToStaticMarkup(
    React.createElement(context.HomeFeed, { ...props, featuredIds: new Set() }),
  );
  const after = renderToStaticMarkup(
    React.createElement(context.HomeFeed, { ...props, featuredIds: new Set(["promoted-car"]) }),
  );
  assert.match(before, /data-listing="promoted-car"/);
  assert.doesNotMatch(after, /data-listing="promoted-car"/);
  assert.match(after, /data-listing="other-item"/);
});
