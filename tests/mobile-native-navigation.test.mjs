import test from "node:test";
import assert from "node:assert/strict";
import { trackNativeNavigation, backWithinApp } from "../apps/mobile/src/native-navigation.ts";
test("native Back uses owned hash history, stops at launch, and survives reload and branching", () => {
  const prior = { history: globalThis.history, window: globalThis.window };
  const listeners = new Set(),
    entries = [null];
  let cursor = 0,
    backCalls = 0;
  const emit = () => {
    for (const fn of listeners) fn();
  };
  globalThis.window = {
    addEventListener: (_type, fn) => listeners.add(fn),
    removeEventListener: (_type, fn) => listeners.delete(fn),
  };
  globalThis.history = {
    get state() {
      return entries[cursor];
    },
    length: 90,
    replaceState(value) {
      entries[cursor] = value;
    },
    back() {
      backCalls++;
      cursor--;
      emit();
    },
  };
  const push = () => {
    entries.splice(cursor + 1);
    entries.push(null);
    cursor++;
    emit();
  };
  let stop;
  try {
    stop = trackNativeNavigation();
    // Existing/native WebView history is not proof of an earlier Bluebird route.
    assert.equal(backWithinApp(), false);
    assert.equal(backCalls, 0);
    push();
    push();
    assert.equal(backWithinApp(), true);
    assert.equal(cursor, 1);
    push();
    assert.equal(cursor, 2);
    stop();
    stop = trackNativeNavigation(); // same bundled document reloaded
    assert.equal(backWithinApp(), true);
    assert.equal(cursor, 1);
    assert.equal(backWithinApp(), true);
    assert.equal(cursor, 0);
    assert.equal(backWithinApp(), false);
    assert.equal(backCalls, 3);
  } finally {
    stop?.();
    globalThis.history = prior.history;
    globalThis.window = prior.window;
  }
});
