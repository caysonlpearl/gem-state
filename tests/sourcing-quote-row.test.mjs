import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import ts from "typescript";
import * as jsx from "react/jsx-runtime";
import { renderToStaticMarkup } from "react-dom/server";
import { formatDistanceToNowStrict } from "date-fns";
import { formatUsd } from "../src/config/fees.ts";
import { quoteStatusLabels } from "../src/lib/market-labels.ts";
const functions = [];
for (const [path, name] of [
  ["../src/components/shopper/SourcingRequestBoard.tsx", "ShopperQuoteRow"],
  ["../src/components/ui/relative-time.tsx", "RelativeTime"],
]) {
  const source = ts.createSourceFile(
    path,
    readFileSync(new URL(path, import.meta.url), "utf8"),
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TSX,
  );
  const fn = source.statements.find((n) => ts.isFunctionDeclaration(n) && n.name?.text === name);
  assert(fn, name);
  functions.push(fn.getText(source));
}
const exports = {};
vm.runInNewContext(
  ts.transpile(functions.join("\n"), { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX }),
  {
    exports,
    formatUsd,
    quoteStatusLabels,
    formatDistanceToNowStrict,
    require: (name) => {
      assert.equal(name, "react/jsx-runtime");
      return jsx;
    },
  },
);
const quote = {
  id: "synthetic-quote",
  requestId: "synthetic-request",
  productName: "Original product",
  variantLabel: "Medium · Blue",
  status: "submitted",
  merchCostCents: 1000,
  shopperCompCents: 200,
  createdAt: "2026-11-10T12:00:00Z",
};
const render = (changes = {}, pending = false, onWithdraw = () => {}) =>
  exports.ShopperQuoteRow({ quote: { ...quote, ...changes }, pending, onWithdraw });
test("retired quotes retain their amount and date while clearly unavailable and without a stale Withdraw action", () => {
  const html = renderToStaticMarkup(
    render({ requestId: null, productName: "Previous quote", variantLabel: "" }),
  );
  assert.match(html, /Previous quote/);
  assert.match(html, /Request unavailable/);
  assert.match(html, /\$12\.00/);
  assert.match(html, /<time /);
  assert.doesNotMatch(html, /<button|Withdraw|Medium/);
});
test("available submitted quotes keep the existing action and dispatch their actual quote identity", () => {
  const sent = [],
    row = render({}, false, (id) => sent.push(id)),
    html = renderToStaticMarkup(row);
  assert.match(html, /Original product/);
  assert.match(html, /Medium · Blue/);
  assert.match(html, /Withdraw/);
  assert.doesNotMatch(html, /Request unavailable/);
  const button = row.props.children.find((c) => c?.type === "button");
  assert(button);
  button.props.onClick();
  assert.deepEqual(sent, ["synthetic-quote"]);
  assert.match(renderToStaticMarkup(render({}, true)), /disabled=""/);
  assert.doesNotMatch(renderToStaticMarkup(render({ status: "withdrawn" })), /<button/);
});
test("long or markup-like product names remain ordinary escaped text", () => {
  const html = renderToStaticMarkup(
    render({ productName: "<script>private()</script>" + "x".repeat(180) }),
  );
  assert.match(html, /&lt;script&gt;/);
  assert.doesNotMatch(html, /<script>/);
  assert.match(html, /break-words/);
});
