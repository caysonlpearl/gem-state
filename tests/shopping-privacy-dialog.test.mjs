import test from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import { readFileSync } from "node:fs";
import ts from "typescript";
import * as jsx from "react/jsx-runtime";

function nodes(node) {
  if (Array.isArray(node)) return node.flatMap(nodes);
  if (!node || typeof node !== "object") return [];
  return [node, ...nodes(node.props?.children)];
}
function setup({ fail = false } = {}) {
  const values = [], calls = [];
  let cursor = 0, clears = 0;
  const exports = {};
  vm.runInNewContext(ts.transpile(readFileSync(new URL("../src/components/community/ShoppingPrivacyDialog.tsx", import.meta.url), "utf8"), {
    target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX,
  }), { exports, require: (name) => {
    if (name === "react/jsx-runtime") return jsx;
    if (name === "react") return { useState(initial) {
      const index = cursor++;
      if (!(index in values)) values[index] = initial;
      return [values[index], value => { values[index] = value; }];
    } };
    throw Error(name);
  }, Error });
  const render = () => {
    cursor = 0;
    return nodes(exports.ShoppingPrivacyDialog({
      initialChoices: { personalization: false, advertising: false },
      onSave: async choices => { if (fail) throw Error("Could not save choices"); calls.push(JSON.parse(JSON.stringify(choices))); },
      onClearHistory: async () => { clears++; },
    }));
  };
  const button = name => render().find(node => node.type === "button" && node.props.children === name);
  const click = async name => { button(name).props.onClick(); await new Promise(resolve => setImmediate(resolve)); };
  return { render, button, click, calls, get clears() { return clears; } };
}

test("compact privacy prompt waits for a choice and supports accept all or essential only", async () => {
  for (const [button, expected] of [
    ["Accept all", { personalization: true, advertising: true }],
    ["Essential only", { personalization: false, advertising: false }],
  ]) {
    const ui = setup();
    assert.equal(ui.render().filter(node => node.type === "input").length, 0);
    assert.deepEqual(ui.calls, []);
    await ui.click(button);
    assert.deepEqual(ui.calls, [expected]);
  }
});

test("custom privacy choices stay independent and clearing history does not change consent", async () => {
  const ui = setup();
  await ui.click("Customize");
  const inputs = ui.render().filter(node => node.type === "input");
  assert.equal(inputs.length, 2);
  assert.equal(inputs[0].props.checked, false);
  assert.equal(inputs[1].props.checked, false);
  inputs[0].props.onChange({ target: { checked: true } });
  await ui.click("Clear shopping history");
  assert.equal(ui.clears, 1);
  assert.deepEqual(ui.calls, []);
  await ui.click("Save choices");
  assert.deepEqual(ui.calls, [{ personalization: true, advertising: false }]);
});

test("failed consent save keeps controls available and displays the failure", async () => {
  const ui = setup({ fail: true });
  await ui.click("Accept all");
  assert.equal(ui.render().find(node => node.props?.role === "alert").props.children, "Could not save choices");
  assert.equal(ui.button("Essential only").props.disabled, false);
  assert.deepEqual(ui.calls, []);
});
