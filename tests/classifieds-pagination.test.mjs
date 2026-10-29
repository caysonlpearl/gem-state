import { hasClassifiedRadiusCenter } from "../src/config/classifieds.ts";
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import ts from "typescript";
import {
  normalizeBrowsePage,
  CLASSIFIEDS_MERGE_READ_LIMIT,
  assertNextBrowsePage,
  appendBrowseListings,
} from "../src/lib/classifieds-pagination.ts";
import { comparableJobPay } from "../src/lib/classifieds-query.ts";
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
function harness({
  records = fixtures,
  filters = {},
  enabled = [],
  external = [],
  directory = [],
  rowLimit = Infinity,
  radiusMatch = () => true,
  beforeProvider = async () => {},
  cleanup = async () => {},
  onNative = () => {},
  beforeCategory = async () => {},
  prepareVehicleCache = () => undefined,
  deadlineRead = async (query) => await query,
} = {}) {
  const includes = new Set(enabled);
  const adapterCalls = [];
  const directoryCalls = [];
  const cards = (name) => async () => {
    adapterCalls.push(name);
    await beforeProvider();
    return external;
  };
  const selections = [];
  let exactCount = true;
  const ranges = [];
  const providerReads = [];
  const query = new Proxy(
    {},
    {
      get: (_, key) =>
        key === "select"
          ? (_fields, options) => {
              selections.push(options);
              exactCount = options?.count === "exact";
              return query;
            }
          : key === "range"
          ? (from, to) => ({
              // Supabase starts the read when its query thenable is consumed.
              then(resolve, reject) {
                return Promise.resolve()
                  .then(() => {
                    onNative();
                    ranges.push([from, to]);
                    return {
                      data: records.slice(from, Math.min(to + 1, from + rowLimit)),
                      count: exactCount ? records.length : null,
                      error: null,
                    };
                  })
                  .then(resolve, reject);
              },
            })
          : () => query,
    },
  );
  const modules = {
    "./adzuna-listings.server": {
      canIncludeAdzuna: () => includes.has("adzuna"),
      adzunaCards: cards("adzuna"),
    },
    "./mashvisor-listings.server": {
      canIncludeMashvisor: () => includes.has("mashvisor"),
      mashvisorCards: cards("mashvisor"),
    },
    "./openwebninja-listings.server": {
      canIncludeOpenWebNinja: () => includes.has("openwebninja"),
      openWebNinjaCards: cards("openwebninja"),
    },
    "./openwebninja.server": { openWebNinjaConfigured: () => true },
    "./marketcheck.server": {
      canIncludeMarketCheck: () => includes.has("marketcheck"),
      marketCheckCards: cards("marketcheck"),
      prepareHomeMarketCheckCache: prepareVehicleCache,
    },
    "./rescuegroups.server": {
      canIncludeRescueGroups: () => includes.has("rescuegroups"),
      rescueGroupsConfigured: () => true,
      rescueGroupsCards: cards("rescuegroups"),
    },
    "./service-directory-contract": { canIncludeDirectory: () => includes.has("directory") },
    "./avantlink-listings.server": {
      canIncludeMerchandise: () => includes.has("avantlink"),
      merchandiseCards: async () => ({ cards: await cards("avantlink")(), limited: false }),
    },
    "./service-directory.server": {
      directoryCards: async (_input, offset, limit) => {
        directoryCalls.push({ offset, limit });
        return { cards: directory.slice(offset, offset + limit), total: directory.length };
      },
    },
    "@/integrations/supabase/client.server": { supabaseAdmin: { rpc: async () => ({}) } },
  };
  const context = vm.createContext({
    console,
    Date,
    Map,
    Set,
    normalizeBrowsePage,
    CLASSIFIEDS_MERGE_READ_LIMIT,
    comparableJobPay,
    PAGE_SIZE: 24,
    LISTING_SELECT: "synthetic",
    publicServerClient: () => ({ from: () => query }),
    withCatalogReadDeadline: deadlineRead,
    clearExpiredFeaturedPlacements: cleanup,
    classifiedCategories: ["jobs", "services", "cars-trucks", "other-real-estate", "pets"].map(
      (slug) => ({ slug }),
    ),
    categoryIdsBySlug: async () => {
      await beforeCategory();
      return new Map(
        ["jobs", "services", "cars-trucks", "other-real-estate", "pets"].map((slug) => [
          slug,
          slug,
        ]),
      );
    },
    regionOfListing: (listing) => listing.region ?? "Treasure Valley",
    mockClassifiedListings: [],
    mockVehicleListings: [],
    SHOW_PUBLIC_PREVIEW_FIXTURES: false,
    postedSince: () => undefined,
    isInvertedRange: () => false,
    filterValues: () => [],
    isReleaseQaListing: () => false,
    sortedMedia: () => [],
    toCard: (row) => row,
    isWithinClassifiedRadius: radiusMatch,
    hasClassifiedRadiusCenter,
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
    context.browseInput = { ...filters, page };
    return vm.runInContext("browseClassifieds({data:browseInput})", context);
  };
  context.routeContext = { queryClient: { ensureQueryData: (input) => browse(input.page) } };
  return {
    ranges,
    selections,
    internal: (options) => {
      context.browseInput = { ...filters, page: 1 };
      context.internalOptions = options;
      return vm.runInContext("runBrowseClassifieds(browseInput, internalOptions)", context);
    },
    providerReads,
    adapterCalls,
    directoryCalls,
    browse,
    validate: (page) => {
      context.rawPage = page;
      return vm.runInContext("validateSearch({page:rawPage})", context);
    },
    load: (page) => {
      context.routeDeps = { ...filters, page };
      return vm.runInContext("routeLoader({context:routeContext,deps:routeDeps})", context);
    },
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

const mergedScenarios = [
  { name: "radius", filters: { city: "Boise", radiusMiles: 25 } },
  { name: "region", filters: { region: "Treasure Valley" } },
  { name: "hourly job pay low", filters: { category: "jobs", sort: "price_low" } },
  { name: "hourly job pay high", filters: { category: "jobs", sort: "price_high" } },
  { name: "Adzuna", enabled: ["adzuna"] },
  { name: "Mashvisor", enabled: ["mashvisor"] },
  { name: "OpenWebNinja", enabled: ["openwebninja"] },
  { name: "MarketCheck", enabled: ["marketcheck"] },
  { name: "RescueGroups", enabled: ["rescuegroups"] },
  { name: "AvantLink merchandise", enabled: ["avantlink"] },
  { name: "directory", enabled: ["directory"] },
];
const manyRecords = Array.from({ length: 6001 }, (_, index) => ({
  ...fixtures[0],
  id: String(index + 1).padStart(5, "0"),
}));

for (const scenario of mergedScenarios) {
  test(`${scenario.name}: extreme pages never amplify the native read or substitute a page`, async () => {
    const h = harness({ ...scenario, records: manyRecords });
    for (const page of [1000000, 100000000000, 1, 51, 209, 210]) {
      const result = await h.browse(page);
      assert.deepEqual(h.ranges.at(-1), [0, 4999]);
      assert.equal(result.page, page);
      assert.equal(result.total, 5000);
      assert.equal(result.limitedResults, true);
      assert.equal(result.listings.length, page === 209 ? 8 : page >= 210 ? 0 : 24);
    }
    await assert.rejects(h.load(210), (error) => error.isNotFound === true);
    await assert.rejects(h.load(1000000), (error) => error.isNotFound === true);
    assert.deepEqual(h.providerReads, []);
  });

  test(`${scenario.name}: page 51 still reaches listing 1201 once and page 52 is notFound`, async () => {
    const h = harness(scenario);
    const result = await h.browse(51);
    assert.equal(result.page, 51);
    assert.equal(result.total, 1201);
    assert.deepEqual(
      Array.from(result.listings, (item) => item.id),
      ["1201"],
    );
    assert.equal(result.limitedResults, false);
    await assert.rejects(h.load(52), (error) => error.isNotFound === true);
  });
}

test("merged totals reflect the actual returned window when the database imposes a smaller row cap", async () => {
  const h = harness({ records: manyRecords, filters: { radiusMiles: 25 }, rowLimit: 1000 });
  const last = await h.browse(42);
  assert.equal(last.total, 1000);
  assert.equal(last.listings.length, 16);
  assert.equal(last.limitedResults, true);
  await assert.rejects(h.load(43), (error) => error.isNotFound === true);
});

test("provider results remain pageable after the bounded native window without phantom native pages", async () => {
  const external = Array.from({ length: 25 }, (_, index) => ({
    ...fixtures[0],
    id: `partner-${index}`,
    createdAt: "2025-01-01T00:00:00Z",
    externalVehicle: {},
  }));
  const h = harness({ records: manyRecords, enabled: ["marketcheck"], external });
  const ids = [];
  for (const page of [209, 210]) {
    const result = await h.browse(page);
    assert.equal(result.total, 5025);
    ids.push(...result.listings.map((item) => item.id));
  }
  assert.equal(ids.length, 33);
  assert.equal(new Set(ids).size, 33);
  assert.equal(ids.filter((id) => id.startsWith("partner-")).length, 25);
  await assert.rejects(h.load(211), (error) => error.isNotFound === true);
});

test("directory pagination crosses the bounded native window using at most one page of directory cards", async () => {
  const directory = Array.from({ length: 50 }, (_, index) => ({
    ...fixtures[0],
    id: `directory-${index}`,
    directory: {},
  }));
  const h = harness({ records: manyRecords, enabled: ["directory"], directory });
  const ids = [];
  for (const page of [209, 210, 211]) {
    const result = await h.browse(page);
    assert.equal(result.total, 5050);
    ids.push(...result.listings.map((item) => item.id));
  }
  assert.equal(ids.length, 58);
  assert.equal(new Set(ids).size, 58);
  assert.deepEqual(h.directoryCalls, [
    { offset: 0, limit: 16 },
    { offset: 16, limit: 24 },
    { offset: 40, limit: 24 },
  ]);
  await assert.rejects(h.load(212), (error) => error.isNotFound === true);
  assert.ok(h.directoryCalls.every((call) => call.limit <= 24));
});

test("post-read filters count only eligible cards in the bounded search window", async () => {
  const h = harness({
    records: manyRecords,
    filters: { radiusMiles: 25 },
    radiusMatch: ({ listingCity }) => listingCity === "Boise",
  });
  assert.equal((await h.browse(1)).total, 0);
  assert.equal((await h.browse(1)).limitedResults, true);
  await assert.rejects(h.load(2), (error) => error.isNotFound === true);
});

test("ordinary native pagination remains uncapped and extreme pages request only 24 rows", async () => {
  const h = harness({ records: manyRecords });
  const last = await h.browse(251);
  assert.equal(last.total, 6001);
  assert.deepEqual(
    Array.from(last.listings, (item) => item.id),
    ["06001"],
  );
  assert.equal(last.limitedResults, false);
  for (const page of [1000000, 100000000000]) {
    const result = await h.browse(page);
    assert.equal(result.page, page);
    assert.equal(result.listings.length, 0);
    assert.equal(h.ranges.at(-1)[1] - h.ranges.at(-1)[0] + 1, 24);
    await assert.rejects(h.load(page), (error) => error.isNotFound === true);
  }
});

for (const sort of ["price_low", "price_high"]) {
  test(`bounded job ${sort} preserves the annualized hourly/salary comparator`, async () => {
    const records = [
      { ...fixtures[0], id: "hourly", job: { payType: "Hourly", payMin: 16 } },
      { ...fixtures[0], id: "salary", job: { payType: "Salary", payMin: 30000 } },
    ];
    const h = harness({ records, filters: { category: "jobs", sort } });
    const result = await h.browse(1);
    assert.deepEqual(
      Array.from(result.listings, (item) => item.id),
      sort === "price_low" ? ["salary", "hourly"] : ["hourly", "salary"],
    );
    assert.deepEqual(h.ranges, [[0, 4999]]);
  });
}

test("native inventory starts while an eligible provider is still pending", async () => {
  let release;
  const gate = new Promise((resolve) => {
    release = resolve;
  });
  let nativeStarted = false;
  const h = harness({
    enabled: ["marketcheck"],
    beforeProvider: () => gate,
    onNative: () => {
      nativeStarted = true;
    },
  });
  const pending = h.browse(1);
  try {
    await new Promise(setImmediate);
    assert.equal(nativeStarted, true, "native read must not wait for provider completion");
    assert.deepEqual(h.adapterCalls, ["marketcheck"]);
  } finally {
    release();
  }
  await pending;
});


test("provider cache reads overlap cleanup but native ranking waits for cleanup", async () => {
  let release;
  const gate = new Promise((resolve) => { release = resolve; });
  let nativeStarted = false;
  const h = harness({
    enabled: ["marketcheck"], cleanup: () => gate,
    onNative: () => { nativeStarted = true; },
  });
  const pending = h.browse(1);
  try {
    await new Promise(setImmediate);
    assert.deepEqual(h.adapterCalls, ["marketcheck"]);
    assert.equal(nativeStarted, false, "native ranking cannot see expired placements before cleanup");
  } finally { release(); }
  await pending;
  assert.equal(nativeStarted, true);
});

test("homepage reads do not perform placement cleanup or wait for that maintenance write", async () => {
  let cleanupCalls = 0;
  let nativeStarted = false;
  const h = harness({
    filters: { category: "cars-trucks", state: "ID" },
    cleanup: () => { cleanupCalls++; return new Promise(() => {}); },
    onNative: () => { nativeStarted = true; },
  });
  await h.internal({ readOnlyHome: true });
  assert.equal(cleanupCalls, 0);
  assert.equal(nativeStarted, true);
});


test("internal homepage count omission preserves merged cards while public browse retains counts", async () => {
  const settings = {
    filters: { category: "cars-trucks", state: "ID", sort: "newest" },
    enabled: ["marketcheck"],
    external: [{ id: "provider-car", title: "Provider car", createdAt: "2026-10-20T00:00:00Z", externalVehicle: { sourceKind: "marketcheck" } }],
  };
  const publicBrowse = harness(settings);
  const publicResult = await publicBrowse.browse(1);
  const internal = harness(settings);
  const leadResult = await internal.internal({ includeExactCount: false });
  assert.equal(publicBrowse.selections[0].count, "exact");
  assert.equal(internal.selections[0].count, undefined);
  assert.deepEqual(JSON.parse(JSON.stringify(leadResult.listings)), JSON.parse(JSON.stringify(publicResult.listings)));
  assert.deepEqual(internal.ranges, publicBrowse.ranges);
  assert.deepEqual(internal.adapterCalls, publicBrowse.adapterCalls);
});


test("internal lead diagnostics contain only allowlisted finite nonnegative stage timings", async () => {
  const h = harness({ enabled: ["marketcheck"], filters: { category: "cars-trucks" } });
  const timingsMs = {};
  await h.internal({ includeExactCount: false, timingsMs });
  const stages = ["cleanup", "categoryIds", "adapterImports", "nativeRead", "vehicleRead", "thumbnailLinks"];
  assert.deepEqual(Object.keys(timingsMs).sort(), stages.flatMap((key) => [key, `${key}Start`]).sort());
  for (const value of Object.values(timingsMs)) {
    assert.equal(typeof value, "number");
    assert.ok(Number.isFinite(value) && value >= 0);
  }
});


test("private home cache preparation overlaps category validation without invoking provider adapters", async () => {
  let release;
  const categoryGate = new Promise((resolve) => { release = resolve; });
  let preparations = 0;
  const h = harness({ filters: { category: "cars-trucks", state: "ID" }, enabled: ["marketcheck"], beforeCategory: () => categoryGate,
    prepareVehicleCache: () => { preparations += 1; return { dealer: Promise.resolve([]), fsbo: Promise.resolve([]) }; },
  });
  const pending = h.internal({ prepareHomeVehicleCache: true });
  try {
    await new Promise(setImmediate);
    assert.equal(preparations, 1);
    assert.deepEqual(h.adapterCalls, [], "no full adapter or paid refresh before validation");
  } finally { release(); }
  await pending;
  assert.deepEqual(h.adapterCalls, ["marketcheck"]);
});

test("invalid category discards preparation without invoking provider adapters", async () => {
  let preparations = 0;
  const h = harness({ filters: { category: "not-a-category", state: "ID" }, enabled: ["marketcheck"],
    prepareVehicleCache: () => { preparations += 1; return { dealer: Promise.resolve([]), fsbo: Promise.resolve([]) }; },
  });
  const result = await h.internal({ prepareHomeVehicleCache: true });
  assert.equal(preparations, 1);
  assert.equal(result.listings.length, 0);
  assert.deepEqual(h.adapterCalls, []);
});


test("native browse deadline rejects instead of returning provider-only success", async () => {
  const h = harness({ enabled: ["marketcheck"], external: [{ id: "provider" }],
    deadlineRead: async () => { throw new Error("Catalog data took too long"); },
  });
  await assert.rejects(h.internal(), /Catalog data took too long/);
});
