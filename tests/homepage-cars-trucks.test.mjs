import { listingCardSummary } from "../src/lib/listing-card-summary.ts";
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
    listingCardSummary,
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
  assert.deepEqual(JSON.parse(JSON.stringify(lead.motors)), cars);
  assert.equal(home.motors, motors);
  assert.equal(home.categoryCounts.trailers, 1);
  assert.equal(home.categoryCounts["auto-parts"], 1);
});

test("Keep browsing excludes the current full row allocation and deduplicates its remainder", () => {
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
    initial: [
      { id: "promoted-car" },
      { id: "secondary-row-car" },
      { id: "other-item" },
      { id: "other-item" },
    ],
    shownIds: new Set(),
    hasMore: false,
    location: {},
  };
  const before = renderToStaticMarkup(React.createElement(context.HomeFeed, props));
  const after = renderToStaticMarkup(
    React.createElement(context.HomeFeed, {
      ...props,
      shownIds: new Set(["promoted-car", "secondary-row-car"]),
    }),
  );
  assert.match(before, /data-listing="promoted-car"/);
  assert.doesNotMatch(after, /data-listing="promoted-car"/);
  assert.doesNotMatch(after, /data-listing="secondary-row-car"/);
  assert.match(after, /data-listing="other-item"/);
  assert.equal([...after.matchAll(/data-listing="other-item"/g)].length, 1);
  const bounded = renderToStaticMarkup(
    React.createElement(context.HomeFeed, {
      ...props,
      initial: Array.from({ length: 70 }, (_, i) => ({ id: `item-${i}` })),
    }),
  );
  assert.equal([...bounded.matchAll(/data-listing=/g)].length, 24);
  assert.match(bounded, /Load more/);
});

test("Keep browsing reveals local cards before requesting a page and never loses its remainder", async () => {
  const route = readFileSync(new URL("../src/routes/index.tsx", import.meta.url), "utf8");
  const file = ts.createSourceFile(
    "index.tsx",
    route,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TSX,
  );
  const feed = file.statements.find(
    (n) => ts.isFunctionDeclaration(n) && n.name?.text === "HomeFeed",
  );
  const states = [];
  let cursor = 0;
  let requests = 0;
  const context = vm.createContext({
    React,
    useState(initial) {
      const index = cursor++;
      if (!(index in states)) states[index] = initial;
      return [
        states[index],
        (value) => {
          states[index] = typeof value === "function" ? value(states[index]) : value;
        },
      ];
    },
    useServerFn: (fn) => fn,
    browseClassifieds: async () => {
      requests++;
      return { listings: [{ id: "next-page" }], page: 2, pageSize: 24, total: 48 };
    },
    ListingCard: "ListingCard",
    toast: {
      error(message) {
        throw new Error(message);
      },
    },
  });
  vm.runInContext(
    ts.transpile(feed.getText(file), { target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.React }),
    context,
  );
  const props = {
    initial: Array.from({ length: 70 }, (_, i) => ({ id: `item-${i}` })),
    shownIds: new Set(),
    hasMore: true,
    location: {},
  };
  const render = () => {
    cursor = 0;
    return context.HomeFeed(props);
  };
  const nodes = (node) =>
    !node || typeof node !== "object"
      ? []
      : [node, ...React.Children.toArray(node.props?.children).flatMap(nodes)];
  const click = (tree) =>
    nodes(tree)
      .find((n) => n.type === "button")
      .props.onClick();
  const cards = (tree) =>
    nodes(tree)
      .filter((n) => n.type === "ListingCard")
      .map((n) => n.props.listing.id);
  let tree = render();
  assert.equal(cards(tree).length, 24);
  click(tree);
  tree = render();
  assert.equal(cards(tree).length, 48);
  assert.equal(requests, 0);
  click(tree);
  tree = render();
  assert.equal(cards(tree).length, 70);
  assert.equal(requests, 0);
  click(tree);
  await new Promise(setImmediate);
  tree = render();
  assert.equal(requests, 1);
  assert.equal(cards(tree).length, 71);
  assert.ok(cards(tree).includes("next-page"));
  assert.equal(nodes(tree).filter((n) => n.type === "button").length, 0);
});

test("secondary feeds wait for hydration and settled lead without removing SSR lead inventory", () => {
  const source = readFileSync(new URL("../src/routes/index.tsx", import.meta.url), "utf8");
  const file = ts.createSourceFile(
    "index.tsx",
    source,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TSX,
  );
  const fn = file.statements.find(
    (n) => ts.isFunctionDeclaration(n) && n.name?.text === "DeferredHomeSections",
  );
  let hydrated = false;
  let lead = { isSuccess: true, isError: false };
  const context = vm.createContext({
    React,
    Suspense: React.Suspense,
    QueryErrorResetBoundary: ({ children }) => children({ reset: () => {} }),
    HomepageSecondaryErrorBoundary: ({ children }) => children,
    useHydrated: () => hydrated,
    useQuery: (options) => {
      assert.equal(options.enabled, false);
      return lead;
    },
    homeLeadQuery: {},
    HomeSections: () => React.createElement("div", null, "secondary-loaded"),
  });
  vm.runInContext(
    ts.transpile(fn.getText(file), { target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.React }),
    context,
  );
  const render = () =>
    renderToStaticMarkup(React.createElement(context.DeferredHomeSections, { where: {} }));
  assert.doesNotMatch(render(), /secondary-loaded/);
  hydrated = true;
  lead = { isSuccess: false, isError: false };
  assert.doesNotMatch(render(), /secondary-loaded/);
  lead = { isSuccess: true, isError: false };
  assert.match(render(), /secondary-loaded/);
  lead = { isSuccess: false, isError: true };
  assert.match(render(), /secondary-loaded/);
  assert.match(source, /prefetchQuery\(homeLeadQuery\)/);
  assert.doesNotMatch(source, /prefetchQuery\(homeQuery\)/);
});

test("secondary feed errors stay local and can retry or use the server-rendered browse link", () => {
  const source = readFileSync(new URL("../src/routes/index.tsx", import.meta.url), "utf8");
  const file = ts.createSourceFile(
    "index.tsx",
    source,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TSX,
  );
  const declaration = file.statements.find(
    (n) => ts.isClassDeclaration(n) && n.name?.text === "HomepageSecondaryErrorBoundary",
  );
  const compiled = ts.transpile(declaration.getText(file), {
    target: ts.ScriptTarget.ES2022,
    jsx: ts.JsxEmit.React,
  });
  const Boundary = vm.runInNewContext(`${compiled}\nHomepageSecondaryErrorBoundary`, {
    React,
    Component: React.Component,
  });
  let resets = 0;
  const boundary = new Boundary({
    children: "secondary",
    onReset: () => {
      resets++;
    },
  });
  boundary.state = Boundary.getDerivedStateFromError();
  boundary.setState = (patch) => {
    boundary.state = { ...boundary.state, ...patch };
  };
  const tree = boundary.render();
  const html = renderToStaticMarkup(tree);
  assert.match(html, /featured listings above are still available/);
  assert.match(html, /href="\/browse\?allCategories=true"/);
  React.Children.toArray(tree.props.children)
    .find((n) => n.type === "button")
    .props.onClick();
  assert.equal(resets, 1);
  assert.equal(boundary.render(), "secondary");
});


test("lead summaries retain every location-filter candidate without detail-only vehicle payloads", () => {
  const cards = Array.from({ length: 24 }, (_, i) => ({
    id: `car-${i}`, city: `City ${i}`, state: "ID", region: "south-central",
    postalCode: "83301", imageUrl: "https://images.craigslist.org/example_1200x900.jpg",
    title: "Vehicle", price: 10000, vehicle: { year: 2020 }, dealer: { name: "Dealer" },
    externalVehicle: { sourceKind: "dealer", media: { photo_links: Array(100).fill("photo") }, raw: { history: "x".repeat(1000) } },
  }));
  const before = JSON.stringify(cards);
  const summaries = cards.map(listingCardSummary);
  assert.equal(summaries.length, 24);
  for (let i = 0; i < cards.length; i++) {
    const { externalVehicle, ...expected } = cards[i];
    assert.deepEqual(summaries[i], { ...expected, externalVehicle: { sourceKind: externalVehicle.sourceKind } });
  }
  assert.equal(JSON.stringify(cards), before);
  assert.ok(JSON.stringify(summaries).length < before.length / 2);
  assert.deepEqual(listingCardSummary({ id: "native", city: "Boise" }), { id: "native", city: "Boise" });
});
