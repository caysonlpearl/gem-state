import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import ts from "typescript";
import * as jsx from "react/jsx-runtime";
import { createClient } from "@supabase/supabase-js";
import { withCatalogReadDeadline } from "../src/lib/catalog-read-deadline.ts";
import { shortCache } from "../src/lib/short-cache.server.ts";
import { homesFromSavedSearches } from "../src/lib/openwebninja-cache.ts";

function compile(file, name, globals = {}) {
  const source = ts.createSourceFile(
    file,
    readFileSync(new URL(file, import.meta.url), "utf8"),
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TSX,
  );
  let text;
  for (const node of source.statements) {
    if (ts.isFunctionDeclaration(node) && node.name?.text === name)
      text = `${node.getText(source)}\nexports.subject = ${name};`;
    if (ts.isVariableStatement(node))
      for (const declaration of node.declarationList.declarations)
        if (declaration.name.getText(source) === name)
          text = `export const subject = ${declaration.initializer.getText(source)};`;
  }
  assert.ok(text, name);
  const exports = {};
  vm.runInNewContext(
    ts.transpile(text, {
      target: ts.ScriptTarget.ES2022,
      module: ts.ModuleKind.CommonJS,
      jsx: ts.JsxEmit.ReactJSX,
    }),
    {
      exports,
      console: { error() {} },
      URLSearchParams,
      withCatalogReadDeadline: (query) =>
        typeof query === "function" ? query(new AbortController().signal) : query,
      require(name) {
        if (name === "react/jsx-runtime") return jsx;
        if (name === "@/integrations/supabase/client.server")
          return { supabaseAdmin: globals.database };
        throw new Error("Unexpected provider dependency: " + name);
      },
      ...globals,
    },
  );
  return exports.subject;
}
const file = "../src/routes/listings.$listingId.tsx";

test("malformed native identifiers are missing without touching live, archive or fallback sources", async () => {
  for (const name of [
    "getClassifiedListing",
    "getEndedClassifiedListing",
    "getRemovedListingBrowsePath",
  ]) {
    const handler = compile(
      name === "getRemovedListingBrowsePath"
        ? "../src/lib/place-pages.functions.ts"
        : "../src/lib/classifieds.functions.ts",
      name,
      {
        publicServerClient: () => {
          throw new Error("Unexpected source read");
        },
        database: {
          from: () => {
            throw new Error("Unexpected source read");
          },
        },
        createServerFn: () => ({
          validator() {
            return this;
          },
          handler: (value) => value,
        }),
        mockClassifiedListings: [],
        mockVehicleListings: [],
      },
    );
    for (const id of [
      "not-a-real-listing-id",
      "------------------------------------",
      "a".repeat(36),
      "306d4309-9968-4710-9b52-207a4d2cadcZ",
    ])
      assert.equal(await handler({ data: { id } }), null, name + ": " + id);
  }
});
const listing = {
  id: "native-id",
  title: "Home",
  city: "Twin Falls",
  state: "ID",
  priceCents: 100,
  images: [],
  categorySlug: "other-real-estate",
};
function routeFixture(result, { failure } = {}) {
  const calls = [];
  const route = compile(file, "Route", {
    createFileRoute: () => (value) => value,
    canonicalMarketCheckId: () => null,
    listingIdFromParam: (value) => value,
    listingQuery: (value) => value,
    getRemovedListingBrowsePath: async () => {
      calls.push("browse-link");
      return "/idaho/star/home-garden";
    },
    notFound: (options) => ({ kind: "notFound", ...options }),
    redirect: (options) => ({ kind: "redirect", ...options }),
    listingParam: () => "canonical-native-id",
    isIndexablePartnerDetail: () => true,
    listingStructuredData: () => [],
    formatJobPay: () => "Pay",
    adoptionPriceLabel: () => null,
    formatClassifiedPrice: () => "$1",
    isSeoTestListing: () => false,
    socialImageMeta: () => [],
    brand: { name: "Bluebird", urls: { siteUrl: "https://onbluebird.com" } },
    ListingDetail() {},
    ListingMissing() {},
  });
  return {
    route,
    calls,
    load: (param = "canonical-native-id") =>
      route.loader({
        params: { listingId: param },
        context: {
          queryClient: {
            async ensureQueryData() {
              if (failure) throw failure;
              return result;
            },
          },
        },
      }),
  };
}

test("removed native listings use a real not-found result with an optional browse link", async () => {
  const f = routeFixture(null);
  await assert.rejects(
    f.load(),
    (error) => error.kind === "notFound" && error.data.browseHref === "/idaho/star/home-garden",
  );
  assert.deepEqual(f.calls, ["browse-link"]);
});

test("missing partner homes, jobs and businesses do not redirect to unrelated inventory", async () => {
  for (const [id, category] of [
    ["openwebninja-123", "other-real-estate"],
    ["mashvisor-123", "other-real-estate"],
    ["adzuna-123", "jobs"],
    ["fsq-example", "services"],
  ]) {
    const f = routeFixture(null);
    await assert.rejects(
      f.load(id),
      (error) =>
        error.kind === "notFound" && error.data.browseHref === `/browse?category=${category}`,
    );
    assert.deepEqual(f.calls, []);
  }
});

test("an available listing still permanently redirects its outdated title URL to the same listing", async () => {
  const f = routeFixture(listing);
  await assert.rejects(
    f.load("outdated-title-native-id"),
    (error) =>
      error.kind === "redirect" &&
      error.statusCode === 301 &&
      error.params.listingId === "canonical-native-id",
  );
  assert.deepEqual(f.calls, []);
});

test("source outages remain errors rather than being relabeled as missing listings", async () => {
  const failure = new Error("source offline");
  const f = routeFixture(null, { failure });
  await assert.rejects(f.load(), (error) => error === failure);
  assert.deepEqual(f.calls, []);
});

test("retained sold and expired archives remain readable but excluded from indexing", async () => {
  for (const reason of ["sold", "expired"]) {
    const f = routeFixture({ ...listing, ended: { reason, endedAt: "2026-11-01" } });
    const data = await f.load();
    assert.ok(
      f.route
        .head({ loaderData: data })
        .meta.some((meta) => meta.name === "robots" && meta.content === "noindex, follow"),
    );
  }
});

function anchors(node) {
  if (!node || typeof node !== "object") return [];
  const children = Array.isArray(node.props?.children)
    ? node.props.children
    : [node.props?.children];
  return [...(node.type === "a" ? [node] : []), ...children.flatMap(anchors)];
}
test("partner-home desktop contact actions are measured without inventing a completed inquiry", () => {
  const calls = [];
  const contact = compile(file, "PartnerHomeContactCard", {
    trackSellerContact: (method, value) => calls.push({ method, id: value.id }),
    estimatedMonthlyPayment: () => 0,
    EmployerTile() {},
    Phone() {},
    ArrowSquareOut() {},
  });
  const value = {
    ...listing,
    externalHome: {
      sourceUrl: "https://www.zillow.com/homedetails/123_zpid/",
      listedBy: { agentPhone: "(208) 555-0100" },
    },
  };
  const links = anchors(contact({ listing: value, isRental: true }));
  assert.deepEqual(calls, []);
  const phone = links.find((link) => link.props.href.startsWith("tel:"));
  const external = links.find((link) => link.props.href.startsWith("https:"));
  assert.equal(phone.props.href, "tel:2085550100");
  phone.props.onClick();
  external.props.onClick();
  assert.deepEqual(calls, [
    { method: "call", id: listing.id },
    { method: "apply_external", id: listing.id },
  ]);
  assert.equal(external.props.target, "_blank");
});

test("the unavailable page preserves browse navigation without accepting external destinations", () => {
  const missing = compile(file, "ListingMissing", { BluebirdEmptyState() {} });
  assert.equal(
    anchors(missing({ data: { browseHref: "/idaho/star/home-garden" } }))[0].props.href,
    "/idaho/star/home-garden",
  );
  assert.equal(
    anchors(missing({ data: { browseHref: "//external.example" } }))[0].props.href,
    "/browse",
  );
});

test("native live and archive database errors cannot become false missing responses", async () => {
  for (const name of ["getClassifiedListing", "getEndedClassifiedListing"]) {
    const query = {};
    for (const method of ["select", "eq", "not", "gt", "in", "abortSignal", "retry"])
      query[method] = () => query;
    query.maybeSingle = async () => ({ data: null, error: { message: "offline" } });
    const database = { from: () => query };
    const handler = compile("../src/lib/classifieds.functions.ts", name, {
      database,
      publicServerClient: () => database,
      createServerFn: () => ({
        validator() {
          return this;
        },
        handler: (value) => value,
      }),
      mockClassifiedListings: [],
      mockVehicleListings: [],
      LISTING_SELECT: "id",
    });
    await assert.rejects(
      handler({ data: { id: "306d4309-9968-4710-9b52-207a4d2cadc3" } }),
      /temporarily unavailable/,
    );
  }
});

test("partner job detail expiry matches browse eligibility and database failures are not missing jobs", async () => {
  for (const [expired, error] of [
    [true, null],
    [false, null],
    [false, { message: "offline" }],
  ]) {
    let expiryChecked = false,
      removalChecks = 0;
    const query = {};
    for (const method of ["select", "contains", "order"]) query[method] = () => query;
    query.gt = (column, cutoff) => {
      assert.equal(column, "expires_at");
      assert.ok(Number.isFinite(Date.parse(cutoff)));
      expiryChecked = true;
      return query;
    };
    query.limit = async () => ({
      error,
      data: expired && expiryChecked ? [] : [{ payload: { jobs: [{ id: "123" }] } }],
    });
    const detail = compile("../src/lib/adzuna-listings.server.ts", "adzunaDetail", {
      database: { from: () => query },
      isPartnerJobRemoved: async () => {
        removalChecks++;
        return true;
      },
    });
    if (error) await assert.rejects(detail("adzuna-123"), /temporarily unavailable/);
    else {
      assert.equal(await detail("adzuna-123"), null);
      assert.equal(removalChecks, expired ? 0 : 1);
    }
    assert.equal(expiryChecked, true);
  }
});

test("a failed sold-status read cannot turn a retained listing into a false 404", async () => {
  const query = {};
  let selected;
  for (const method of ["eq", "not", "in", "abortSignal", "retry"]) query[method] = () => query;
  query.select = (value) => {
    selected = value;
    return query;
  };
  query.maybeSingle = async () =>
    selected === "sold_at"
      ? { data: null, error: { code: "08006", message: "connection lost" } }
      : { data: { status: "cancelled" }, error: null };
  const handler = compile("../src/lib/classifieds.functions.ts", "getEndedClassifiedListing", {
    database: { from: () => query },
    createServerFn: () => ({
      validator() {
        return this;
      },
      handler: (value) => value,
    }),
    isReleaseQaListing: () => false,
    LISTING_SELECT: "id",
  });
  await assert.rejects(
    handler({ data: { id: "306d4309-9968-4710-9b52-207a4d2cadc3" } }),
    /temporarily unavailable/,
  );
});

test("unavailable directory and removed-listing lookup failures remain errors", async () => {
  const query = {};
  for (const method of ["select", "eq", "abortSignal", "retry"]) query[method] = () => query;
  query.maybeSingle = async () => ({ data: null, error: { message: "offline" } });
  const database = { from: () => query };
  const detail = compile("../src/lib/service-directory.server.ts", "directoryDetail", {
    db: async () => database,
    DIRECTORY_ID: { test: () => true },
    DIRECTORY_COLUMNS: "id",
  });
  await assert.rejects(detail("fsq-example"), /temporarily unavailable/);
  const fallback = compile("../src/lib/place-pages.functions.ts", "getRemovedListingBrowsePath", {
    database,
    createServerFn: () => ({
      validator() {
        return this;
      },
      handler: (value) => value,
    }),
  });
  await assert.rejects(
    fallback({ data: { id: "306d4309-9968-4710-9b52-207a4d2cadc3" } }),
    /temporarily unavailable/,
  );
});

test("native and archive detail reads cancel a stalled request once without returning false missing data", async () => {
  for (const name of [
    "getClassifiedListing",
    "getEndedClassifiedListing",
    "getRemovedListingBrowsePath",
  ]) {
    let requests = 0;
    const database = createClient("https://fixture.invalid", "fixture-key", {
      auth: { persistSession: false },
      global: {
        fetch: async (_url, init) => {
          requests++;
          return new Promise((_resolve, reject) =>
            init.signal.addEventListener("abort", () => reject(init.signal.reason), { once: true }),
          );
        },
      },
    });
    const handler = compile(
      name === "getRemovedListingBrowsePath"
        ? "../src/lib/place-pages.functions.ts"
        : "../src/lib/classifieds.functions.ts",
      name,
      {
        database,
        publicServerClient: () => database,
        createServerFn: () => ({
          validator() {
            return this;
          },
          handler: (value) => value,
        }),
        mockClassifiedListings: [],
        mockVehicleListings: [],
        LISTING_SELECT: "id",
        withCatalogReadDeadline: (query) => withCatalogReadDeadline(query, 15),
      },
    );
    await assert.rejects(
      handler({ data: { id: "306d4309-9968-4710-9b52-207a4d2cadc3" } }),
      /took too long/,
    );
    assert.equal(requests, 1, name + " must not retry an expired read");
  }
});

test("concurrent saved-home reads share one request while source expiry is checked on each memory hit", async () => {
  let requests = 0;
  let now = Date.now();
  const expires = now + 1000;
  const database = createClient("https://fixture.invalid", "fixture-key", {
    auth: { persistSession: false },
    global: {
      fetch: async () => {
        requests++;
        return Response.json([
          {
            cache_key: '{"kind":"area-search","mode":"rent"}',
            expires_at: new Date(expires).toISOString(),
            payload: { homes: [{ id: "1", mode: "rent", city: "Twin Falls", state: "ID" }] },
          },
        ]);
      },
    },
  });
  const read = compile("../src/lib/openwebninja.server.ts", "cachedHomes", {
    cacheDb: () => database,
    withCatalogReadDeadline,
    shortCache: (key, ttl, load) => shortCache("homes-expiry-fixture:" + key, ttl, load),
    PUBLIC_PAGE_CACHE_MS: 60000,
    homesFromSavedSearches: (rows) => homesFromSavedSearches(rows, now),
  });
  const [first, second] = await Promise.all([read(), read()]);
  assert.equal(first.length, 1);
  assert.equal(second.length, 1);
  assert.equal(requests, 1);
  now = expires + 1;
  assert.deepEqual(Array.from(await read()), []);
  assert.equal(requests, 1, "expiry filtering must not require a paid provider request");
});

test("a failed saved-home read is evicted and successful empty inventory is not mistaken for an outage", async () => {
  let requests = 0;
  const database = createClient("https://fixture.invalid", "fixture-key", {
    auth: { persistSession: false },
    global: {
      fetch: async () =>
        ++requests === 1
          ? Response.json({ message: "source offline" }, { status: 503 })
          : Response.json([]),
    },
  });
  const read = compile("../src/lib/openwebninja.server.ts", "cachedHomes", {
    cacheDb: () => database,
    withCatalogReadDeadline,
    shortCache: (key, ttl, load) => shortCache("homes-recovery-fixture:" + key, ttl, load),
    PUBLIC_PAGE_CACHE_MS: 60000,
    homesFromSavedSearches,
  });
  await assert.rejects(read(), /temporarily unavailable/);
  assert.deepEqual(Array.from(await read()), []);
  assert.deepEqual(Array.from(await read()), []);
  assert.equal(requests, 2);
});

test("property-detail cache outages are not presented as a missing description and never call the provider", async () => {
  let requests = 0;
  const database = createClient("https://fixture.invalid", "fixture-key", {
    auth: { persistSession: false },
    global: {
      fetch: async () => {
        requests++;
        return Response.json({ message: "source offline" }, { status: 503 });
      },
    },
  });
  const read = compile("../src/lib/openwebninja.server.ts", "propertyDetails", {
    cacheDb: () => database,
    propertyKey: (id) => JSON.stringify({ v: 3, kind: "property", id }),
    withCatalogReadDeadline,
    cachedCall: () => {
      throw new Error("Unexpected upstream provider request");
    },
  });
  await assert.rejects(read("123", null, { cacheOnly: true }), /temporarily unavailable/);
  assert.equal(requests, 1);
});

test("malformed saved-home payloads are evicted so the next read can recover", async () => {
  let requests = 0;
  const database = createClient("https://fixture.invalid", "fixture-key", {
    auth: { persistSession: false },
    global: {
      fetch: async () =>
        Response.json(
          ++requests === 1
            ? [
                {
                  cache_key: '{"kind":"area-search","mode":"rent"}',
                  expires_at: new Date(Date.now() + 60000).toISOString(),
                  payload: {},
                },
              ]
            : [],
        ),
    },
  });
  const read = compile("../src/lib/openwebninja.server.ts", "cachedHomes", {
    cacheDb: () => database,
    withCatalogReadDeadline,
    shortCache: (key, ttl, load) => shortCache("homes-malformed-fixture:" + key, ttl, load),
    PUBLIC_PAGE_CACHE_MS: 60000,
    homesFromSavedSearches,
  });
  await assert.rejects(read(), /unavailable/);
  assert.deepEqual(Array.from(await read()), []);
  assert.equal(requests, 2);
});

test("home database transport preserves the caller's cancellation signal", async () => {
  let observed;
  const factory = compile("../src/lib/openwebninja.server.ts", "cacheDb", {
    createClient,
    serverEnv: (name) => (name.includes("URL") ? "https://fixture.invalid" : "fixture-key"),
    Headers,
    AbortSignal,
    fetch: async (_url, init) => {
      observed = init.signal;
      return Response.json([]);
    },
  });
  const controller = new AbortController();
  await factory().from("openwebninja_cache").select("cache_key").abortSignal(controller.signal);
  assert.equal(observed, controller.signal);
});
