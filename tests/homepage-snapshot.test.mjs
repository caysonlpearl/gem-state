import test from "node:test";
import assert from "node:assert/strict";
import {
  createHomepageSnapshotCache,
  readHomepageSnapshot,
} from "../src/lib/homepage-snapshot.server.ts";
import { buildHomepageSnapshot } from "../src/lib/homepage-snapshot-build.server.ts";
import {
  HOME_MAX_STALE_MS,
  HOME_CACHE_LAYOUT_VERSION,
  HOME_SOURCE_KEYS,
  homepagePayload,
  homepageCard,
} from "../src/lib/homepage-snapshot-contract.ts";

const card = (id, extra = {}) => ({
  id,
  title: id,
  productId: id,
  productSlug: id,
  priceCents: 1000,
  currency: "USD",
  city: "Boise",
  state: "ID",
  region: "Treasure Valley",
  categorySlug: "general",
  categoryName: "General",
  condition: "used_good",
  fulfillmentMode: "local_pickup",
  createdAt: "2026-10-30T12:00:00Z",
  isFeatured: false,
  imageUrl: null,
  vehicle: null,
  ...extra,
});
const snapshot = (now, cards = [card("saved")]) => ({
  version: 1,
  layoutVersion: HOME_CACHE_LAYOUT_VERSION,
  generatedAt: now,
  sections: {
    native: {
      updatedAt: now,
      cards,
      total: cards.length,
      categoryCounts: { general: cards.length },
    },
  },
});
function store(initial) {
  const leases = new Set();
  return {
    value: initial,
    reads: 0,
    writes: 0,
    async read() {
      this.reads++;
      return this.value;
    },
    async write(value) {
      this.writes++;
      this.value = value;
    },
    async acquire(slot) {
      if (leases.has(slot)) return false;
      leases.add(slot);
      return true;
    },
  };
}

test("cold homepage reads reuse the shared CDN URL instead of bypassing its cache every minute", async (t) => {
  const before = process.env.GEM_STATE_SUPABASE_URL;
  process.env.GEM_STATE_SUPABASE_URL = "https://homepage-cache.example";
  t.after(() => {
    if (before === undefined) delete process.env.GEM_STATE_SUPABASE_URL;
    else process.env.GEM_STATE_SUPABASE_URL = before;
  });
  const requests = [];
  t.mock.method(globalThis, "fetch", async (url) => {
    requests.push(String(url));
    return new Response(JSON.stringify(snapshot(Date.now())), { status: 200 });
  });
  await readHomepageSnapshot();
  assert.deepEqual(requests, [
    "https://homepage-cache.example/storage/v1/object/public/homepage-snapshots/v1/home.json",
  ]);
});

test("a cold server reads shared saved data without building, signing or requesting providers", async () => {
  const saved = snapshot(1000);
  const storage = store(saved);
  let builds = 0;
  const cache = createHomepageSnapshotCache(
    storage,
    () => {
      builds++;
      throw Error("must not build during page reads");
    },
    () => 1001,
  );
  const [a, b] = await Promise.all([cache.read(), cache.read()]);
  assert.deepEqual(a, saved);
  assert.equal(a, b);
  assert.equal(storage.reads, 1);
  assert.equal(builds, 0);
  assert.equal((await cache.refresh()).reason, "fresh");
  assert.equal(builds, 0);
});

test("an older cache layout stays readable while the background refresh upgrades it", async () => {
  const old = snapshot(1000);
  delete old.layoutVersion;
  const storage = store(old);
  let builds = 0;
  const cache = createHomepageSnapshotCache(
    storage,
    async () => {
      builds++;
      return snapshot(1001);
    },
    () => 1001,
  );
  assert.equal((await cache.read()).sections.native.cards[0].id, "saved");
  assert.equal(builds, 0, "a page read never builds inventory");
  assert.equal((await cache.refresh()).refreshed, true);
  assert.equal(builds, 1);
  assert.equal((await cache.refresh()).reason, "fresh");
});

test("the saved services pool retains all landing trades instead of stopping after 24 businesses", async () => {
  const now = Date.now();
  const sources = Object.fromEntries(
    HOME_SOURCE_KEYS.map((key) => [key, async () => ({ cards: [] })]),
  );
  sources.services = async () => ({
    cards: Array.from({ length: 112 }, (_, index) =>
      card(`service-${index}`, {
        categorySlug: "services",
        service: { subcategory: `trade-${Math.floor(index / 8)}` },
      }),
    ),
  });
  const saved = await buildHomepageSnapshot(null, { sources, removed: async () => new Set(), now });
  assert.equal(saved.sections.services.cards.length, 112);
  assert.equal(new Set(saved.sections.services.cards.map((c) => c.service.subcategory)).size, 14);
});

test("stale data survives database/build failures and failed refreshes never overwrite it", async () => {
  let now = 1000;
  const storage = store(snapshot(now));
  const cache = createHomepageSnapshotCache(
    storage,
    async () => {
      throw Error("database down");
    },
    () => now,
  );
  await cache.read();
  now += 600000;
  await assert.rejects(cache.refresh(), /database down/);
  storage.read = async () => {
    throw Error("storage temporary failure");
  };
  assert.equal((await cache.read()).sections.native.cards[0].id, "saved");
  assert.equal(storage.writes, 0);
  now += HOME_MAX_STALE_MS;
  await assert.rejects(cache.read(), /temporarily unavailable/);
});

test("separate server instances share a distributed refresh lease", async () => {
  const storage = store(snapshot(1000));
  let builds = 0;
  let finish;
  const build = () => {
    builds++;
    return new Promise((resolve) => {
      finish = resolve;
    });
  };
  const a = createHomepageSnapshotCache(storage, build, () => 601000);
  const b = createHomepageSnapshotCache(storage, build, () => 601000);
  const first = a.refresh();
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal((await b.refresh()).reason, "in_progress");
  assert.equal(builds, 1);
  assert.equal((await b.read()).sections.native.cards[0].id, "saved");
  finish(snapshot(601000, [card("new")]));
  await first;
  const cold = createHomepageSnapshotCache(storage, build, () => 601001);
  assert.equal((await cold.read()).sections.native.cards[0].id, "new");
  assert.equal(storage.writes, 1);
});

test("missing storage is an error, never cached empty inventory or a paid-provider fallback", async () => {
  let builds = 0;
  const cache = createHomepageSnapshotCache(
    store(null),
    async () => {
      builds++;
      return snapshot(10);
    },
    () => 11,
  );
  await assert.rejects(cache.read(), /temporarily unavailable/);
  assert.equal(builds, 0);
  await cache.refresh();
  assert.equal(builds, 1);
  assert.equal((await cache.read()).sections.native.cards.length, 1);
});

test("source failures retain only that source's last-good age; other sources update and moderation still applies", async () => {
  const now = 100000000;
  const previous = snapshot(now - 3600000, [card("old-native")]);
  previous.sections.vehicles = {
    updatedAt: now - 3600000,
    cards: [card("old-car"), card("removed-car")],
  };
  previous.sections.homes = {
    updatedAt: now - HOME_MAX_STALE_MS - 1,
    cards: [card("too-old-home")],
  };
  const sources = Object.fromEntries(
    HOME_SOURCE_KEYS.map((key) => [key, async () => ({ cards: [] })]),
  );
  sources.native = async () => ({ cards: [card("new-native")], total: 1 });
  sources.vehicles = sources.homes = async () => {
    throw Error("timeout");
  };
  const next = await buildHomepageSnapshot(previous, {
    sources,
    now,
    removed: async () => new Set(["removed-car"]),
  });
  assert.equal(next.sections.native.cards[0].id, "new-native");
  assert.equal(next.sections.vehicles.updatedAt, previous.sections.vehicles.updatedAt);
  assert.deepEqual(
    next.sections.vehicles.cards.map((c) => c.id),
    ["old-car"],
  );
  assert.equal(next.sections.homes, undefined);
  assert.deepEqual(next.sections.jobs.cards, []);
});

test("the cached payload keeps Idaho cars in the first row and the wider motors categories below", () => {
  const now = Date.now();
  const s = snapshot(now, [
    card("native-car", { categorySlug: "cars-trucks", vehicle: { make: "Toyota" } }),
    card("trailer", { categorySlug: "trailers", vehicle: null }),
  ]);
  s.sections.vehicles = {
    updatedAt: now,
    cards: [
      ...s.sections.native.cards,
      card("ut-car", { state: "UT", categorySlug: "cars-trucks", vehicle: { make: "Ford" } }),
    ],
  };
  const { lead, home } = homepagePayload(s, now);
  assert.deepEqual(
    lead.motors.map((c) => c.id),
    ["native-car"],
  );
  assert.deepEqual(home.motors.map((c) => c.id).sort(), ["native-car", "trailer"]);
});

test("public snapshot cards never retain raw payloads, private account data or detail galleries", () => {
  const output = homepageCard(
    card("public", {
      raw: { secret: "x" },
      seller: { userId: "private" },
      sellerNote: "private",
      images: ["private"],
      description: "long detail",
      externalVehicle: { sourceKind: "dealer", raw: { secret: "x" }, media: ["large"] },
    }),
  );
  for (const key of ["raw", "seller", "sellerNote", "images", "description"])
    assert.equal(key in output, false);
  assert.deepEqual(output.externalVehicle, { sourceKind: "dealer" });
});
