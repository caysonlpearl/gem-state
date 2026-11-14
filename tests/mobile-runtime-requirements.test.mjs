import test from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import ts from "typescript";
const read = (p) => readFileSync(new URL("../" + p, import.meta.url), "utf8");
test("native modules cannot reintroduce newer AbortSignal static methods beneath the declared phone floor", () => {
  const found = [];
  for (const file of readdirSync(new URL("../apps/mobile/src/", import.meta.url)).filter((f) =>
    /\.tsx?$/.test(f),
  )) {
    const source = ts.createSourceFile(
      file,
      read("apps/mobile/src/" + file),
      ts.ScriptTarget.Latest,
      true,
      file.endsWith("tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
    );
    function visit(n) {
      if (
        ts.isPropertyAccessExpression(n) &&
        ["any", "timeout"].includes(n.name.text) &&
        /(^|\.)AbortSignal$/.test(n.expression.getText(source))
      )
        found.push(file + ":" + n.getText(source));
      ts.forEachChild(n, visit);
    }
    visit(source);
  }
  assert.deepEqual(found, []);
});
test("the native iPhone floor, compiler targets and Android engine gate match the shared styling requirements", () => {
  const pbx = read("apps/mobile/ios/App/App.xcodeproj/project.pbxproj"),
    targets = [...pbx.matchAll(/IPHONEOS_DEPLOYMENT_TARGET = ([\d.]+);/g)].map((m) => m[1]);
  assert(targets.length >= 2);
  assert(targets.every((v) => v === "16.4"));
  const vite = read("apps/mobile/vite.config.ts"),
    cap = read("apps/mobile/capacitor.config.ts");
  assert.match(vite, /target: \["safari16\.4", "chrome111"\]/);
  assert.match(cap, /minWebViewVersion: 111/);
  assert.match(cap, /errorPath: "webview-update\.html"/);
  assert.match(read("apps/mobile/index.html"), /src="\/src\/startup\.ts"/);
  const update = read("apps/mobile/webview-update.html");
  assert(!/<script\b/i.test(update));
  assert(!/tailwind|react/i.test(update));
  assert.match(update, /https:\/\/onbluebird\.com/);
});
