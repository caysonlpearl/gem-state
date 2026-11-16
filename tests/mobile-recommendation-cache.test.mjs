import test from "node:test";
import assert from "node:assert/strict";
import { createRecommendationCache } from "../apps/mobile/src/recommendation-cache.ts";
const owner = { actor: "member:one", policy: "2026-11-12", historyAfter: "2026-11-16T00:00:00Z" };
const rows = {
  recent: [{ id: "private-history" }],
  continuing: [{ id: "private-continuation" }],
  recommended: [{ id: "public-card" }],
  vehicles: [{ id: "public-vehicle" }],
  model: "rules-v1",
};
function fixture() {
  const data = new Map(),
    storage = {
      getItem: (k) => data.get(k) ?? null,
      setItem: (k, v) => data.set(k, v),
      removeItem: (k) => data.delete(k),
    };
  let now = Date.now();
  const make = () =>
    createRecommendationCache(
      (v) => Boolean(v && typeof v.id === "string"),
      () => storage,
      () => now,
    );
  return {
    cache: make(),
    make,
    data,
    tick: (ms) => {
      now += ms;
    },
  };
}
test("a fresh app can restore public recommendation cards only with the same fresh consent proof", () => {
  const f = fixture();
  f.cache.write(owner, rows);
  const restored = f.make().read(owner);
  assert.deepEqual(restored.recommended, rows.recommended);
  assert.deepEqual(restored.recent, []);
  assert.deepEqual(restored.continuing, []);
  const stored = [...f.data.values()][0];
  assert(!stored.includes("private-history") && !stored.includes("private-continuation"));
});
test("another account, newer policy or cleared history cannot reuse a previous snapshot", () => {
  for (const change of [
    { actor: "member:two" },
    { policy: "new" },
    { historyAfter: "2026-11-16T01:00:00Z" },
  ]) {
    const f = fixture();
    f.cache.write(owner, rows);
    assert.equal(f.cache.read({ ...owner, ...change }), null);
    assert.equal(f.data.size, 0);
  }
});
test("snapshots expire, reject future timestamps, and clear immediately on withdrawal/logout", () => {
  const f = fixture();
  f.cache.write(owner, rows);
  f.tick(15 * 60000 + 1);
  assert.equal(f.cache.read(owner), null);
  f.cache.write(owner, rows);
  f.tick(-1);
  assert.equal(f.cache.read(owner), null);
  f.cache.write(owner, rows);
  f.cache.clear();
  assert.equal(f.cache.read(owner), null);
});
test("corrupt or unavailable storage never blocks live browsing", () => {
  const f = fixture();
  f.data.set("bluebird-personalized-feed-v1", "invalid");
  assert.equal(f.cache.read(owner), null);
  const blocked = createRecommendationCache(
    () => true,
    () => {
      throw Error("blocked");
    },
  );
  assert.doesNotThrow(() => blocked.write(owner, rows));
  assert.equal(blocked.read(owner), null);
  assert.doesNotThrow(blocked.clear);
});
