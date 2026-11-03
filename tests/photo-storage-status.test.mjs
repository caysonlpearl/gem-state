import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import ts from "typescript";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { photoReceiptCheck } from "../src/lib/photo-storage-status.ts";

test("receipt counts distinguish an API/schema miss from other failures and never invent a zero", () => {
  for (const code of ["42P01", "PGRST205"])
    assert.deepEqual(photoReceiptCheck({ error: { code }, count: null }), {
      receiptsState: "missing",
      receiptsReady: false,
      verifiedCopies: null,
    });
  for (const input of [
    { error: { code: "57014", message: "statement timeout" }, count: 0 },
    { error: { code: "42501" }, count: null },
    { error: new Error("Transport unavailable") },
    { count: null },
    {},
    { count: -1 },
    { count: Infinity },
    { count: 0.5 },
  ])
    assert.deepEqual(photoReceiptCheck(input), {
      receiptsState: "unavailable",
      receiptsReady: false,
      verifiedCopies: null,
    });
  for (const count of [0, 12760])
    assert.deepEqual(photoReceiptCheck({ error: null, count }), {
      receiptsState: "ready",
      receiptsReady: true,
      verifiedCopies: count,
    });
});

test("actual diagnostic component renders unknown counts honestly while retaining useful bucket/mode checks", () => {
  const source = readFileSync(
    new URL("../src/components/admin/PhotoStorageStatus.tsx", import.meta.url),
    "utf8",
  );
  const ast = ts.createSourceFile(
    "status.tsx",
    source,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TSX,
  );
  const node = ast.statements.find(
    (n) => ts.isFunctionDeclaration(n) && n.name?.text === "PhotoStorageStatus",
  );
  for (const [count, error, expected] of [
    [null, { code: "57014" }, "Unavailable; retry check"],
    [null, { code: "PGRST205" }, "Verification table unavailable"],
    [0, null, "0"],
    [12760, null, "12,760"],
  ]) {
    const data = {
      mode: "supabase",
      uploadMode: "supabase",
      sourceFallback: { state: "unrestricted" },
      listing: true,
      evidence: true,
      thumbnails: true,
      ...photoReceiptCheck({ count, error }),
    };
    const c = vm.createContext({
      React,
      useServerFn: (f) => f,
      checkPrivatePhotoStorage: () => {},
      useMutation: () => ({ data, isPending: false, mutate() {} }),
    });
    vm.runInContext(
      ts.transpile(node.getText(ast).replace(/^export /, ""), {
        target: ts.ScriptTarget.ES2022,
        jsx: ts.JsxEmit.React,
      }) + ";globalThis.Component = PhotoStorageStatus",
      c,
    );
    const html = renderToStaticMarkup(React.createElement(c.Component));
    assert.ok(html.includes(`<dd>${expected}</dd>`));
    assert.match(html, /Connected/);
    assert.match(html, /Supabase/);
    assert.doesNotMatch(html, /Migration not installed/);
    if (error) assert.doesNotMatch(html, /<dd>0<\/dd>/);
  }
});

test("actual admin handler handles rejected count reads without retries, mutations or raw error exposure", async () => {
  const source = readFileSync(
    new URL("../src/lib/photo-storage.functions.ts", import.meta.url),
    "utf8",
  );
  const ast = ts.createSourceFile("functions.ts", source, ts.ScriptTarget.Latest, true);
  const node = ast.statements.find(
    (n) =>
      ts.isVariableStatement(n) &&
      n.declarationList.declarations.some(
        (d) => d.name.getText(ast) === "checkPrivatePhotoStorage",
      ),
  );
  for (const scenario of ["rejected", "timeout", "ready", "denied"]) {
    let runtimeReads = 0,
      countReads = 0,
      bucketReads = 0;
    const countQuery = {
      select(field, options) {
        assert.equal(field, "path");
        assert.deepEqual(JSON.parse(JSON.stringify(options)), { count: "exact", head: true });
        return this;
      },
      abortSignal(signal) {
        assert.equal(signal.aborted, false);
        return this;
      },
      retry(value) {
        assert.equal(value, false);
        countReads++;
        if (scenario === "rejected") return Promise.reject(new Error("private upstream error"));
        return Promise.resolve(
          scenario === "timeout"
            ? { error: { code: "57014", message: "private SQL timeout" }, count: null }
            : { error: null, count: 12760 },
        );
      },
    };
    const c = vm.createContext({
      requireSupabaseAuth: "auth",
      photoReceiptCheck,
      Uint8Array,
      AbortSignal,
      atob,
      createServerFn: () => ({
        middleware() {
          return this;
        },
        handler: (fn) => fn,
      }),
      getPhotoStorageModule: async () => ({
        currentPhotoMode: () => "supabase",
        currentPhotoUploadMode: () => "supabase",
        currentPhotoSourceFallbackPolicy: () => ({ state: "unrestricted" }),
      }),
      storageRuntime: async () => {
        runtimeReads++;
        return {
          db: {
            from(table) {
              assert.equal(table, "photo_object_receipts");
              return countQuery;
            },
          },
          r2: {
            available: async () => {
              bucketReads++;
              return true;
            },
          },
        };
      },
      photoThumbnailRuntime: { makePhotoThumbnail: async () => ({ bytes: new Uint8Array([1]) }) },
    });
    const executable = node
      .getText(ast)
      .replace(/^export /, "")
      .replace('await import("./photo-thumbnail.server")', "photoThumbnailRuntime");
    vm.runInContext(
      ts.transpile(executable, { target: ts.ScriptTarget.ES2022 }) +
        ";globalThis.check = checkPrivatePhotoStorage",
      c,
    );
    const args = {
      context: {
        userId: "admin",
        supabase: { rpc: async () => ({ data: scenario !== "denied", error: null }) },
      },
    };
    if (scenario === "denied") {
      await assert.rejects(() => c.check(args), /Administrator access required/);
      assert.equal(runtimeReads, 0);
      assert.equal(countReads, 0);
      continue;
    }
    const result = await c.check(args);
    assert.equal(countReads, 1);
    assert.equal(bucketReads, 2);
    assert.equal(result.receiptsState, scenario === "ready" ? "ready" : "unavailable");
    assert.equal(result.verifiedCopies, scenario === "ready" ? 12760 : null);
    assert.equal(result.listing, true);
    assert.equal(result.evidence, true);
    assert.equal(result.thumbnails, true);
    assert.doesNotMatch(JSON.stringify(result), /private|SQL|upstream/);
  }
});
