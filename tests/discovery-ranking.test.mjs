import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import ts from "typescript";
import {
  selectDiscoveryCards,
  discoverySellerKey,
  discoverySellerToken,
} from "../src/lib/discovery-ranking.ts";
import { selectLandingCoverage } from "../src/lib/landing-coverage.ts";
import {
  allocateHomepageRows,
  initialHomepagePayload,
} from "../src/lib/homepage-initial-payload.ts";
import {
  homepageCard,
  homepagePayload,
  HOME_CACHE_LAYOUT_VERSION,
} from "../src/lib/homepage-snapshot-contract.ts";
const card = (id, seller, state = "ID", extra = {}) => ({
  id,
  title: id,
  discoverySellerKey: seller,
  state,
  city: "Boise",
  categorySlug: "cars-trucks",
  priceCents: 1000000,
  createdAt: "2026-11-01T00:00:00Z",
  isFeatured: false,
  vehicle: { bodyStyle: "SUV" },
  ...extra,
});
test("a refresh flood cannot fill a row when other Idaho sellers are available", () => {
  const flood = Array.from({ length: 200 }, (_, i) => card(`new-${i}`, "dealer-a"));
  const other = [
    card("older-b", "dealer-b"),
    card("older-c", "dealer-c"),
    card("older-d", "dealer-d"),
  ];
  const picked = selectDiscoveryCards([...flood, ...other], 4);
  assert.equal(new Set(picked.map(discoverySellerKey)).size, 4);
  assert.deepEqual(
    picked.map((c) => c.id),
    ["new-0", "older-b", "older-c", "older-d"],
  );
  assert.equal(
    selectDiscoveryCards(flood, 4).length,
    4,
    "a single seller still fills a sparse category",
  );
});
test("Idaho precedes newer featured regional listings, including regional sellers with no local duplicate", () => {
  const regional = Array.from({ length: 20 }, (_, i) =>
    card(`ut-${i}`, `ut-seller-${i}`, "UT", { isFeatured: true }),
  );
  const local = [card("id-a", "a"), card("id-a2", "a"), card("id-b", "b")];
  const picked = selectDiscoveryCards([...regional, ...local], 4);
  assert.deepEqual(
    picked.map((c) => c.state),
    ["ID", "ID", "ID", "UT"],
  );
  assert.equal(new Set(picked.map((c) => c.id)).size, 4);
});
test("consecutive rows balance known sellers while preserving caller price order among their selections", () => {
  const pool = ["a", "b", "c"].flatMap((seller, s) =>
    Array.from({ length: 12 }, (_, i) =>
      card(`${seller}-${i}`, seller, "ID", { priceCents: 100 + s * 100 + i }),
    ),
  );
  const counts = new Map();
  let rest = [...pool];
  for (let i = 0; i < 5; i++) {
    const row = selectDiscoveryCards(rest, 4, counts);
    assert.equal(new Set(row.map(discoverySellerKey)).size, 3);
    assert.deepEqual(
      row.map((c) => c.priceCents),
      row.map((c) => c.priceCents).sort((a, b) => a - b),
    );
    rest = rest.filter((c) => !row.some((p) => p.id === c.id));
  }
  assert.ok(Math.max(...counts.values()) - Math.min(...counts.values()) <= 1);
});
test("native seller grouping survives public projection without exposing account identifiers", () => {
  const privateId = "00000000-0000-4000-8000-000000000007";
  const token = discoverySellerToken("member", privateId);
  assert.equal(token, discoverySellerToken("member", privateId));
  assert.notEqual(token, discoverySellerToken("member", "different-owner"));
  const output = homepageCard(card("one", token, "ID", { seller: { userId: privateId } }));
  assert.equal(output.discoverySellerKey, token);
  assert.ok(!JSON.stringify(output).includes(privateId));
  assert.equal("seller" in output, false);
});
test("sellers are real businesses and owners rather than provider names or title prefixes", () => {
  const a = card("one", undefined, "ID", {
    dealer: { displayName: "A", website: "https://www.example.com", city: "Boise" },
  });
  const b = card("two", undefined, "ID", {
    dealer: { displayName: "Another spelling", website: "https://example.com/", city: "BOISE" },
  });
  assert.equal(discoverySellerKey(a), discoverySellerKey(b));
  assert.notEqual(discoverySellerKey(card("unknown-1")), discoverySellerKey(card("unknown-2")));
  assert.equal(
    discoverySellerKey(card("role1", undefined, "ID", { job: { employerName: "Same Employer" } })),
    discoverySellerKey(
      card("role2", undefined, "ID", { job: { employerName: " same employer " } }),
    ),
  );
});
test("cache caps and initial transport preserve alternative sellers and homepage row deduplication", () => {
  const flood = Array.from({ length: 300 }, (_, i) => card(`batch-${i}`, "a"));
  const older = ["b", "c", "d"].flatMap((s) =>
    Array.from({ length: 12 }, (_, i) =>
      card(`${s}-${i}`, s, "ID", { createdAt: "2025-01-01T00:00:00Z" }),
    ),
  );
  const cached = selectLandingCoverage([...flood, ...older], 200);
  assert.equal(new Set(selectDiscoveryCards(cached, 4).map(discoverySellerKey)).size, 4);
  const data = {
    motors: cached,
    recent: [],
    onlineMerchandise: [],
    categoryCounts: {},
    totalActive: cached.length,
  };
  const lead = {
    motors: selectDiscoveryCards(cached, 24),
    categoryCounts: {},
    totalActive: cached.length,
  };
  const original = JSON.stringify(data);
  const rows = allocateHomepageRows(data, lead);
  for (const row of [rows.vehicleListings, rows.truckListings, rows.valueVehicleListings])
    assert.equal(new Set(row.map(discoverySellerKey)).size, 4);
  const projected = initialHomepagePayload(data, lead);
  const after = allocateHomepageRows(projected, lead);
  for (const key of ["vehicleListings", "truckListings", "valueVehicleListings"])
    assert.deepEqual(
      after[key].map((c) => c.id),
      rows[key].map((c) => c.id),
    );
  assert.equal(JSON.stringify(data), original);
  const picks = [
    ...selectDiscoveryCards(lead.motors, 4),
    ...rows.vehicleListings,
    ...rows.truckListings,
    ...rows.valueVehicleListings,
  ];
  assert.equal(new Set(picks.map((c) => c.id)).size, picks.length);
});
test("provider refresh timestamps cannot change a vehicle posting date", () => {
  const source = readFileSync(new URL("../src/lib/marketcheck.server.ts", import.meta.url), "utf8");
  const file = ts.createSourceFile(
    "adapter.ts",
    source,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TS,
  );
  const fn = file.statements.find(
    (n) => ts.isFunctionDeclaration(n) && n.name?.text === "marketCheckCard",
  );
  const context = vm.createContext({
    finalizeMarketCheckListing: (x) => x,
    regionOfListing: () => "",
    marketCheckImages: () => [],
    vehicleOf: () => ({}),
    pickRaw: () => ({}),
    discoverySellerToken,
  });
  vm.runInContext(
    ts.transpile(fn.getText(file).replace(/^export\s+/, ""), { target: ts.ScriptTarget.ES2022 }),
    context,
  );
  const input = {
    id: "dealerfeed-one",
    heading: "Car",
    price: 10000,
    firstSeenAt: "2025-01-01T00:00:00Z",
    lastSeenAt: "2026-11-01T00:00:00Z",
    location: { city: "Boise", state: "ID" },
    sourceKind: "dealer",
    raw: {},
  };
  assert.equal(context.marketCheckCard(input).createdAt, input.firstSeenAt);
  assert.equal(
    context.marketCheckCard({ ...input, lastSeenAt: "2026-11-11T00:00:00Z" }).createdAt,
    input.firstSeenAt,
  );
  assert.equal(
    context.marketCheckCard({ ...input, firstSeenAt: null }).createdAt,
    new Date(0).toISOString(),
  );
});

test("missing provider posting dates do not appear as decades-old listings", () => {
  const source = readFileSync(
    new URL("../src/lib/classifieds-display.ts", import.meta.url),
    "utf8",
  );
  const file = ts.createSourceFile(
    "display.ts",
    source,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TS,
  );
  const fn = file.statements.find(
    (n) => ts.isFunctionDeclaration(n) && n.name?.text === "postedAge",
  );
  const context = vm.createContext({ Date });
  vm.runInContext(
    ts.transpile(fn.getText(file).replace(/^export\s+/, ""), { target: ts.ScriptTarget.ES2022 }),
    context,
  );
  assert.equal(context.postedAge(new Date(0).toISOString()), "");
  assert.equal(context.postedAge(new Date().toISOString()), "Today");
});

test("a rare Idaho seller is not crowded out of later rows after its only card appeared above", () => {
  const a = Array.from({ length: 20 }, (_, i) => card(`a-${i}`, "a"));
  const rare = card("rare-b", "b");
  const c = card("rare-c", "c");
  const counts = new Map();
  const pool = [...a, rare, c];
  const first = selectDiscoveryCards(pool, 4, counts);
  const seen = new Set(first.map((c) => c.id));
  const next = selectDiscoveryCards(pool, 4, counts, seen);
  assert.equal(new Set(next.map(discoverySellerKey)).size, 3);
  assert.ok(next.some((c) => c.id === rare.id));
  assert.ok(next.filter((c) => discoverySellerKey(c) === "a").every((c) => !seen.has(c.id)));
  const regional = [
    card("ut-a", "ut-a", "UT"),
    card("ut-b", "ut-b", "UT"),
    card("ut-c", "ut-c", "UT"),
  ];
  const localFirst = selectDiscoveryCards([rare, ...regional], 4, new Map(), new Set([rare.id]));
  assert.equal(localFirst[0].id, rare.id);
  assert.equal(selectDiscoveryCards(pool, 4, new Map(), new Set(pool.map((c) => c.id))).length, 0);
});

test("Idaho seller priority preserves mixed pet species and border-area dogs", () => {
  const cat = (id, seller) =>
    card(id, seller, "ID", { categorySlug: "pets", vehicle: null, pet: { subcategory: "cats" } });
  const dog = (id, seller, state = "UT") =>
    card(id, seller, state, { categorySlug: "pets", vehicle: null, pet: { subcategory: "dogs" } });
  const pool = [
    cat("cat-a", "a"),
    cat("cat-b", "b"),
    cat("cat-c", "c"),
    cat("cat-d", "d"),
    dog("dog-e", "e"),
  ];
  const picked = selectDiscoveryCards(pool, 4);
  assert.equal(new Set(picked.map((c) => c.pet.subcategory)).size, 2);
  assert.equal(new Set(picked.map(discoverySellerKey)).size, 4);
  assert.equal(picked[0].state, "ID");
  const localDog = selectDiscoveryCards([...pool, dog("local-dog-a", "a", "ID")], 4);
  assert.ok(localDog.every((c) => c.state === "ID"));
  assert.equal(new Set(localDog.map(discoverySellerKey)).size, 4);
  assert.equal(new Set(localDog.map((c) => c.pet.subcategory)).size, 2);
});
