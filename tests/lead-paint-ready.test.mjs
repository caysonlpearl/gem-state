import test from "node:test";
import assert from "node:assert/strict";
import { afterLeadPaint } from "../src/lib/lead-paint-ready.ts";

function fixture(complete = false, missing = false) {
  const listeners = new Map();
  const frames = new Map();
  const timers = new Map();
  let id = 0;
  let calls = 0;
  const image = missing ? null : {
    complete,
    addEventListener: (event, fn) => listeners.set(event, fn),
    removeEventListener: (event, fn) => { if (listeners.get(event) === fn) listeners.delete(event); },
  };
  const scheduler = {
    requestFrame: (fn) => { frames.set(++id, fn); return id; },
    cancelFrame: (key) => frames.delete(key),
    delay: (fn, ms) => { assert.equal(ms, 2000); timers.set(++id, fn); return id; },
    clearDelay: (key) => timers.delete(key),
  };
  const stop = afterLeadPaint(image, () => calls++, scheduler);
  const frame = () => { const pending = [...frames.values()]; frames.clear(); pending.forEach((fn) => fn(0)); };
  return { stop, frame, listeners, frames, timers, calls: () => calls, event: (type) => listeners.get(type)?.(), timeout: () => [...timers.values()].forEach((fn) => fn()) };
}

for (const [name, complete, missing] of [["already cached", true, false], ["missing or empty", false, true]]) {
  test(`${name} image releases after two paint frames`, () => {
    const h = fixture(complete, missing);
    assert.equal(h.calls(), 0);
    h.frame(); assert.equal(h.calls(), 0);
    h.frame(); assert.equal(h.calls(), 1);
    assert.equal(h.timers.size, 0);
    h.frame(); assert.equal(h.calls(), 1);
  });
}
for (const event of ["load", "error"]) {
  test(`delayed image ${event} releases once after paint`, () => {
    const h = fixture();
    h.frame(); assert.equal(h.calls(), 0);
    h.event(event); h.event(event); h.event("load");
    assert.equal(h.listeners.size, 0);
    h.frame(); h.frame(); assert.equal(h.calls(), 1);
    h.timeout(); h.frame(); assert.equal(h.calls(), 1);
  });
}
test("hung image releases automatically without user interaction", () => {
  const h = fixture(); h.timeout(); h.frame(); h.frame();
  assert.equal(h.calls(), 1); assert.equal(h.listeners.size, 0);
});
test("unmount clears listeners, timeout and queued frames", () => {
  for (const stage of [0, 1, 2]) {
    const h = fixture();
    if (stage) h.event("load");
    if (stage === 2) h.frame();
    h.stop(); h.event("load"); h.timeout(); h.frame(); h.frame();
    assert.equal(h.calls(), 0);
    assert.equal(h.listeners.size + h.frames.size + h.timers.size, 0);
  }
});
