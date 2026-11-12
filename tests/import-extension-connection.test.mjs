import test from "node:test";
import assert from "node:assert/strict";
import { connectImportExtension } from "../src/lib/import-extension-connection.ts";
function harness() {
  const timers = new Map(),
    states = [],
    listeners = new Set(),
    sent = [];
  let id = 0;
  const target = {
    location: { origin: "https://onbluebird.com" },
    setTimeout(fn) {
      timers.set(++id, fn);
      return id;
    },
    clearTimeout(id) {
      timers.delete(id);
    },
    addEventListener(type, fn) {
      assert.equal(type, "message");
      listeners.add(fn);
    },
    removeEventListener(type, fn) {
      listeners.delete(fn);
    },
    postMessage(message, origin) {
      sent.push({ message, origin });
    },
  };
  const connection = connectImportExtension(target, (state) => states.push(state));
  return {
    target,
    states,
    sent,
    timers,
    listeners,
    connection,
    tick() {
      const [id, fn] = timers.entries().next().value;
      timers.delete(id);
      fn();
    },
    pong(version, overrides = {}) {
      for (const listener of listeners)
        listener({
          source: target,
          origin: target.location.origin,
          data: { type: "gemlist-ext-pong", version },
          ...overrides,
        });
    },
  };
}
test("a late bridge response is detected within bounded retries without starting scans", () => {
  const h = harness();
  h.tick();
  h.tick();
  h.pong("1.5.11");
  assert.equal(h.states.at(-1).status, "ready");
  assert.equal(h.timers.size, 0);
  assert.equal(h.sent.length, 3);
  assert.ok(
    h.sent.every(
      (s) => s.message.type === "gemlist-ext-ping" && s.origin === h.target.location.origin,
    ),
  );
});
test("missing and outdated bridges stay blocked and can be checked again", () => {
  const h = harness();
  for (let i = 0; i < 4; i++) h.tick();
  assert.equal(h.states.at(-1).status, "missing");
  assert.equal(h.sent.length, 4);
  assert.equal(h.timers.size, 0);
  h.connection.check();
  h.pong("1.5.9");
  assert.equal(h.states.at(-1).status, "outdated");
  h.connection.check();
  h.pong("1.5.11");
  assert.equal(h.states.at(-1).status, "ready");
});
test("foreign, framed and malformed responses cannot enable refresh; teardown cancels retries", () => {
  const h = harness();
  h.pong("1.5.11", { origin: "https://example.com" });
  h.pong("1.5.11", { source: {} });
  h.pong("bogus");
  assert.equal(h.states.at(-1).status, "checking");
  h.connection.dispose();
  assert.equal(h.timers.size, 0);
  assert.equal(h.listeners.size, 0);
  const count = h.sent.length;
  h.connection.check();
  assert.equal(h.sent.length, count);
});
