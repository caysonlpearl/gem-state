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
    ts.transpile(
      fn
        .getText(ast)
        .replace(
          /const \{ shortCache, PUBLIC_PAGE_CACHE_MS \} = await import\("\.\/short-cache.server"\);/,
          "",
        ),
      { target: ts.ScriptTarget.ES2022 },
    ),
    context,
  );
  return (timings) => {
    context.timings = timings;
    return vm.runInContext(`${name}(timings)`, context);
  };
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
  const load = loader("loadClassifiedsHomeCarsTrucks", async (input, options) => {
    assert.equal(options.includeExactCount, false);
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

test("both homepage endpoints use saved snapshots, keeping Cars & Trucks distinct from other motors", async () => {
  const { homepagePayload } = await import("../src/lib/homepage-snapshot-contract.ts");
  const now = Date.now();
  const cars = [
    {
      id: "featured-car",
      categorySlug: "cars-trucks",
      state: "ID",
      vehicle: {},
      createdAt: "2026-10-30",
      isFeatured: false,
    },
  ];
  const motors = [
    {
      id: "motor-trailer",
      categorySlug: "trailers",
      state: "ID",
      vehicle: {},
      createdAt: "2026-10-30",
      isFeatured: false,
    },
  ];
  const payload = homepagePayload(
    {
      version: 1,
      generatedAt: now,
      sections: { native: { updatedAt: now, cards: [...cars, ...motors] } },
    },
    now,
  );
  assert.deepEqual(
    payload.lead.motors.map((c) => c.id),
    ["featured-car"],
  );
  assert.deepEqual(payload.home.motors.map((c) => c.id).sort(), ["featured-car", "motor-trailer"]);
  const endpointSource = source.slice(source.indexOf("export const getClassifiedsHomeLead"));
  assert.match(endpointSource, /readHomepageSnapshot/);
  assert.doesNotMatch(endpointSource, /runBrowseClassifieds|loadClassifiedsHomeCategoryData/);
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

test("secondary cached feeds load independently of a slow or failed lead", () => {
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
  const queries = [];
  const context = vm.createContext({
    React,
    Suspense: React.Suspense,
    QueryErrorResetBoundary: ({ children }) => children({ reset: () => {} }),
    HomepageSecondaryErrorBoundary: ({ children }) => children,
    useHydrated: () => hydrated,
    useQuery: (options) => {
      queries.push(options);
      return lead;
    },
    homeLeadQuery: {},
    homeQuery: { queryKey: ["secondary"] },
    HomeSections: () => React.createElement("div", null, "secondary-loaded"),
  });
  vm.runInContext(
    ts.transpile(fn.getText(file), { target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.React }),
    context,
  );
  const render = (leadPainted = false) =>
    renderToStaticMarkup(
      React.createElement(context.DeferredHomeSections, { where: {}, leadPainted }),
    );
  assert.doesNotMatch(render(), /secondary-loaded/);
  assert.equal(queries.at(-1).enabled, false);
  hydrated = true;
  lead = { isSuccess: false, isError: false };
  assert.match(render(), /secondary-loaded/);
  lead = { isSuccess: true, isError: false };
  assert.match(render(), /secondary-loaded/);
  assert.equal(
    queries.at(-1).enabled,
    true,
    "data starts loading while the first photo is still pending",
  );
  assert.match(render(true), /secondary-loaded/);
  lead = { isSuccess: false, isError: true };
  assert.match(render(), /secondary-loaded/);
  assert.match(source, /prefetchQuery\(homeLeadQuery\)/);
  assert.match(source, /prefetchQuery\(homeQuery\)/);
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
    id: `car-${i}`,
    city: `City ${i}`,
    state: "ID",
    region: "south-central",
    postalCode: "83301",
    imageUrl: "https://images.craigslist.org/example_1200x900.jpg",
    title: "Vehicle",
    price: 10000,
    vehicle: { year: 2020 },
    dealer: { name: "Dealer" },
    externalVehicle: {
      sourceKind: "dealer",
      media: { photo_links: Array(100).fill("photo") },
      raw: { history: "x".repeat(1000) },
    },
  }));
  const before = JSON.stringify(cards);
  const summaries = cards.map(listingCardSummary);
  assert.equal(summaries.length, 24);
  for (let i = 0; i < cards.length; i++) {
    const { externalVehicle, ...expected } = cards[i];
    assert.deepEqual(summaries[i], {
      ...expected,
      externalVehicle: { sourceKind: externalVehicle.sourceKind },
    });
  }
  assert.equal(JSON.stringify(cards), before);
  assert.ok(JSON.stringify(summaries).length < before.length / 2);
  assert.deepEqual(listingCardSummary({ id: "native", city: "Boise" }), {
    id: "native",
    city: "Boise",
  });
});

test("homepage timing observations do not leak cached build timings into warm requests", async () => {
  const load = loader("loadClassifiedsHomeCarsTrucks", async (_input, options) => {
    options.timingsMs.vehicleRead = 7;
    return { listings: [{ id: "car" }] };
  });
  const cold = {};
  const warm = {};
  const first = await load(cold);
  const second = await load(warm);
  assert.equal(first, second);
  assert.deepEqual(cold, { vehicleRead: 7 });
  assert.deepEqual(warm, {});
});

test("joining in-flight homepage work does not receive another caller's build timings", async () => {
  let finish;
  const gate = new Promise((resolve) => {
    finish = resolve;
  });
  const load = loader("loadClassifiedsHomeCarsTrucks", async (_input, options) => {
    await gate;
    options.timingsMs.vehicleRead = 9;
    return { listings: [{ id: "car" }] };
  });
  const owner = {};
  const joined = {};
  const a = load(owner);
  const b = load(joined);
  finish();
  const [first, second] = await Promise.all([a, b]);
  assert.equal(first, second);
  assert.deepEqual(owner, { vehicleRead: 9 });
  assert.deepEqual(joined, {});
});

test("lead render failures release the secondary feed instead of waiting forever", () => {
  const source = readFileSync(new URL("../src/routes/index.tsx", import.meta.url), "utf8");
  const file = ts.createSourceFile(
    "index.tsx",
    source,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TSX,
  );
  const node = file.statements.find(
    (n) => ts.isClassDeclaration(n) && n.name?.text === "HomepageLeadErrorBoundary",
  );
  const context = vm.createContext({ Component: React.Component });
  vm.runInContext(
    ts.transpile(node.getText(file), { target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.React }) +
      ";globalThis.Boundary = HomepageLeadErrorBoundary;",
    context,
  );
  let releases = 0;
  const boundary = new context.Boundary({ onUnavailable: () => releases++ });
  boundary.componentDidCatch(new Error("Synthetic render failure"));
  assert.equal(releases, 1);
});
