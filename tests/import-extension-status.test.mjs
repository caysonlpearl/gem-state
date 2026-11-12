import test from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import { readFileSync } from "node:fs";
import { watchImportRun, supportsImportRunStatus } from "../src/lib/import-extension-status.ts";

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
  return { ctx, status, focused, tabs };
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
