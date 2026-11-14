import test from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import { readFileSync } from "node:fs";
import ts from "typescript";
import { mobileListingDetail, mobileListingSummary } from "../src/lib/mobile-listing-detail.ts";
import { listingPresentation } from "../apps/mobile/src/listing-presentation.ts";
import { detailCard } from "../apps/mobile/src/listing-card-data.ts";
import { mobileListingAllowed } from "../src/lib/mobile-contract.ts";
import { detailFixture } from "./support/mobile-detail-fixture.mjs";
import { refreshedHomeSelection } from "../apps/mobile/src/home-refresh-selection.ts";

function fixture(read = async () => detailFixture().general) {
  let install = "fixture-install",
    clock = 0;
  const calls = [],
    exports = {};
  const source = ts.transpileModule(
    readFileSync(new URL("../apps/mobile/src/screen-resources.ts", import.meta.url), "utf8"),
    { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } },
  ).outputText;
  vm.runInNewContext(source, {
    exports,
    Date: { now: () => clock },
    setTimeout,
    clearTimeout,
    require(name) {
      if (name === "./client")
        return {
          api: async (...args) => {
            calls.push(args);
            return read(...args);
          },
        };
      if (name === "./identity") return { installIdentifier: () => install };
      if (name.endsWith("/mobile-listing-detail"))
        return { mobileListingDetail, mobileListingSummary };
      if (name === "./listing-presentation") return { listingPresentation };
      if (name === "./listing-card-data") return { detailCard };
      if (name.endsWith("/mobile-contract")) return { mobileListingAllowed };
      throw Error("Screen reads cannot import other adapters: " + name);
    },
  });
  return {
    ...exports,
    calls,
    resetInstall: () => {
      install = "new-fixture-install";
    },
    advance: (ms) => {
      clock += ms;
    },
  };
}

test("one actor-scoped detail read prepares the next screen without a duplicate fetch", async () => {
  const f = fixture(),
    id = detailFixture().general.listing.id;
  const first = await f.readNativeDetail(id, "buyer");
  assert.equal(first.listing.id, id);
  assert.equal((await f.readNativeDetail(id, "buyer")).listing.id, id);
  assert.equal(f.calls.length, 1);
  assert.equal(f.calls[0][0], `listings/${id}/detail`);
  assert.equal(f.calls[0][4].userId, "buyer");
  assert.equal(f.calls[0][4].installId, "fixture-install");
  assert(!JSON.stringify(first).includes("PRIVATE NEVER EXPORT"));
});

test("account changes and identifier resets cannot reuse earlier screen data", async () => {
  const f = fixture(),
    id = detailFixture().general.listing.id;
  await f.readNativeDetail(id, "buyer");
  assert.equal(f.peekNativeScreen("detail", id, "other"), undefined);
  await f.readNativeDetail(id, "other");
  f.resetInstall();
  assert.equal(f.peekNativeScreen("detail", id, "other"), undefined);
  await f.readNativeDetail(id, "other");
  assert.equal(f.calls.length, 3);
  assert.equal(f.calls[2][4].installId, "new-fixture-install");
});

test("a late request cannot repopulate the cache after account clearing or cancellation", async () => {
  for (const abort of [false, true]) {
    let release;
    const f = fixture(
        () =>
          new Promise((resolve) => {
            release = resolve;
          }),
      ),
      c = new AbortController();
    const id = detailFixture().general.listing.id;
    const pending = f.readNativeDetail(id, "buyer", c.signal);
    const rejected = assert.rejects(pending);
    if (abort) c.abort();
    else f.clearNativeScreenResources();
    release(detailFixture().general);
    await rejected;
    assert.equal(f.peekNativeScreen("detail", id, "buyer"), undefined);
  }
});

test("expired entries refresh; a forced retry bypasses a recent failure", async () => {
  let fail = false;
  const f = fixture(async () => {
    if (fail) throw Error("Temporarily unavailable");
    return detailFixture().general;
  });
  const id = detailFixture().general.listing.id;
  await f.readNativeDetail(id);
  f.advance(60001);
  await f.readNativeDetail(id);
  assert.equal(f.calls.length, 2);
  f.clearNativeScreenResources();
  fail = true;
  await assert.rejects(f.readNativeDetail(id), /Temporarily unavailable/);
  fail = false;
  await f.readNativeDetail(id, undefined, undefined, true);
  assert.equal(f.calls.length, 4);
});

test("the process cache is bounded, including failed destinations", async () => {
  const f = fixture();
  for (let i = 0; i < 13; i++) await f.readNativeDetail(`id-${i}`);
  assert.equal(f.peekNativeScreen("detail", "id-0"), undefined);
  assert(f.peekNativeScreen("detail", "id-12"));
  const failed = fixture(async () => {
    throw Error("Unavailable");
  });
  for (let i = 0; i < 13; i++) await assert.rejects(failed.readNativeDetail(`id-${i}`));
  assert.equal(failed.peekNativeScreen("detail", "id-0"), undefined);
});

test("browse preparation retains exact filters and excludes app-ineligible inventory", async () => {
  const allowed = { id: "chair", title: "Chair", categorySlug: "home-garden" };
  const f = fixture(async () => ({
    items: [allowed, { id: "restricted", title: "Ammunition", categorySlug: "home-garden" }],
    total: 2,
    page: 1,
    pageSize: 24,
    nextPage: null,
  }));
  const query = "category=home-garden&city=Boise&priceMax=100&sort=price_low";
  const data = await f.readNativeBrowse(query, "buyer");
  assert.equal(f.calls[0][0], "search?" + query);
  assert.equal(data.items.length, 1);
  assert.equal(data.items[0].id, "chair");
  assert.equal(f.calls.length, 1);
});

test("a Home refresh changes discovery exposure without creating inventory or mutating search data", () => {
  const cards = Array.from({ length: 12 }, (_, i) => ({ id: String(i) }));
  const home = { motors: cards, recent: [...cards] };
  assert.equal(refreshedHomeSelection(home, 0), home);
  const result = refreshedHomeSelection(home, 1);
  assert.notEqual(result.motors[0].id, home.motors[0].id);
  assert.deepEqual(result.motors.map((c) => c.id).sort(), cards.map((c) => c.id).sort());
  assert.equal(home.motors[0].id, "0");
  assert.equal(refreshedHomeSelection(home, -1), home);
  assert.equal(refreshedHomeSelection(home, NaN), home);
});
