import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import ts from "typescript";
import { homepageCard } from "../src/lib/homepage-snapshot-contract.ts";

const exports = {};
vm.runInNewContext(
  ts.transpile(
    readFileSync(new URL("../src/lib/seo-page-cache.server.ts", import.meta.url), "utf8"),
    { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
  ),
  {
    exports,
    console,
    crypto,
    TextEncoder,
    AbortSignal,
    require(name) {
      if (name === "./homepage-snapshot-contract") return { homepageCard };
      if (name === "./runtime-env.server") return { serverEnv: () => "" };
      throw new Error("Unexpected dependency: " + name);
    },
  },
);
const { createSeoPageCache, SEO_REFRESH_MS, SEO_MAX_STALE_MS, publicSeoPage } = exports;
const page = (heading = "Homes in Idaho") => ({
  heading,
  title: heading,
  description: "Homes",
  lead: "Saved homes",
  statisticsNote: "A bounded sample",
  listings: [],
  total: 10,
  indexable: true,
  relatedCategories: [],
  relatedPlaces: [],
  relatedPlacesHeading: "Nearby",
  browseSearch: { category: "other-real-estate" },
  breadcrumbs: [],
  stats: [],
  priceTables: [],
  regionGroups: [],
  extraLinks: [],
  faq: [],
  recentlySold: [],
});
function fixture() {
  let now = 1_000_000,
    entry = null,
    builds = 0,
    writes = 0,
    failRead = false,
    failWrite = false;
  const leases = new Set(),
    queued = [];
  const store = {
    async read() {
      if (failRead) throw new Error("offline");
      return entry;
    },
    async write(key, value) {
      if (failWrite) throw new Error("offline");
      writes++;
      entry = value;
    },
    async acquire(key, slot) {
      const id = key + slot;
      if (leases.has(id)) return false;
      leases.add(id);
      return true;
    },
    async release(key, slot) {
      leases.delete(key + slot);
    },
  };
  const cache = createSeoPageCache(
    store,
    () => now,
    (key, run) => queued.push(run),
  );
  return {
    cache,
    store,
    queued,
    load: async () => {
      builds++;
      return page();
    },
    setNow: (v) => {
      now = v;
    },
    now: () => now,
    entry: () => entry,
    builds: () => builds,
    writes: () => writes,
    failRead: () => {
      failRead = true;
    },
    failWrite: () => {
      failWrite = true;
    },
  };
}
test("one cold read prepares public data; concurrent reads share it and a second instance reads storage", async () => {
  const f = fixture();
  const results = await Promise.all(Array.from({ length: 10 }, () => f.cache.read("home", f.load)));
  assert.equal(results.length, 10);
  assert.equal(f.builds(), 1);
  assert.equal(f.writes(), 1);
  const other = createSeoPageCache(f.store, f.now);
  await other.read("home", () => {
    throw new Error("Cache hit called inventory/provider");
  });
  assert.equal(f.builds(), 1);
});
test("stale reads return immediately, enqueue refresh and retain the prior page if a source fails", async () => {
  const f = fixture();
  await f.cache.read("home", f.load);
  const saved = f.entry();
  f.setNow(f.now() + SEO_REFRESH_MS + 1);
  const value = await f.cache.read("home", () => {
    throw new Error("source unavailable");
  });
  assert.equal(value.heading, "Homes in Idaho");
  assert.equal(f.queued.length, 1);
  await assert.rejects(f.queued[0](), /source unavailable/);
  assert.equal(f.entry(), saved);
  assert.equal(f.writes(), 1);
});
test("a failed cold build releases its lease so the next request can recover immediately", async () => {
  const f = fixture();
  await assert.rejects(
    f.cache.read("home", async () => {
      throw new Error("temporary source outage");
    }),
    /temporary source outage/,
  );
  assert.equal((await f.cache.read("home", f.load)).heading, "Homes in Idaho");
  assert.equal(f.writes(), 1);
});
test("another cold worker waits for the stored first build without querying inventory", async () => {
  let reads = 0,
    pauses = 0;
  const entry = { version: 1, key: "home", generatedAt: 1000000, value: page() };
  const cache = createSeoPageCache(
    {
      async read() {
        return ++reads >= 4 ? entry : null;
      },
      async write() {
        throw new Error("second worker wrote a duplicate");
      },
      async acquire() {
        return false;
      },
    },
    () => 1000000,
    () => {},
    async () => {
      pauses++;
    },
  );
  const result = await cache.read("home", async () => {
    throw new Error("second worker queried inventory");
  });
  assert.equal(result.heading, "Homes in Idaho");
  assert.equal(pauses, 2);
});
test("successful empty inventory replaces stale cards rather than retaining phantom inventory", async () => {
  const f = fixture();
  await f.cache.read("home", f.load);
  f.setNow(f.now() + SEO_REFRESH_MS + 1);
  await f.cache.read("home", async () => ({ ...page(), total: 0, indexable: false, listings: [] }));
  await f.queued[0]();
  assert.equal(f.entry().value.total, 0);
  assert.equal(f.entry().value.indexable, false);
});
test("expired cached pages cannot mask failed inventory reads", async () => {
  const f = fixture();
  await f.cache.read("home", f.load);
  f.setNow(f.now() + SEO_MAX_STALE_MS + 1);
  f.failRead();
  await assert.rejects(
    f.cache.read("home", async () => {
      throw new Error("source down");
    }),
    /source down/,
  );
});
test("a failed storage write retains the saved object while successful inventory still renders", async () => {
  const f = fixture();
  f.failWrite();
  const value = await f.cache.read("home", f.load);
  assert.equal(value.heading, "Homes in Idaho");
  assert.equal(f.entry(), null);
});
test("shared data excludes raw provider payloads, private fields and expanded galleries", () => {
  const card = {
    id: "marketcheck-1",
    title: "Car",
    priceCents: 100,
    city: "Boise",
    state: "ID",
    region: "Treasure Valley",
    createdAt: "2026-11-01",
    categorySlug: "cars-trucks",
    vehicle: null,
    externalVehicle: {
      sourceKind: "dealer",
      raw: { secret: "DO_NOT_STORE" },
      media: { photos: ["private"] },
    },
    seller: { email: "PRIVATE_CONTACT" },
    images: ["PRIVATE_GALLERY"],
  };
  const safe = publicSeoPage({ ...page(), listings: [card] });
  const serialized = JSON.stringify(safe);
  assert.ok(
    !serialized.includes("DO_NOT_STORE") &&
      !serialized.includes("PRIVATE_CONTACT") &&
      !serialized.includes("PRIVATE_GALLERY"),
  );
  assert.equal(safe.listings[0].externalVehicle.sourceKind, "dealer");
});
