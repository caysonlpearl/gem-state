import test from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import { readFileSync } from "node:fs";
import {
  requestSellerImportScan,
  watchImportRun,
  supportsImportRunStatus,
} from "../src/lib/import-extension-status.ts";

function harness() {
  const listeners = [],
    focused = [],
    tabs = new Map([
      [5, { windowId: 50 }],
      [9, { windowId: 90 }],
    ]);
  const ctx = vm.createContext({
    URL,
    Date,
    Set,
    chrome: {
      runtime: {
        onMessage: {
          addListener(fn) {
            listeners.push(fn);
          },
        },
      },
      action: { onClicked: { addListener() {} } },
      tabs: {
        async get(id) {
          if (!tabs.has(id)) throw Error("closed");
          return tabs.get(id);
        },
        async update(id, opts) {
          focused.push(["tab", id, opts]);
        },
      },
      windows: {
        async update(id, opts) {
          focused.push(["window", id, opts]);
        },
      },
    },
  });
  vm.runInContext(
    readFileSync(new URL("../tools/fb-import-extension/background.js", import.meta.url), "utf8"),
    ctx,
  );
  const status = (
    type = "import-status",
    sender = { tab: { id: 5 }, url: "https://onbluebird.com/admin/fb-import" },
  ) =>
    new Promise((resolve) => {
      const keepsChannel = listeners[1]({ type }, sender, resolve);
      if (!keepsChannel && !sender.url?.startsWith("https://onbluebird.com")) resolve(undefined);
    });
  return { ctx, status, focused, tabs, listeners };
}

test("status survives a different admin tab, exposes progress without page contents, and releases on completion", async () => {
  const h = harness();
  vm.runInContext(
    'beginImportRun(5, "Seller refresh", "request-1"); recordImportProgress({type:"gemlist-fb-refresh-progress", done:3,total:12,message:"Reading details…"});',
    h.ctx,
  );
  const state = await h.status("import-status", {
    tab: { id: 77 },
    url: "https://onbluebird.com/admin/fb-import",
  });
  assert.equal(state.run.done, 3);
  assert.equal(state.run.total, 12);
  assert.equal(state.run.label, "Seller refresh");
  assert.equal(state.run.ownerTabId, undefined);
  assert.equal(h.focused.length, 0);
  vm.runInContext("finishImportRun()", h.ctx);
  assert.equal((await h.status()).run, null);
  assert.equal(vm.runInContext("importInProgress", h.ctx), false);
});

test("show importer focuses a live reader, falls back to owner, and never opens a window", async () => {
  const h = harness();
  vm.runInContext('beginImportRun(5, "Facebook import"); trackImportReader(9,true)', h.ctx);
  assert.equal((await h.status("show-import")).shown, true);
  assert.equal(h.focused[0][1], 9);
  h.tabs.delete(9);
  h.focused.length = 0;
  assert.equal((await h.status("show-import")).shown, true);
  assert.equal(h.focused[0][1], 5);
  h.tabs.delete(5);
  assert.equal((await h.status("show-import")).shown, false);
  assert.ok((await h.status()).run, "closed windows must not force-unlock a still-running task");
});

test("verification status and Show running importer point to the reader asking for help", async () => {
  const h = harness();
  vm.runInContext(
    'beginImportRun(5, "Seller refresh"); trackImportReader(5,true); trackImportReader(9,true); setImportVerification(9, "KSL"); recordImportProgress({type:"gemlist-fb-refresh-progress",done:1,total:8});',
    h.ctx,
  );
  assert.match((await h.status()).run.message, /KSL asked for human verification/);
  assert.equal((await h.status("show-import")).shown, true);
  assert.equal(h.focused[0][1], 9);
  vm.runInContext("setImportVerification(9)", h.ctx);
  assert.match((await h.status()).run.message, /Reading listing details/);
});

test("foreign origins cannot inspect or focus an importer", async () => {
  const h = harness();
  vm.runInContext('beginImportRun(5, "Seller refresh")', h.ctx);
  assert.equal(
    await h.status("show-import", { tab: { id: 5 }, url: "https://example.com" }),
    undefined,
  );
  assert.equal(h.focused.length, 0);
});

test("watcher polls status only, validates messages and removes polling on unmount", () => {
  let listener,
    tick,
    cleared = false;
  const sent = [],
    received = [];
  const target = {
    location: { origin: "https://onbluebird.com" },
    postMessage(data) {
      sent.push(data.type);
    },
    addEventListener(_, fn) {
      listener = fn;
    },
    removeEventListener(_, fn) {
      assert.equal(listener, fn);
      listener = null;
    },
    setInterval(fn) {
      tick = fn;
      return 1;
    },
    clearInterval() {
      cleared = true;
    },
  };
  const stop = watchImportRun(target, (value) => received.push(value));
  tick();
  assert.deepEqual(sent, ["gemlist-ext-status", "gemlist-ext-status"]);
  const emit = (run, origin = target.location.origin) =>
    listener({ source: target, origin, data: { type: "gemlist-ext-status-result", run } });
  emit({ label: "fake", message: "foreign", startedAt: 1 }, "https://example.com");
  emit({ label: "bad" });
  assert.equal(received.length, 0);
  emit({ label: "Seller refresh", message: "Reading…", startedAt: 1, done: 2, total: 4 });
  assert.equal(received[0].done, 2);
  emit(null);
  assert.equal(received[1], null);
  stop();
  assert.ok(cleared);
  assert.equal(listener, null);
  assert.ok(supportsImportRunStatus("1.5.12"));
  assert.ok(!supportsImportRunStatus("1.5.11"));
});

test("a closed admin tab and a restarted worker leave completed seller results recoverable", async () => {
  const h = harness();
  const origin = "https://onbluebird.com";
  const sender = { tab: { id: 5 }, url: origin + "/admin/fb-import" };
  const profile = "https://classifieds.ksl.com/search/member/123";
  const report = {
    sourceProfileUrl: profile,
    scan: { complete: false, unreadable: 8 },
    unreadableReasons: [{ site: "KSL", reason: "verification_incomplete", count: 8 }],
    sourceIssue: "verification_incomplete",
    results: [{ title: "Chair" }],
  };
  const journal = { last: null, pending: [] };
  h.ctx.refreshJournal = async (site, change, summaryOnly) => {
    assert.equal(site, origin);
    const data = structuredClone(journal);
    if (change) {
      change(data);
      Object.assign(journal, structuredClone(data));
    }
    if (summaryOnly)
      data.pending = data.pending.map(({ requestId, report }) => ({
        requestId,
        sourceProfileUrl: report.sourceProfileUrl,
      }));
    return data;
  };
  const journalScript = readFileSync(
    new URL("../tools/fb-import-extension/refresh-journal.js", import.meta.url),
    "utf8",
  );
  vm.runInContext(
    journalScript.slice(journalScript.indexOf("async function refreshJournalStatus")),
    h.ctx,
  );
  h.ctx.refreshSellerProfiles = async (_tab, _requestId, _profiles, { saveReport }) => {
    await saveReport(report);
    assert.equal(journal.pending.length, 1);
    throw new Error("Admin tab closed during the next seller");
  };
  await assert.rejects(
    vm.runInContext(
      `runSellerRefresh(5, ${JSON.stringify(origin)}, { profiles: [{}, {}], requestId: "r1" })`,
      h.ctx,
    ),
    /Admin tab closed/,
  );
  assert.equal((await h.status()).last.phase, "failed");
  assert.equal((await h.status()).last.done, 1);
  journal.last.phase = "running"; // A worker terminated before recording a terminal state.
  const status = await h.status();
  assert.equal(status.last.phase, "interrupted");
  assert.equal(status.pending[0].sourceProfileUrl, profile);
  assert.equal(status.pending[0].report, undefined);

  const send = (message) =>
    new Promise((resolve) => {
      assert.equal(h.listeners[1](message, sender, resolve), true);
    });
  assert.deepEqual((await send({ type: "import-report", ...status.pending[0] })).report, report);
  await send({ type: "import-saved", ...status.pending[0], staged: 1, updated: 0 });
  await send({ type: "import-saved", ...status.pending[0], staged: 1, updated: 0 });
  const saved = await h.status();
  assert.equal(saved.pending.length, 0);
  assert.equal(saved.last.staged, 1);
  assert.deepEqual(saved.last.readIssues, [
    {
      sourceProfileUrl: profile,
      unreadable: 8,
      unreadableReasons: report.unreadableReasons,
      sourceIssue: "verification_incomplete",
    },
  ]);
  assert.doesNotMatch(JSON.stringify(saved.last.readIssues), /Chair/);
});

function scanPage() {
  const listeners = new Set();
  const timers = new Map();
  const intervals = new Set();
  let nextId = 0;
  const target = {
    location: { origin: "https://onbluebird.com" },
    postMessage() {},
    addEventListener(_, fn) {
      listeners.add(fn);
    },
    removeEventListener(_, fn) {
      listeners.delete(fn);
    },
    setTimeout(fn, ms) {
      timers.set(++nextId, { fn, ms });
      return nextId;
    },
    clearTimeout(id) {
      timers.delete(id);
    },
    setInterval(fn) {
      intervals.add(fn);
      return fn;
    },
    clearInterval(fn) {
      intervals.delete(fn);
    },
  };
  const send = (data) => {
    for (const listener of [...listeners]) {
      if (listeners.has(listener))
        listener({ source: target, origin: target.location.origin, data });
    }
  };
  return { target, send, timers, intervals, listeners };
}

test("an idle extension cannot leave Refresh all stuck at 0 after a dropped start message", async () => {
  const page = scanPage();
  const result = requestSellerImportScan(
    page.target,
    { requestId: "current", profiles: [{}, {}], streamReports: true },
    "1.5.13",
    () => {},
    () => {},
  );
  page.send({ type: "gemlist-ext-status-result", run: null, last: null, pending: [] });
  page.send({ type: "gemlist-fb-refresh-heartbeat", requestId: "other" });
  const [timer] = page.timers.values();
  assert.equal(timer.ms, 15000);
  timer.fn();
  assert.match(await result, /Chrome did not start the scan/);
  assert.equal(page.listeners.size + page.intervals.size + page.timers.size, 0);
});

test("a running 1.5.13 worker confirms startup, and its journal can recover a lost result delivery", async () => {
  const page = scanPage();
  const result = requestSellerImportScan(
    page.target,
    { requestId: "current", profiles: [{}], streamReports: true },
    "1.5.13",
    () => {},
    () => {},
  );
  page.send({
    type: "gemlist-ext-status-result",
    run: { requestId: "current", label: "Seller refresh", message: "Starting…", startedAt: 1 },
  });
  assert.equal([...page.timers.values()][0].ms, 90000);
  page.send({
    type: "gemlist-ext-status-result",
    run: null,
    last: { requestId: "current", phase: "completed" },
    pending: [{ requestId: "current", sourceProfileUrl: "test" }],
  });
  assert.match(await result, /Save scan results/);
  assert.equal(page.listeners.size + page.intervals.size + page.timers.size, 0);
});

test("the extension accepts a same-origin admin route after in-site navigation and rejects foreign frames", () => {
  const h = harness();
  h.ctx.refreshListings = () => new Promise(() => {});
  const start = (sender) => {
    let reply;
    h.listeners[0]({ type: "refresh", requestId: "test" }, sender, (value) => (reply = value));
    return reply;
  };
  const admin = { id: 5, url: "https://onbluebird.com/admin/fb-import" };
  assert.match(start({ tab: admin, url: "https://example.com", frameId: 0 }).error, /directly/);
  assert.match(start({ tab: admin, url: admin.url, frameId: 2 }).error, /directly/);
  assert.match(
    start({
      tab: { ...admin, url: "https://www.onbluebird.com/admin/fb-import" },
      url: "https://onbluebird.com/",
      frameId: 0,
    }).error,
    /directly/,
  );
  assert.equal(start({ tab: admin, url: "https://onbluebird.com/", frameId: 0 }).accepted, true);
});

test("the content script forwards startup acknowledgement and undefined or thrown replies", async () => {
  for (const [reply, expected] of [
    [() => ({ accepted: true }), "gemlist-fb-refresh-started"],
    [() => undefined, "gemlist-fb-refresh-result"],
    [
      () => {
        throw Error("Extension context invalidated");
      },
      "gemlist-fb-refresh-result",
    ],
  ]) {
    let listener;
    const result = new Promise((resolve) => {
      const window = {
        location: { origin: "https://onbluebird.com" },
        addEventListener(_, fn) {
          listener = fn;
        },
        postMessage: resolve,
      };
      vm.runInNewContext(
        readFileSync(new URL("../tools/fb-import-extension/bridge.js", import.meta.url), "utf8"),
        { window, chrome: { runtime: { sendMessage: reply, onMessage: { addListener() {} } } } },
      );
      listener({
        source: window,
        origin: window.location.origin,
        data: { type: "gemlist-ext-refresh", requestId: "test" },
      });
    });
    const message = await result;
    assert.equal(message.type, expected);
    assert.equal(message.requestId, "test");
  }
});
