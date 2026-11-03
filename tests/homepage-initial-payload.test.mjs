import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import ts from "typescript";
import React from "react";
import {
  allocateHomepageRows,
  initialHomepagePayload,
  homepageFeedPage,
} from "../src/lib/homepage-initial-payload.ts";
import { homepagePayload, HOME_MAX_STALE_MS } from "../src/lib/homepage-snapshot-contract.ts";

const card = (id, categorySlug = "general", details = {}) => ({
  id,
  title: id,
  categorySlug,
  priceCents: 5000,
  state: "ID",
  city: "Boise",
  createdAt: "2026-10-30T00:00:00Z",
  ...details,
});
function inventory() {
  const motors = Array.from({ length: 200 }, (_, i) =>
    card(`car-${i}`, "cars-trucks", {
      vehicle: { bodyStyle: i % 2 ? "SUV" : "Sedan" },
      priceCents: (200 - i) * 1000,
    }),
  );
  const goods = Array.from({ length: 300 }, (_, i) => card(`toy-${i}`, "collectibles"));
  const home = {
    totalActive: 1000,
    categoryCounts: { general: 300, jobs: 100 },
    motors,
    recent: [
      ...goods,
      ...Array.from({ length: 90 }, (_, i) =>
        card(`home-${i}`, "other-real-estate", {
          home: { mode: ["buy", "rent", "build"][i % 3] },
        }),
      ),
      ...Array.from({ length: 100 }, (_, i) =>
        card(`job-${i}`, "jobs", {
          job: { employmentType: i % 2 ? "Full-time" : "Part-time" },
        }),
      ),
      ...Array.from({ length: 100 }, (_, i) =>
        card(`service-${i}`, "services", {
          service: { subcategory: i % 2 ? "Home repair" : "Photography" },
        }),
      ),
      ...Array.from({ length: 100 }, (_, i) => card(`pet-${i}`, "pets", { pet: {} })),
      ...motors.slice(0, 20),
      card("foreign", "general", { state: "UT" }),
    ],
    onlineMerchandise: ["outdoor-sporting", "apparel-accessories", "tools-equipment"].flatMap(
      (category) =>
        Array.from({ length: 40 }, (_, i) =>
          card(`${category}-${i}`, category, {
            externalMerchandise: { source: "Retailer" },
          }),
        ),
    ),
  };
  return { home, lead: { motors: motors.slice(0, 24), totalActive: 1000, categoryCounts: {} } };
}
function visibleAllocation(rows) {
  return Object.fromEntries(
    Object.entries(rows)
      .filter(([key]) => key !== "shownIds")
      .map(([key, value]) => [
        key,
        key === "distanceRow"
          ? { ...value, listings: value.listings.slice(0, 4).map((c) => c.id) }
          : value.slice(0, key === "feedStart" ? 24 : 4).map((c) => c.id),
      ]),
  );
}

test("initial transport preserves every allocated row and first feed page, without truncating stored pools", () => {
  const { home, lead } = inventory();
  const before = JSON.stringify(home);
  const full = allocateHomepageRows(home, lead);
  const projected = initialHomepagePayload(home, lead);
  assert.deepEqual(
    visibleAllocation(allocateHomepageRows(projected, lead)),
    visibleAllocation(full),
  );
  assert.equal(JSON.stringify(home), before);
  assert.deepEqual(projected.categoryCounts, home.categoryCounts);
  assert.equal(projected.totalActive, home.totalActive);
  assert.equal(projected.nativeFeedHasMore, true);
  assert.equal(projected.cachedFeedHasMore, true);
  assert.ok(
    JSON.stringify(projected).length < before.length / 5,
    "omit unused candidates, not visible cards",
  );
  assert.equal(allocateHomepageRows(projected, lead).feedStart.length, 24);
  for (const category of ["outdoor-sporting", "apparel-accessories", "tools-equipment"])
    assert.equal(projected.onlineMerchandise.filter((c) => c.categorySlug === category).length, 4);
});

test("cached continuation reaches every remaining Idaho card once across page boundaries", () => {
  const { home, lead } = inventory();
  const allocated = allocateHomepageRows(home, lead);
  const initial = allocated.feedStart.slice(0, 24);
  const excluded = new Set([...allocated.shownIds, ...initial.map((c) => c.id)]);
  const seen = initial.map((c) => c.id);
  let pages = 0;
  while (true) {
    const page = homepageFeedPage(home, [...excluded]);
    assert.ok(page.listings.length <= 24);
    for (const c of page.listings) {
      assert.equal(excluded.has(c.id), false);
      assert.equal(c.state, "ID");
      excluded.add(c.id);
      seen.push(c.id);
    }
    pages++;
    if (!page.hasMore) break;
    assert.ok(pages < 100);
  }
  assert.ok(pages > 20);
  assert.deepEqual(
    seen,
    allocated.feedStart.map((c) => c.id),
  );
  assert.equal(new Set(seen).size, seen.length);
  assert.deepEqual(homepageFeedPage(home, [...excluded]), { listings: [], hasMore: false });
});

test("empty, sparse and expired sources stay honest in both initial and continuation responses", () => {
  const now = Date.now();
  const snapshot = {
    version: 1,
    generatedAt: now,
    sections: {
      native: { updatedAt: now, cards: [card("one")], total: 1 },
      jobs: {
        updatedAt: now - HOME_MAX_STALE_MS - 1,
        cards: [card("expired", "jobs", { job: {} })],
      },
    },
  };
  const { home, lead } = homepagePayload(snapshot, now);
  const initial = initialHomepagePayload(home, lead);
  assert.equal(initial.cachedFeedHasMore, false);
  assert.equal(initial.nativeFeedHasMore, false);
  assert.equal(JSON.stringify(initial).includes("expired"), false);
  assert.deepEqual(homepageFeedPage(home, ["one"]), { listings: [], hasMore: false });
  const empty = homepagePayload({ version: 1, generatedAt: now, sections: {} }, now);
  assert.deepEqual(initialHomepagePayload(empty.home, empty.lead).recent, []);
});

test("a refreshed snapshot excludes already displayed cards and can supply newly available ones", () => {
  const { home } = inventory();
  const first = homepageFeedPage(home, []);
  const next = homepageFeedPage(
    { ...home, recent: [card("new-arrival"), ...home.recent] },
    first.listings.map((c) => c.id),
  );
  assert.equal(next.listings[0].id, "new-arrival");
  assert.ok(next.listings.every((c) => !first.listings.some((old) => old.id === c.id)));
});

test("actual homepage continuation handler reads one saved snapshot and rejects oversized inputs before reading", async () => {
  const source = readFileSync(
    new URL("../src/lib/classifieds.functions.ts", import.meta.url),
    "utf8",
  );
  const file = ts.createSourceFile("functions.ts", source, ts.ScriptTarget.Latest, true);
  const node = file.statements.find(
    (n) =>
      ts.isVariableStatement(n) &&
      n.declarationList.declarations.some((d) => d.name.getText(file) === "getClassifiedsHomeFeed"),
  );
  const { home } = inventory();
  let reads = 0;
  const c = vm.createContext({
    createServerFn: ({ method }) => {
      assert.equal(method, "POST", "large exclusion lists must not become oversized URLs");
      let validate = (input) => input;
      return {
        validator(fn) {
          validate = fn;
          return this;
        },
        handler(fn) {
          return (input) => fn({ data: validate(input) });
        },
      };
    },
    deps: {
      store: {
        readHomepageSnapshot: async () => {
          reads++;
          return {};
        },
      },
      contract: { homepagePayload: () => ({ home }) },
      projection: { homepageFeedPage },
    },
  });
  const executable = node
    .getText(file)
    .replace(/^export /, "")
    .replace(/import\("\.\/homepage-snapshot.server"\)/g, "Promise.resolve(deps.store)")
    .replace(/import\("\.\/homepage-snapshot-contract"\)/g, "Promise.resolve(deps.contract)")
    .replace(/import\("\.\/homepage-initial-payload"\)/g, "Promise.resolve(deps.projection)");
  vm.runInContext(
    ts.transpile(executable, { target: ts.ScriptTarget.ES2022 }) +
      ";globalThis.run = getClassifiedsHomeFeed",
    c,
  );
  for (const input of [
    null,
    { excludeIds: "all" },
    { excludeIds: Array(2001).fill("id") },
    { excludeIds: ["x".repeat(201)] },
    { excludeIds: [null] },
  ])
    assert.throws(() => c.run(input), /Invalid homepage continuation/);
  assert.equal(reads, 0);
  const result = await c.run({ excludeIds: ["toy-0"] });
  assert.equal(reads, 1);
  assert.equal(result.listings.length, 24);
  assert.equal(result.listings[0].id, "toy-1");
});

test("actual HomeFeed loads cached pages before browse, excludes rows, and retries an interrupted cache read", async () => {
  const source = readFileSync(new URL("../src/routes/index.tsx", import.meta.url), "utf8");
  const ast = ts.createSourceFile(
    "index.tsx",
    source,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TSX,
  );
  const fn = ast.statements.find((n) => ts.isFunctionDeclaration(n) && n.name?.text === "HomeFeed");
  const states = [];
  let cursor = 0,
    cached = 0,
    browsed = 0,
    failures = 0,
    fail = true;
  const c = vm.createContext({
    React,
    useServerFn: (fn) => fn,
    ListingCard: "ListingCard",
    useState(initial) {
      const i = cursor++;
      if (!(i in states)) states[i] = initial;
      return [
        states[i],
        (v) => {
          states[i] = typeof v === "function" ? v(states[i]) : v;
        },
      ];
    },
    getClassifiedsHomeFeed: async ({ data }) => {
      cached++;
      assert.ok(data.excludeIds.includes("row-card"));
      assert.ok(data.excludeIds.includes("feed-0"));
      if (fail) {
        fail = false;
        throw new Error("Temporary read failure");
      }
      return { listings: [card("cached-next")], hasMore: false };
    },
    browseClassifieds: async ({ data }) => {
      browsed++;
      assert.equal(data.page, 2);
      return { listings: [card("native-next")], page: 2, pageSize: 24, total: 48 };
    },
    toast: {
      error() {
        failures++;
      },
    },
  });
  vm.runInContext(
    ts.transpile(fn.getText(ast), { target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.React }),
    c,
  );
  const props = {
    initial: [card("feed-0")],
    shownIds: new Set(["row-card"]),
    hasMore: true,
    cachedHasMore: true,
    location: {},
  };
  const nodes = (n) =>
    !n || typeof n !== "object"
      ? []
      : [n, ...React.Children.toArray(n.props?.children).flatMap(nodes)];
  const render = () => {
    cursor = 0;
    return c.HomeFeed(props);
  };
  const click = async () => {
    nodes(render())
      .find((n) => n.type === "button")
      .props.onClick();
    await new Promise(setImmediate);
  };
  await click();
  assert.equal(failures, 1);
  assert.equal(browsed, 0);
  await click();
  assert.equal(cached, 2);
  assert.equal(browsed, 0);
  assert.ok(nodes(render()).some((n) => n.props?.listing?.id === "cached-next"));
  await click();
  assert.equal(browsed, 1);
  assert.ok(nodes(render()).some((n) => n.props?.listing?.id === "native-next"));
  assert.equal(nodes(render()).filter((n) => n.type === "button").length, 0);
});
