import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import ts from "typescript";
import * as jsx from "react/jsx-runtime";

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
    for (const method of ["select", "eq", "not", "gt", "in"]) query[method] = () => query;
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
  for (const method of ["eq", "not", "in"]) query[method] = () => query;
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
  for (const method of ["select", "eq"]) query[method] = () => query;
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
