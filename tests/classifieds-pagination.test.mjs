import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import ts from "typescript";
import {
  normalizeBrowsePage,
  assertNextBrowsePage,
  appendBrowseListings,
} from "../src/lib/classifieds-pagination.ts";
import { isOutOfRangePage, canonicalPagePath } from "../src/lib/seo-policy.ts";

const serverSource = readFileSync(
  new URL("../src/lib/classifieds.functions.ts", import.meta.url),
  "utf8",
);
const routeSource = readFileSync(new URL("../src/routes/browse.tsx", import.meta.url), "utf8");
const sourceNode = (source, predicate) => {
  const file = ts.createSourceFile(
    "fixture.tsx",
    source,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TSX,
  );
  let found;
  function visit(node) {
    if (!found && predicate(node)) found = node;
    if (!found) ts.forEachChild(node, visit);
  }
  visit(file);
  assert.ok(found, "production declaration must exist");
  return found.getText(file);
};
const declaration = (source, name) =>
  sourceNode(source, (node) => ts.isFunctionDeclaration(node) && node.name?.text === name);
const validator = sourceNode(
  serverSource,
  (node) => ts.isVariableDeclaration(node) && node.name.getText() === "browseClassifieds",
);
const loadMore = declaration(routeSource, "loadMore");
const searchValidator = sourceNode(
  routeSource,
  (node) => ts.isPropertyAssignment(node) && node.name.getText() === "validateSearch",
).replace(/^validateSearch:\s*/, "");
const runner = declaration(serverSource, "runBrowseClassifieds");
const loader = sourceNode(
  routeSource,
  (node) => ts.isPropertyAssignment(node) && node.name.getText() === "loader",
).replace(/^loader:\s*/, "");
const compile = (source) =>
  ts.transpile(source, { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS });
const fixtures = Array.from({ length: 1201 }, (_, index) => ({
  id: String(index + 1).padStart(4, "0"),
  title: `Record ${index + 1}`,
  createdAt: "2026-10-01T00:00:00Z",
  priceCents: 100,
  isFeatured: false,
}));

// Runs the real server validator, paging/ranking handler and route loader.
// Database, storage, cleanup and all providers are local test doubles only.
function harness() {
  const ranges = [];
  const providerReads = [];
  const query = new Proxy(
    {},
    {
      get: (_, key) =>
        key === "range"
          ? async (from, to) => {
              ranges.push([from, to]);
              return { data: fixtures.slice(from, to + 1), count: fixtures.length, error: null };
            }
          : () => query,
    },
  );
  const modules = {
    "./adzuna-listings.server": { canIncludeAdzuna: () => false },
    "./mashvisor-listings.server": { canIncludeMashvisor: () => false },
    "./openwebninja-listings.server": { canIncludeOpenWebNinja: () => false },
    "./openwebninja.server": { openWebNinjaConfigured: () => false },
    "./marketcheck.server": { canIncludeMarketCheck: () => false },
    "./rescuegroups.server": { canIncludeRescueGroups: () => false },
    "./service-directory-contract": { canIncludeDirectory: () => false },
    "@/integrations/supabase/client.server": { supabaseAdmin: { rpc: async () => ({}) } },
  };
  const context = vm.createContext({
    console,
    Date,
    Map,
    Set,
    normalizeBrowsePage,
    PAGE_SIZE: 24,
    LISTING_SELECT: "synthetic",
    publicServerClient: () => ({ from: () => query }),
    clearExpiredFeaturedPlacements: async () => {},
    classifiedCategories: [],
    mockClassifiedListings: [],
    mockVehicleListings: [],
    SHOW_PUBLIC_PREVIEW_FIXTURES: false,
    postedSince: () => undefined,
    isInvertedRange: () => false,
    filterValues: () => [],
    isReleaseQaListing: () => false,
    sortedMedia: () => [],
    toCard: (row) => row,
    isWithinClassifiedRadius: () => true,
    signListingThumbnails: async () => new Map(),
    text: (value) => (value == null ? undefined : String(value)),
    num: (value) => value,
    integerNum: (value) => value,
    listedValue: (value) => value,
    normalizePetSubcategory: (value) => value,
    normalizePetSpecies: (value) => value,
    conditionValues: [],
    firearmListingTypes: [],
    firearmTypes: [],
    firearmBrands: [],
    firearmAccessoryTypes: [],
    require: (specifier) => {
      assert.ok(modules[specifier], `unexpected dependency: ${specifier}`);
      return new Proxy(modules[specifier], {
        get: (target, key) =>
          key === "then"
            ? undefined
            : key in target
              ? target[key]
              : () => {
                  providerReads.push(String(key));
                  throw new Error("Provider calls are prohibited in this test");
                },
      });
    },
    createServerFn: () => ({
      validator: (validate) => ({
        handler:
          (handler) =>
          ({ data }) =>
            handler({ data: validate(data) }),
      }),
    }),
    isOutOfRangePage,
    notFound: () => Object.assign(new Error("notFound"), { isNotFound: true }),
    classifiedQuery: (input) => input,
    inputFromSearch: (input) => input,
    stringParam: () => undefined,
    integerParam: () => undefined,
    coordinateParam: () => undefined,
    numberParam: () => undefined,
    normalizeMultiSelect: () => undefined,
    normalizeBrowseSearch: (value) => value,
    sortOptions: [],
  });
  vm.runInContext(
    compile(
      `${runner}\nconst ${validator};\nconst routeLoader = ${loader};\nconst validateSearch = ${searchValidator};`,
    ),
    context,
  );
  const browse = (page) => {
    context.rawPage = page;
    return vm.runInContext("browseClassifieds({data:{page:rawPage}})", context);
  };
  context.routeContext = { queryClient: { ensureQueryData: (input) => browse(input.page) } };
  return {
    ranges,
    providerReads,
    browse,
    validate: (page) => {
      context.rawPage = page;
      return vm.runInContext("validateSearch({page:rawPage})", context);
    },
    load: (page) =>
      vm.runInContext(`routeLoader({context:routeContext,deps:{page:${page}}})`, context),
  };
}

test("page 51 reaches record 1201 through the real server contract", async () => {
  const h = harness();
  const page50 = await h.browse(50);
  const page51 = await h.browse(51);
  assert.equal(page50.page, 50);
  assert.equal(page51.page, 51);
  assert.deepEqual(
    Array.from(page51.listings, (item) => item.id),
    ["1201"],
  );
  assert.deepEqual(h.ranges, [
    [1176, 1199],
    [1200, 1223],
  ]);
  assert.equal(new Set([...page50.listings, ...page51.listings].map((item) => item.id)).size, 25);
  assert.deepEqual(h.providerReads, []);
});

test("direct page 51 loads while page 52 is notFound, with distinct canonical pages", async () => {
  const h = harness();
  await h.load(51);
  await assert.rejects(h.load(52), (error) => error.isNotFound === true);
  assert.equal(canonicalPagePath("/browse", { page: 51 }), "/browse?page=51");
  assert.equal((await h.browse(52)).listings.length, 0);
  assert.deepEqual(h.providerReads, []);
});

// Exercise the production async click handler with controlled responses and setters.
function clientHarness(fetchPage, { canLoadMore = true } = {}) {
  const firstPage = fixtures.slice(0, 24);
  const state = { extras: [], page: 50, loading: false, errors: [], requests: [] };
  const context = vm.createContext({
    appendBrowseListings,
    assertNextBrowsePage,
    canLoadMore,
    result: { listings: firstPage, page: 50, pageSize: 24 },
    loadedThroughPage: 50,
    search: { page: 50 },
    loadMoreScope: "original",
    currentLoadMoreScope: { current: "original" },
    loadMoreRequest: { current: null },
    classifiedQuery: (input) => input,
    inputFromSearch: (input) => input,
    queryClient: {
      fetchQuery: (input) => {
        state.requests.push(input.page);
        return fetchPage(input.page);
      },
    },
    setExtraListings: (update) => {
      state.extras = update(state.extras);
    },
    setLoadedThroughPage: (page) => {
      state.page = page;
      context.loadedThroughPage = page;
    },
    setLoadingMore: (loading) => {
      state.loading = loading;
    },
    toast: { error: (message) => state.errors.push(message) },
  });
  vm.runInContext(compile(loadMore), context);
  return {
    state,
    run: () => vm.runInContext("loadMore()", context),
    changeSearch: () => {
      context.currentLoadMoreScope.current = "new-search";
      context.loadMoreScope = "new-search";
      context.loadMoreRequest.current = null;
      state.extras = [];
      state.page = 1;
      state.loading = false;
      context.loadedThroughPage = 1;
    },
  };
}

const deferred = () => {
  let resolve, reject;
  const promise = new Promise((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
};

const response = (page, listings = [fixtures[1200]], pageSize = 24) => ({
  page,
  listings,
  pageSize,
});

test("all 1201 records are reachable once across 51 real server pages", async () => {
  const h = harness();
  const ids = [];
  for (let page = 1; page <= 51; page++) {
    const result = await h.browse(page);
    assert.equal(result.page, page);
    assert.equal(result.total, 1201);
    ids.push(...result.listings.map((item) => item.id));
  }
  assert.equal(ids.length, 1201);
  assert.equal(new Set(ids).size, 1201);
  assert.equal(ids.filter((id) => id === "1201").length, 1);
  assert.deepEqual(h.providerReads, []);
});

test("URL and server normalize malformed page inputs identically without a 50-page ceiling", async () => {
  const h = harness();
  for (const raw of [
    undefined,
    null,
    "",
    "oops",
    0,
    -1,
    1.5,
    "51.5",
    Infinity,
    NaN,
    Number.MAX_SAFE_INTEGER,
    {},
    [],
    true,
  ]) {
    assert.equal(normalizeBrowsePage(raw), 1);
    assert.equal(h.validate(raw).page, undefined);
    assert.equal((await h.browse(raw)).page, 1);
  }
  for (const raw of [1, 2, 50, 51, 52, "51"]) {
    const expected = Number(raw);
    assert.equal(h.validate(raw).page ?? 1, expected);
    assert.equal((await h.browse(raw)).page, expected);
  }
});

test("non-advancing, skipped and incompatible responses never append cards", async () => {
  for (const next of [response(50), response(49), response(52), response(51, undefined, 48)]) {
    const h = clientHarness(async () => next);
    await h.run();
    assert.equal(h.state.extras.length, 0);
    assert.equal(h.state.page, 50);
    assert.equal(h.state.errors.length, 1);
    assert.equal(h.state.loading, false);
  }
});

test("valid next page appends once and preserves already displayed cards", async () => {
  const h = clientHarness(async (page) =>
    response(page, [fixtures[0], fixtures[1200], fixtures[1200]]),
  );
  await h.run();
  assert.deepEqual(
    Array.from(h.state.extras, (item) => item.id),
    ["1201"],
  );
  assert.equal(h.state.page, 51);
  assert.deepEqual(h.state.errors, []);
  const appended = appendBrowseListings(
    [fixtures[0]],
    [fixtures[1]],
    [fixtures[0], fixtures[1], fixtures[2], fixtures[2]],
  );
  assert.deepEqual(
    appended.map((item) => item.id),
    ["0002", "0003"],
  );
});

test("rapid double clicks share one in-flight request", async () => {
  const pending = deferred();
  const h = clientHarness(() => pending.promise);
  const first = h.run();
  await h.run();
  assert.deepEqual(h.state.requests, [51]);
  pending.resolve(response(51));
  await first;
  assert.equal(h.state.extras.length, 1);
  assert.equal(h.state.page, 51);
});

test("stale search responses cannot append cards or clear a newer loading state", async () => {
  const pending = [deferred(), deferred()];
  let call = 0;
  const h = clientHarness(() => pending[call++].promise);
  const original = h.run();
  h.changeSearch();
  const current = h.run();
  pending[0].resolve(response(51));
  await original;
  assert.equal(h.state.extras.length, 0);
  assert.equal(h.state.page, 1);
  assert.equal(h.state.loading, true);
  pending[1].resolve(response(2));
  await current;
  assert.equal(h.state.extras.length, 1);
  assert.equal(h.state.page, 2);
  assert.equal(h.state.loading, false);
  assert.deepEqual(h.state.errors, []);
});

test("failed requests leave pagination retryable and stale failures stay silent", async () => {
  let call = 0;
  const h = clientHarness(async () => {
    if (call++ === 0) throw new Error("controlled network interruption");
    return response(51);
  });
  await h.run();
  assert.equal(h.state.page, 50);
  assert.equal(h.state.loading, false);
  await h.run();
  assert.deepEqual(h.state.requests, [51, 51]);
  assert.equal(h.state.page, 51);
  assert.equal(h.state.extras.length, 1);
  const pending = deferred();
  const stale = clientHarness(() => pending.promise);
  const request = stale.run();
  stale.changeSearch();
  pending.reject(new Error("stale interrupted request"));
  await request;
  assert.deepEqual(stale.state.errors, []);
  assert.equal(stale.state.extras.length, 0);
});

test("the final page cannot start another load-more request", async () => {
  const h = clientHarness(async () => response(52), { canLoadMore: false });
  await h.run();
  assert.deepEqual(h.state.requests, []);
});
