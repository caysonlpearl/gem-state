import { selectDiscoveryCards } from "../src/lib/discovery-ranking.ts";
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import ts from "typescript";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { landingCards, matchesLandingCard } from "../src/lib/landing-card-pool.ts";

const card = (id, extra = {}) => ({
  id,
  title: id,
  categorySlug: "cars-trucks",
  city: "Boise",
  state: "ID",
  priceCents: 1000000,
  createdAt: "2026-10-31T00:00:00Z",
  isFeatured: false,
  vehicle: null,
  ...extra,
});
const source = readFileSync(new URL("../src/routes/browse.tsx", import.meta.url), "utf8");
const ast = ts.createSourceFile(
  "browse.tsx",
  source,
  ts.ScriptTarget.Latest,
  true,
  ts.ScriptKind.TSX,
);
function declaration(name) {
  const node = ast.statements.find((n) => ts.isFunctionDeclaration(n) && n.name?.text === name);
  assert.ok(node, name);
  return node.getText(ast);
}
const compile = (text) =>
  ts.transpile(text, { target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.React });

test("every landing page awaits its shared saved pool; results never add a landing request", async () => {
  let loader;
  function visit(node) {
    if (ts.isPropertyAssignment(node) && node.name.getText(ast) === "loader")
      loader = node.initializer.getText(ast);
    ts.forEachChild(node, visit);
  }
  visit(ast);
  const context = vm.createContext({
    isMotorsCategory: (category) => ["cars-trucks", "motorcycles"].includes(category),
    classifiedQuery: (input) => ({ queryKey: ["browse"], input }),
    latestListingsInput: (input) => input,
    landingHomeQuery: { queryKey: ["classifieds-landing-cache"] },
    isOutOfRangePage: () => false,
  });

  test("a failed optional cache read falls back without poisoning the main homepage cache", async () => {
    const declaration = ast.statements
      .filter(ts.isVariableStatement)
      .flatMap((s) => s.declarationList.declarations)
      .find((d) => d.name.getText(ast) === "landingHomeQuery");
    const context = vm.createContext({
      queryOptions: (options) => options,
      getClassifiedsLandingHome: async () => {
        throw new Error("Temporary CDN failure");
      },
    });
    vm.runInContext(compile(`const options = ${declaration.initializer.getText(ast)};`), context);
    assert.equal(await vm.runInContext("options.queryFn()", context), null);
    assert.equal(vm.runInContext("options.queryKey[0]", context), "classifieds-landing-cache");
    assert.equal(vm.runInContext("options.staleTime({ state: { data: null } })", context), 5000);
  });
  vm.runInContext(compile(`${declaration("isLandingPage")}\nconst load = ${loader};`), context);
  for (const search of [
    { group: "motors" },
    ...["other-real-estate", "jobs", "services", "pets", "firearms"].map((category) => ({
      category,
    })),
  ]) {
    const calls = [];
    let release;
    let ready = false;
    context.args = {
      deps: search,
      context: {
        queryClient: {
          ensureQueryData: (options) => {
            calls.push(options.queryKey[0]);
            return options.queryKey[0] === "classifieds-landing-cache"
              ? new Promise((resolve) => {
                  release = resolve;
                })
              : Promise.resolve({ total: 3, pageSize: 24 });
          },
        },
      },
    };
    const pending = vm.runInContext("load(args)", context).then(() => {
      ready = true;
    });
    await new Promise(setImmediate);
    assert.equal(ready, false, JSON.stringify(search));
    assert.deepEqual(calls, ["browse", "classifieds-landing-cache"]);
    release({ recent: [] });
    await pending;
    assert.equal(ready, true);
  }
  for (const search of [
    { group: "motors", vehicleMode: "results" },
    { category: "jobs", jobMode: "results" },
    { category: "services", serviceMode: "results" },
    { category: "other-real-estate", homeMode: "results" },
    { category: "pets", petMode: "results" },
    { category: "firearms", firearmMode: "results" },
    { category: "jobs", page: 2 },
  ]) {
    context.search = search;
    assert.equal(vm.runInContext("isLandingPage(search)", context), false);
  }
});

test("vehicle rows keep geographic, body, fuel, age, price, and strict unknown-value filters", () => {
  const truck = card("truck", {
    vehicle: { bodyStyle: "Pickup", year: 2024, drivetrain: "4WD", fuelType: "Hybrid" },
  });
  assert.equal(
    matchesLandingCard(truck, {
      group: "motors",
      state: "ID",
      bodyStyle: "SUV||Truck",
      yearMin: 2022,
      priceMax: 20000,
      drivetrain: "AWD||4WD",
      fuelType: "Hybrid||Electric",
    }),
    true,
  );
  assert.equal(matchesLandingCard(truck, { state: "UT" }), false);
  assert.equal(matchesLandingCard(truck, { bodyStyle: "Minivan" }), false);
  assert.equal(matchesLandingCard(card("unknown"), { yearMax: 1995 }), false);
  assert.equal(matchesLandingCard(truck, { fulfillment: "shipping" }), false);
});

test("jobs, services, pets, homes and item-detail rows use their own normalized fields", () => {
  assert.equal(
    matchesLandingCard(
      card("job", {
        categorySlug: "jobs",
        job: {
          category: "Healthcare",
          employmentType: "Part-time",
          employerName: "Clinic",
          jobSummary: "Remote",
        },
      }),
      { category: "jobs", jobCategory: "Healthcare", jobEmploymentType: "Part-time", q: "remote" },
    ),
    true,
  );
  const service = card("service", {
    categorySlug: "services",
    service: { subcategory: "General Contractors" },
    directory: { trades: ["Plumbers", "Handyman"] },
  });
  assert.equal(
    matchesLandingCard(service, { category: "services", serviceSubcategory: "Plumbers" }),
    true,
  );
  assert.equal(matchesLandingCard(service, { serviceSubcategory: "Electricians" }), false);
  const pet = card("pet", {
    categorySlug: "pets",
    pet: { subcategory: "cats", placementType: "adoption" },
  });
  assert.equal(
    matchesLandingCard(pet, {
      category: "pets",
      petSubcategory: "cats",
      petPlacementType: "adoption",
    }),
    true,
  );
  assert.equal(matchesLandingCard(pet, { petSubcategory: "dogs" }), false);
  const home = card("home", {
    categorySlug: "other-real-estate",
    home: { mode: "rent", propertyType: "Apartment", bedrooms: 3, pets: "Cats allowed" },
  });
  assert.equal(
    matchesLandingCard(home, {
      category: "other-real-estate",
      homeTab: "rent",
      homePropertyType: "Apartment",
      homeBedroomsMin: 3,
      homePetsPolicy: "Cats",
    }),
    true,
  );
  assert.equal(matchesLandingCard(home, { homeTab: "buy", category: "other-real-estate" }), false);
  assert.equal(
    matchesLandingCard(card("item", { itemDetails: { itemType: "Example" } }), {
      itemDetailKey: "itemType",
      itemDetailValue: "Example",
    }),
    true,
  );
});

test("saved pools deduplicate, prefer fresh primary cards, and sort prices without treating unknown prices as free", () => {
  const first = card("old", { priceCents: 20000 });
  const updated = { ...first, priceCents: 10000 };
  const result = landingCards(
    [
      first,
      card("unknown", { externalVehicle: { sourceKind: "dealer" }, priceCents: 0 }),
      card("free", { priceCents: 0 }),
      updated,
    ],
    { sort: "price_low" },
  );
  assert.deepEqual(
    result.map((c) => c.id),
    ["free", "old", "unknown"],
  );
  assert.equal(result[1].priceCents, 10000);
});

test("landing rows render real cards on the server without scroll observers or per-row searches", () => {
  const pool = Array.from({ length: 12 }, (_, index) =>
    card(`car-${index}`, { vehicle: { bodyStyle: "SUV", year: 2024 } }),
  );
  const context = vm.createContext({
    React,
    selectDiscoveryCards,
    URL,
    useSuspenseQuery: () => ({ data: { recent: [], motors: pool } }),
    landingHomeQuery: {},
    landingCards,
    inputFromSearch: (s) => s,
    ListingCard: ({ listing }) =>
      React.createElement("article", { "data-id": listing.id }, listing.title),
    CategoryPreviewEmpty: () => React.createElement("p", null, "No matching preview"),
    ArrowRight: () => null,
  });
  vm.runInContext(
    compile(
      `${declaration("varietyOf")}\n${declaration("showcaseSearch")}\n${declaration("HomepageShowcaseRows")}`,
    ),
    context,
  );
  const html = renderToStaticMarkup(
    React.createElement(context.HomepageShowcaseRows, {
      eyebrow: "Vehicles",
      baseSearch: { group: "motors" },
      topListings: pool.slice(0, 4),
      rows: [
        {
          title: "Adventure-ready rides",
          href: "/browse?group=motors&bodyStyle=SUV",
          action: "Browse",
        },
        { title: "Lowest prices", href: "/browse?group=motors&sort=price_low", action: "Browse" },
      ],
    }),
  );
  assert.equal((html.match(/<article/g) ?? []).length, 10);
  assert.doesNotMatch(html, /Loading|No matching preview/);
  assert.doesNotMatch(
    declaration("HomepageShowcaseRows"),
    /IntersectionObserver|browseClassifieds|enabled: visible|useQuery\(/,
  );
});

test("navigation retains the current page instead of replacing it with a loading skeleton", () => {
  const router = readFileSync(new URL("../src/router.tsx", import.meta.url), "utf8");
  const root = readFileSync(new URL("../src/routes/__root.tsx", import.meta.url), "utf8");
  assert.doesNotMatch(router, /defaultPendingComponent|Loading page/);
  assert.match(root, /role="progressbar"/);
});

test("category lead previews can select older Idaho sellers beyond a refreshed first page without mixing categories", () => {
  const firstPage = Array.from({ length: 48 }, (_, i) =>
    card(`batch-${i}`, { discoverySellerKey: "dealer-a" }),
  );
  const older = [
    card("older-b", { discoverySellerKey: "dealer-b" }),
    card("older-c", { discoverySellerKey: "dealer-c" }),
    card("older-d", { discoverySellerKey: "dealer-d" }),
  ];
  const foreign = card("foreign", { state: "UT", discoverySellerKey: "ut" });
  const wrong = card("wrong-category", {
    categorySlug: "jobs",
    job: { employerName: "Other" },
    discoverySellerKey: "other",
  });
  const context = vm.createContext({
    React,
    URL,
    selectDiscoveryCards,
    landingCards,
    inputFromSearch: (s) => s,
    useSuspenseQuery: () => ({ data: { recent: [wrong], motors: [...older, foreign] } }),
    landingHomeQuery: {},
    ListingCard: ({ listing }) =>
      React.createElement("article", { "data-id": listing.id }, listing.title),
    Link: ({ children }) => React.createElement("a", null, children),
    ArrowRight: () => null,
    CategoryGettingStarted: () => null,
  });
  vm.runInContext(
    compile(`${declaration("varietyOf")}\n${declaration("LandingListingsShowcase")}`),
    context,
  );
  const html = renderToStaticMarkup(
    React.createElement(context.LandingListingsShowcase, {
      eyebrow: "Vehicles",
      title: "Latest",
      action: "Browse",
      browseSearch: { category: "cars-trucks" },
      listings: firstPage,
    }),
  );
  for (const item of older) assert.ok(html.includes(`data-id="${item.id}"`));
  assert.ok(!html.includes('data-id="foreign"') && !html.includes('data-id="wrong-category"'));
});

test("generic vehicle discovery excludes parts while the dedicated Auto Parts category retains them", () => {
  const part = card("Truck toolbox", { categorySlug: "auto-parts", priceCents: 10000 });
  const car = card("Whole car", { categorySlug: "cars-trucks", priceCents: 1000000 });
  assert.deepEqual(
    landingCards([part, car], { group: "motors", sort: "price_low" }).map((c) => c.id),
    [car.id],
  );
  assert.deepEqual(
    landingCards([part, car], { category: "auto-parts" }).map((c) => c.id),
    [part.id],
  );
});

test("new query cards take precedence over older copies in the saved discovery pool", () => {
  const current = card("same-listing", {
    title: "Current listing details",
    discoverySellerKey: "seller",
  });
  const stale = { ...current, title: "Old cached details" };
  const context = vm.createContext({
    React,
    URL,
    selectDiscoveryCards,
    landingCards,
    inputFromSearch: (s) => s,
    useSuspenseQuery: () => ({ data: { recent: [], motors: [stale] } }),
    landingHomeQuery: {},
    ListingCard: ({ listing }) => React.createElement("article", null, listing.title),
    Link: ({ children }) => React.createElement("a", null, children),
    ArrowRight: () => null,
    CategoryGettingStarted: () => null,
  });
  vm.runInContext(
    compile(`${declaration("varietyOf")}\n${declaration("LandingListingsShowcase")}`),
    context,
  );
  const html = renderToStaticMarkup(
    React.createElement(context.LandingListingsShowcase, {
      eyebrow: "Vehicles",
      title: "Latest",
      action: "Browse",
      browseSearch: { category: "cars-trucks" },
      listings: [current],
    }),
  );
  assert.ok(html.includes("Current listing details"));
  assert.ok(!html.includes("Old cached details"));
});
