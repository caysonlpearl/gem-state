import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import ts from "typescript";
import * as jsx from "react/jsx-runtime";
import { renderToStaticMarkup } from "react-dom/server";

const file = new URL("../src/components/listings/ListingDetailView.tsx", import.meta.url);
const source = ts.createSourceFile(
  file.pathname,
  readFileSync(file, "utf8"),
  ts.ScriptTarget.Latest,
  true,
  ts.ScriptKind.TSX,
);
const names = ["StrengthMeter", "ProfileStrength", "SinceAndStrength"];
const functions = source.statements
  .filter((node) => ts.isFunctionDeclaration(node) && names.includes(node.name?.text))
  .map((node) => node.getText(source));
const exports = {};
vm.runInNewContext(
  ts.transpile(
    functions.join("\n") + "\nexports.card = SinceAndStrength; exports.profile = ProfileStrength;",
    { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX },
  ),
  {
    exports,
    require(name) {
      assert.equal(name, "react/jsx-runtime");
      return jsx;
    },
  },
);
const allChecks = [true, true, true, true, true];
const seller = {
  userId: "real-owner",
  avatarUrl: "/avatar.jpg",
  bio: "About me",
  payoutVerified: true,
  reviewCount: 3,
  memberSince: 2020,
};
const html = (props) => renderToStaticMarkup(exports.card(props));

test("complete imported listing details stop at half and explicitly show unclaimed", () => {
  const output = html({ checks: allChecks, seller: null, since: "2026-11-12" });
  assert.match(output, /Unclaimed · 50%/);
  assert.match(output, /aria-valuenow="50"/);
  assert.match(output, /width:50%/);
  assert.doesNotMatch(output, /Strong|On Bluebird since/);
});

test("incomplete unclaimed details earn less than half without inventing membership tenure", () => {
  const output = html({ checks: [true, false, true, false, false] });
  assert.match(output, /Unclaimed · 20%/);
  assert.match(output, /aria-valuenow="20"/);
  assert.doesNotMatch(output, /On Bluebird since/);
});

test("real profiles use account facts, not imported listing checks", () => {
  const full = html({ checks: [], seller });
  assert.match(full, /Strong/);
  assert.match(full, /aria-valuenow="100"/);
  assert.match(full, /On Bluebird since:.*2020/);
  const partial = html({
    checks: allChecks,
    seller: {
      ...seller,
      avatarUrl: null,
      bio: null,
      payoutVerified: false,
      reviewCount: 0,
      memberSince: undefined,
    },
  });
  assert.match(partial, /aria-valuenow="0"/);
  assert.doesNotMatch(partial, /Strong|On Bluebird since/);
});

test("managed imports and account-less seller cards stay unclaimed even with full details", () => {
  const managed = html({ checks: allChecks, seller: { ...seller, managedByBluebird: true } });
  assert.match(managed, /Unclaimed · 50%/);
  assert.doesNotMatch(managed, /On Bluebird since/);
  const noAccount = renderToStaticMarkup(
    exports.profile({ seller: { ...seller, userId: undefined } }),
  );
  assert.match(noAccount, /Unclaimed · 50%/);
});
