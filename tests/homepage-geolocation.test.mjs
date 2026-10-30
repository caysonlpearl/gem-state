import test from "node:test";
import assert from "node:assert/strict";
let instance = 0;
const fresh = () => import(`../src/lib/homepage-geolocation.ts?case=${++instance}`);
function browser(state = "prompt", result = { latitude: 42.562786, longitude: -114.460123 }) {
  const saved = new Map();
  let requests = 0;
  return {
    saved,
    get requests() {
      return requests;
    },
    permissions: { query: async () => ({ state }) },
    storage: { getItem: (key) => saved.get(key), setItem: (key, value) => saved.set(key, value) },
    geolocation: {
      getCurrentPosition(success, error, options) {
        requests++;
        assert.equal(options.enableHighAccuracy, false);
        result ? success({ coords: result }) : error({ code: 1 });
      },
    },
  };
}
test("first visit requests permission without storing coordinates and never repeats a denied/dismissed prompt", async () => {
  const { requestHomepageLocation, HOME_LOCATION_REQUESTED } = await fresh();
  const b = browser("prompt", null);
  assert.equal(await requestHomepageLocation(b), null);
  assert.equal(await requestHomepageLocation(b), null);
  assert.equal(b.requests, 1);
  assert.deepEqual([...b.saved], [[HOME_LOCATION_REQUESTED, "1"]]);
});
test("an existing grant uses coarse location again on later visits without requiring another prompt", async () => {
  const { requestHomepageLocation } = await fresh();
  const b = browser("granted");
  assert.deepEqual(await requestHomepageLocation(b), { latitude: 42.563, longitude: -114.46 });
  await requestHomepageLocation(b);
  assert.equal(b.requests, 2);
});
test("a denied or unsupported browser leaves statewide listings available", async () => {
  const { requestHomepageLocation } = await fresh();
  const b = browser("denied");
  assert.equal(await requestHomepageLocation(b), null);
  assert.equal(b.requests, 0);
  assert.equal(await requestHomepageLocation({}), null);
});
test("manual use can retry a dismissed prompt and blocked storage does not cause repeated automatic prompts", async () => {
  const { requestHomepageLocation } = await fresh();
  const b = browser("prompt", null);
  b.storage = {
    getItem() {
      throw Error("blocked");
    },
    setItem() {
      throw Error("blocked");
    },
  };
  await requestHomepageLocation(b);
  await requestHomepageLocation(b);
  await requestHomepageLocation(b, false);
  assert.equal(b.requests, 2);
});
test("concurrent mounts share one pending geolocation request", async () => {
  const { requestHomepageLocation } = await fresh();
  const b = browser();
  let finish;
  b.geolocation.getCurrentPosition = (success) => {
    finish = success;
  };
  const a = requestHomepageLocation(b),
    c = requestHomepageLocation(b);
  await new Promise((resolve) => setImmediate(resolve));
  finish({ coords: { latitude: 43.6, longitude: -116.2 } });
  assert.deepEqual(await a, await c);
  assert.deepEqual(await c, { latitude: 43.6, longitude: -116.2 });
});
