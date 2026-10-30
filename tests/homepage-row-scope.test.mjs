import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import ts from "typescript";
import React from "react";
import {
  classifiedCategories,
  idahoRegions,
  marketplaceCities,
  usStates,
  isWithinClassifiedRadius,
} from "../src/config/classifieds.ts";
import { homepageDistanceRow } from "../src/lib/homepage-distance-row.ts";
import { isGeneralHomepageListing } from "../src/lib/homepage-listing-rows.ts";

const source = readFileSync(new URL("../src/routes/index.tsx", import.meta.url), "utf8");
const ast = ts.createSourceFile(
  "index.tsx",
  source,
  ts.ScriptTarget.Latest,
  true,
  ts.ScriptKind.TSX,
);
const nodes = (node) =>
  !node || typeof node !== "object"
    ? []
    : [node, ...React.Children.toArray(node.props?.children).flatMap(nodes)];
function context(extra = {}) {
  const c = vm.createContext({
    React,
    classifiedCategories,
    idahoRegions,
    marketplaceCities,
    usStates,
    isWithinClassifiedRadius,
    isGeneralHomepageListing,
    homepageDistanceRow,
    HOMEPAGE_ROW_SIZE: 4,
    homepageCategoryHighlights: [],
    homeQuery: {},
    homeLeadQuery: {},
    HomeFeed: "HomeFeed",
    HomepageListingRow: "HomepageListingRow",
    HomepageInfoBand: "HomepageInfoBand",
    CategoryArtwork: "CategoryArtwork",
    Link: "Link",
    seeAll: "",
    ArrowRight: "ArrowRight",
    ...extra,
  });
  const functions = ["parseLocationSearch", "homeLocation", "Home", "HomeSections"]
    .map((name) =>
      ast.statements.find((n) => ts.isFunctionDeclaration(n) && n.name?.text === name).getText(ast),
    )
    .join("\n");
  vm.runInContext(
    ts.transpile(functions, { target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.React }),
    c,
  );
  return c;
}
const card = (id, categorySlug, details = {}) => ({
  id,
  title: id,
  categorySlug,
  city: "Boise",
  state: "ID",
  priceCents: 5000,
  ...details,
});

test("Fresh local finds accepts general merchandise and rejects every dedicated vertical, even without details", () => {
  for (const category of classifiedCategories.filter(
    (c) =>
      c.group === "classifieds" &&
      !["jobs", "services", "pets", "other-real-estate"].includes(c.slug),
  ))
    assert.equal(isGeneralHomepageListing(card(category.slug, category.slug)), true);
  for (const slug of [
    "jobs",
    "services",
    "pets",
    "other-real-estate",
    ...classifiedCategories.filter((c) => c.group === "motors").map((c) => c.slug),
  ])
    assert.equal(isGeneralHomepageListing(card(slug, slug)), false, slug);
  for (const field of ["vehicle", "home", "job", "service", "pet", "externalMerchandise"])
    assert.equal(isGeneralHomepageListing(card(field, "general", { [field]: {} })), false, field);
});

test("dedicated rows fill from statewide saved inventory without jobs displacing Fresh local finds", () => {
  const motors = Array.from({ length: 24 }, (_, i) =>
    card(`vehicle-${i}`, "cars-trucks", {
      city: i % 2 ? "Twin Falls" : "Boise",
      vehicle: { bodyStyle: "SUV" },
    }),
  );
  const jobs = Array.from({ length: 16 }, (_, i) =>
    card(`job-${i}`, "jobs", { job: { employmentType: "Part-time" } }),
  );
  const services = Array.from({ length: 12 }, (_, i) =>
    card(`service-${i}`, "services", {
      city: i % 2 ? "Boise" : "Pocatello",
      service: { subcategory: "Home repair" },
    }),
  );
  const goods = Array.from({ length: 40 }, (_, i) => card(`toy-${i}`, "collectibles"));
  const home = {
    recent: [...jobs, ...services, ...goods],
    motors,
    totalActive: 100,
    onlineMerchandise: [],
  };
  const c = context({
    useSuspenseQuery: () => ({ data: home }),
    useQuery: () => ({ data: { motors: motors.slice(0, 4) } }),
  });
  const rows = nodes(c.HomeSections({ where: c.homeLocation("", undefined, 25) })).filter(
    (n) => n.type === "HomepageListingRow",
  );
  for (const title of [
    "Fresh local finds",
    "New vehicle arrivals",
    "Trucks, SUVs & pickups",
    "Affordable vehicles",
    "Jobs hiring now",
    "Flexible and part-time work",
    "Services for your next project",
    "Home services and repairs",
  ])
    assert.equal(rows.find((r) => r.props.title === title).props.listings.length, 4, title);
  const fresh = rows.find((r) => r.props.title === "Fresh local finds").props;
  assert.ok(fresh.listings.every(isGeneralHomepageListing));
  const allIds = rows.flatMap((r) => r.props.listings.map((c) => c.id));
  assert.equal(new Set(allIds).size, allIds.length, "rows keep deduplication");
});

function renderedHome(location, point) {
  const headline = ["Cars", "Toys", "Appliances", "Fishing Lures"];
  // Drive the production component's local search inputs without browser APIs.
  const values = [false, headline, false, "chair", "furniture", location, 25, point, false, false];
  let index = 0,
    navigation;
  const c = context({
    useState: (initial) => [values[index++] ?? initial, () => {}],
    useCallback: (fn) => fn,
    useRef: () => ({ current: null }),
    useEffect: () => {},
    useNavigate: () => (value) => {
      navigation = value;
    },
    headlineOptions: [headline],
    MagnifyingGlass: "MagnifyingGlass",
    HomeSearchDropdown: "HomeSearchDropdown",
    HomepageFeaturedCategories: "HomepageFeaturedCategories",
    QueryErrorResetBoundary: "QueryErrorResetBoundary",
    HomepageLeadErrorBoundary: "HomepageLeadErrorBoundary",
    HomepageLeadLoading: "HomepageLeadLoading",
    HomepageLeadVehicles: "HomepageLeadVehicles",
    DeferredHomeSections: "DeferredHomeSections",
    Suspense: "Suspense",
    LocationRadiusPicker: "LocationRadiusPicker",
  });
  const tree = c.Home();
  const where = nodes(tree).find((n) => n.type === "DeferredHomeSections").props.where;
  nodes(tree)
    .find((n) => n.type === "form")
    .props.onSubmit({ preventDefault() {} });
  return { where, navigation: JSON.parse(JSON.stringify(navigation)) };
}

test("city, ZIP, region and state hero selections stay out of homepage cards and category links", () => {
  for (const selection of ["Twin Falls", "83301", "Magic Valley", "Utah"]) {
    const { where, navigation } = renderedHome(selection);
    assert.equal(where.matchesLocation(card("boise", "general")), true, selection);
    assert.equal(
      where.matchesLocation(card("pocatello", "general", { city: "Pocatello" })),
      true,
      selection,
    );
    assert.equal(where.matchesLocation(card("utah", "general", { state: "UT" })), false);
    assert.deepEqual(JSON.parse(JSON.stringify(where.withLocation({ category: "services" }))), {
      category: "services",
      state: "ID",
    });
    assert.equal(navigation.to, "/browse");
    assert.equal(navigation.search.q, "chair");
    assert.equal(navigation.search.category, "furniture");
  }
  const { navigation } = renderedHome("Twin Falls");
  assert.equal(navigation.search.city, "Twin Falls");
  assert.equal(navigation.search.radiusMiles, 25);
  assert.equal(renderedHome("83301").navigation.search.postalCode, "83301");
  assert.equal(renderedHome("Magic Valley").navigation.search.region, "Magic Valley");
  assert.equal(renderedHome("Utah").navigation.search.state, "UT");
});

test("GPS and map points affect the submitted search, while homepage rows remain statewide", () => {
  const point = { latitude: 42.56, longitude: -114.46, city: "Twin Falls" };
  const { where, navigation } = renderedHome("Twin Falls", point);
  assert.equal(where.matchesLocation(card("boise", "general")), true);
  assert.equal(where.hasLocalArea, false);
  assert.equal(where.feedLocation.latitude, undefined);
  assert.equal(navigation.search.latitude, point.latitude);
  assert.equal(navigation.search.longitude, point.longitude);
  assert.equal(navigation.search.radiusMiles, 25);
});
