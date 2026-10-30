import test from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import { readFileSync } from "node:fs";
const load = (file) =>
  readFileSync(new URL(`../tools/fb-import-extension/${file}`, import.meta.url), "utf8");
const delay = (ms) => new Promise((r) => setTimeout(r, ms));
function harness({ failCreate = false, unreadable = "", challenge = "" } = {}) {
  let id = 0,
    open = 0,
    maxOpen = 0,
    active = 0,
    maxActive = 0,
    creates = 0;
  const tabs = new Map(),
    seen = [],
    messages = [],
    listeners = [];
  const context = vm.createContext({
    URL,
    console,
    setTimeout,
    clearTimeout,
    Date,
    Math,
    chrome: {
      windows: {
        async create() {
          creates++;
          if (failCreate && creates === 1) {
            await delay(10);
            throw Error("window failed");
          }
          const tabId = ++id;
          tabs.set(tabId, { id: tabId, status: "complete", url: "about:blank" });
          open++;
          maxOpen = Math.max(maxOpen, open);
          return { id: tabId, tabs: [{ id: tabId }] };
        },
        async remove() {
          open--;
        },
        async update() {},
      },
      tabs: {
        async update(tabId, { url }) {
          tabs.set(tabId, { id: tabId, url, status: "complete" });
        },
        get(tabId, callback) {
          const tab = tabs.get(tabId);
          if (callback) callback(tab);
          else return Promise.resolve(tab);
        },
        onUpdated: { addListener() {}, removeListener() {} },
        async sendMessage(_id, payload) {
          messages.push(payload.payload);
        },
      },
      runtime: {
        onMessage: {
          addListener(fn) {
            listeners.push(fn);
          },
        },
      },
      action: { onClicked: { addListener() {} } },
    },
    async exec(tabId, fn) {
      const url = tabs.get(tabId).url;
      if (fn.name === "isBotCheckPage") return url === challenge;
      if (fn.name === "readerAccessRestriction") return null;
      active++;
      maxActive = Math.max(maxActive, active);
      seen.push(url);
      await delay(5);
      active--;
      if (url === unreadable) return null;
      return url.endsWith("/sold")
        ? { unavailable: true, sold: true }
        : { title: url, priceCents: 100, description: "read " + url };
    },
  });
  vm.runInContext(load("background.js"), context);
  for (const f of ["paced-reader.js", "ksl.js", "vinted.js", "whatnot.js", "dealer.js"])
    vm.runInContext(load(f), context);
  // Navigation is independently exercised below. These queue tests isolate
  // worker scheduling, identity checks, outcomes and window cleanup.
  context.sleep = async () => delay(0);
  context.waitForPage = async () => true;
  context.exec = async (tabId, fn) => {
    const url = tabs.get(tabId).url;
    if (fn.name === "isBotCheckPage") return url === challenge;
    if (fn.name === "readerAccessRestriction") return null;
    active++;
    maxActive = Math.max(maxActive, active);
    seen.push(url);
    await delay(5);
    active--;
    return url === unreadable
      ? null
      : url.endsWith("/sold")
        ? { unavailable: true, sold: true }
        : { title: url, priceCents: 100, description: "read " + url };
  };
  return {
    context,
    tabs,
    seen,
    messages,
    listeners,
    stats: () => ({ open, maxOpen, maxActive, creates }),
  };
}
const jobs = Array.from({ length: 9 }, (_, i) => ({
  item: { sourceUrl: "https://source.test/" + i },
  siteName: "Test",
  idOf: (u) => new URL(u).pathname,
  extract: function extract() {},
}));
test("one import reads each listing once through exactly two reusable windows, and closes both", async () => {
  const h = harness();
  let done = 0;
  await h.context.readListingJobs(
    structuredClone(jobs.map((j) => j.item)).map((item) => ({ ...jobs[0], item })),
    { onItemDone: () => done++ },
  );
  assert.equal(done, 9);
  assert.equal(h.seen.length, 9);
  assert.equal(new Set(h.seen).size, 9);
  assert.deepEqual(h.stats(), { open: 0, maxOpen: 2, maxActive: 2, creates: 2 });
});
test("a reader-window creation failure waits for the surviving worker and leaves no background run", async () => {
  const h = harness({ failCreate: true });
  const input = jobs.map((j) => ({ ...j, item: { ...j.item } }));
  await h.context.readListingJobs(input);
  assert.equal(h.seen.length, 9);
  assert.equal(h.stats().open, 0);
  assert.equal(input.filter((j) => j.item.unreadable).length, 0);
});
test("unreadable records remain distinct from explicitly sold records", async () => {
  const h = harness({ unreadable: "https://source.test/broken" });
  const input = ["broken", "sold", "fine"].map((x) => ({
    ...jobs[0],
    item: { sourceUrl: "https://source.test/" + x },
  }));
  await h.context.readListingJobs(input);
  assert.equal(input[0].item.unreadable, true);
  assert.equal(input[0].item.unavailable, undefined);
  assert.equal(input[1].item.unavailable, true);
  assert.equal(input[1].item.sold, true);
  assert.equal(input[2].item.unreadable, undefined);
  assert.equal(h.stats().open, 0);
});
test("Refresh all shares one two-window pool across Facebook, KSL, Vinted, Whatnot and dealer URLs", async () => {
  const h = harness();
  const urls = [
    "https://www.facebook.com/marketplace/item/1",
    "https://classifieds.ksl.com/listing/2",
    "https://www.vinted.com/items/3-test",
    "https://www.whatnot.com/listing/test",
    "https://www.diesel-depot.com/inventory/?/listing/for-sale/5/test",
  ];
  await h.context.refreshListings(
    1,
    "test",
    urls.concat(urls[0], "https://unsupported.test/item").map((sourceUrl) => ({ sourceUrl })),
  );
  const result = h.messages.find((m) => m.type === "gemlist-fb-refresh-result");
  assert.equal(result.results.length, 5);
  assert.equal(result.unreadable, 1);
  assert.equal(new Set(h.seen).size, 5);
  assert.equal(h.stats().maxOpen, 2);
  assert.equal(h.stats().open, 0);
  assert.deepEqual(
    JSON.parse(
      JSON.stringify(h.messages.filter((m) => m.type === "gemlist-fb-refresh-progress").at(-1)),
    ),
    { type: "gemlist-fb-refresh-progress", requestId: "test", done: 6, total: 6 },
  );
});
test("a concurrent Refresh request returns a visible busy error instead of opening more windows", async () => {
  const h = harness();
  h.listeners[0](
    {
      type: "refresh",
      requestId: "one",
      targets: [{ sourceUrl: "https://classifieds.ksl.com/listing/1" }],
    },
    { tab: { id: 1 } },
  );
  h.listeners[0](
    {
      type: "refresh",
      requestId: "two",
      targets: [{ sourceUrl: "https://classifieds.ksl.com/listing/2" }],
    },
    { tab: { id: 1 } },
  );
  await delay(30);
  assert.match(h.messages.find((m) => m.requestId === "two").error, /already running/);
  assert.equal(h.stats().creates, 1);
  assert.equal(h.stats().open, 0);
});
test("waitForPage refuses a complete but wrong listing and cleans up its listener", async () => {
  let listeners = 0;
  const c = vm.createContext({
    setTimeout: (fn, ms) => setTimeout(fn, ms === 25000 ? 10 : 1),
    clearTimeout,
    chrome: {
      tabs: {
        get(_id, cb) {
          cb({ status: "complete", url: "https://source.test/old" });
        },
        onUpdated: {
          addListener() {
            listeners++;
          },
          removeListener() {
            listeners--;
          },
        },
      },
    },
  });
  vm.runInContext(load("paced-reader.js"), c);
  assert.equal(await c.waitForPage(1, (u) => u.endsWith("/new")), false);
  assert.equal(listeners, 0);
  assert.equal(await c.waitForPage(1, (u) => u.endsWith("/old")), true);
  assert.equal(listeners, 0);
});

test("two challenged windows receive separate serialized manual handoffs without navigating again", async () => {
  const h = harness();
  const challengeUrls = new Set(["https://source.test/a", "https://source.test/b"]);
  const originalExec = h.context.exec;
  h.context.exec = async (tabId, fn) =>
    fn.name === "isBotCheckPage"
      ? challengeUrls.has(h.tabs.get(tabId).url)
      : originalExec(tabId, fn);
  let active = 0,
    max = 0,
    handoffs = 0,
    navigations = 0;
  const originalUpdate = h.context.chrome.tabs.update;
  h.context.chrome.tabs.update = async (...args) => {
    navigations++;
    return originalUpdate(...args);
  };
  h.context.waitForHuman = async (_win, tabId) => {
    handoffs++;
    active++;
    max = Math.max(max, active);
    await delay(5);
    challengeUrls.delete(h.tabs.get(tabId).url);
    active--;
    return true;
  };
  await h.context.readListingJobs(
    [...challengeUrls].map((sourceUrl) => ({ ...jobs[0], item: { sourceUrl } })),
  );
  assert.equal(handoffs, 2);
  assert.equal(max, 1);
  assert.equal(navigations, 2);
  assert.equal(h.seen.length, 2);
  assert.equal(h.stats().open, 0);
});
test("Refresh all reports unreadable counts grouped by site and reason, without listing text", async () => {
  const broken = "https://www.vinted.com/items/9-broken";
  const h = harness({ unreadable: broken });
  await h.context.refreshListings(
    1,
    "diag",
    [
      "https://www.vinted.com/items/3-test",
      broken,
      "https://unsupported.test/item",
      "https://classifieds.ksl.com/listing/2",
    ].map((sourceUrl) => ({ sourceUrl })),
  );
  const result = h.messages.find((m) => m.type === "gemlist-fb-refresh-result");
  const reasons = JSON.parse(JSON.stringify(result.unreadableReasons)).sort((a, b) =>
    a.site.localeCompare(b.site),
  );
  assert.equal(result.unreadable, 2);
  assert.deepEqual(reasons, [
    { site: "Unknown site", reason: "unsupported_url", count: 1 },
    { site: "Vinted", reason: "empty_result", count: 1 },
  ]);
  assert.doesNotMatch(JSON.stringify(reasons), /https?:|broken|read /);
});
test("a page that never finishes loading is reported as a timeout", async () => {
  const h = harness();
  h.context.waitForPage = async () => false;
  const input = [{ ...jobs[0], item: { sourceUrl: "https://source.test/slow" } }];
  await h.context.readListingJobs(input);
  assert.equal(input[0].item.unreadable, true);
  assert.equal(input[0].item.unreadableReason, "page_timeout");
});
test("extraction injection errors, empty results and challenges get distinct codes", async () => {
  for (const [behavior, code] of [
    [
      () => {
        throw new Error("Frame removed https://private");
      },
      "injection_failed",
    ],
    [() => null, "empty_result"],
    [() => ({ challenge: true }), "challenge_detected"],
  ]) {
    const h = harness();
    h.context.exec = async (_t, fn) => (fn.name === "isBotCheckPage" ? false : behavior());
    const input = [{ ...jobs[0], item: { sourceUrl: "https://source.test/x" } }];
    await h.context.readListingJobs(input);
    assert.equal(input[0].item.unreadable, true);
    assert.equal(input[0].item.unreadableReason, code);
    assert.equal(input[0].item.title, undefined);
  }
});

test("rate-limited pages stop subsequent source requests without marking listings unavailable", async () => {
  const h = harness();
  const originalExec = h.context.exec;
  const navigated = [];
  const update = h.context.chrome.tabs.update;
  h.context.chrome.tabs.update = async (id, value) => {
    navigated.push(value.url);
    return update(id, value);
  };
  h.context.exec = async (id, fn) =>
    fn.name === "readerAccessRestriction" ? "rate_limited" : originalExec(id, fn);
  const input = jobs.map((job) => ({ ...job, siteName: "Vinted", item: { ...job.item } }));
  const blockedSites = new Map();
  await h.context.readListingJobs(input, { blockedSites });
  assert.equal(navigated.length, 1);
  assert.equal(h.stats().maxOpen, 1);
  assert.equal(h.stats().open, 0);
  assert.equal(blockedSites.get("Vinted"), "rate_limited");
  assert.ok(input.every(({ item }) => item.unreadableReason === "rate_limited"));
  assert.ok(input.every(({ item }) => item.unavailable === undefined));
  await h.context.readListingJobs(
    [{ ...input[0], item: { sourceUrl: "https://source.test/next" } }],
    { blockedSites },
  );
  assert.equal(navigated.length, 1);
});

test("rate-limit recognition uses the actual page heading, not product-description words", () => {
  const c = vm.createContext({
    document: { title: "You are rate limited | Vinted", querySelector: () => null },
  });
  vm.runInContext(load("paced-reader.js"), c);
  assert.equal(c.readerAccessRestriction(), "rate_limited");
  c.document = {
    title: "Vintage watch | Vinted",
    querySelector: () => ({ innerText: "Vintage watch" }),
  };
  assert.equal(c.readerAccessRestriction(), null);
});
