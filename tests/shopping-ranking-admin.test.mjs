import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import ts from "typescript";
import { z } from "zod";
const compiled = ts.transpileModule(
  readFileSync(new URL("../src/lib/shopping-admin.functions.ts", import.meta.url), "utf8"),
  { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS } },
).outputText;
function fixture({ readiness, role = true, reviewError = false } = {}) {
  const calls = [],
    headers = [];
  const db = {
    rpc: async (name) => {
      calls.push(["service", name]);
      return name === "shopping_ranking_review_ready"
        ? (readiness ?? { data: true })
        : { data: { cohorts: [] } };
    },
    from: (name) => ({
      select() {
        return this;
      },
      single: async () => ({ data: { model_version: "rules-v1" } }),
      order() {
        return this;
      },
      limit: async () => ({ data: [] }),
    }),
  };
  const member = {
    rpc: async (name, args) => {
      calls.push(["member", name, args]);
      return name === "has_role"
        ? { data: role }
        : reviewError
          ? { error: { message: "private provider details" } }
          : { data: { ok: true, modelVersion: "reviewed" } };
    },
  };
  const modules = {
    "@tanstack/react-start": {
      createServerFn: () => ({
        middleware() {
          return this;
        },
        validator(fn) {
          this.validate = fn;
          return this;
        },
        handler(fn) {
          return (input) =>
            fn({ ...input, ...(this.validate ? { data: this.validate(input.data) } : {}) });
        },
      }),
    },
    zod: { z },
    "@/integrations/supabase/auth-middleware": { requireSupabaseAuth: {} },
    "@tanstack/react-start/server": { setResponseHeader: (...args) => headers.push(args) },
    "./shopping.server": { shoppingDb: async () => db },
  };
  const out = {};
  new Function("exports", "require", compiled)(out, (name) => {
    assert.ok(name in modules, name);
    return modules[name];
  });
  return { out, calls, headers, context: { supabase: member, userId: "server-derived-admin" } };
}
test("admin review uses the authenticated member client without accepting caller identity or caller-supplied weights", async () => {
  const f = fixture();
  const result = await f.out.reviewShoppingRanking({
    context: f.context,
    data: {
      week: "2026-11-09",
      expectedVersion: "rules-v1",
      userId: "forged",
      weights: { engagement: 6 },
    },
  });
  assert.deepEqual(result, { ok: true, modelVersion: "reviewed" });
  assert.deepEqual(f.calls, [
    ["member", "has_role", { _user_id: "server-derived-admin", _role: "admin" }],
    ["member", "review_shopping_ranking", { _week: "2026-11-09", _expected_version: "rules-v1" }],
  ]);
  assert.deepEqual(f.headers, [["Cache-Control", "private, no-store"]]);
  const denied = fixture({ role: false });
  await assert.rejects(
    denied.out.reviewShoppingRanking({
      context: denied.context,
      data: { week: "2026-11-09", expectedVersion: "rules-v1" },
    }),
    /Administrator/,
  );
  assert.equal(denied.calls.length, 1);
  const failed = fixture({ reviewError: true });
  await assert.rejects(
    failed.out.reviewShoppingRanking({
      context: failed.context,
      data: { week: "2026-11-09", expectedVersion: "rules-v1" },
    }),
    (error) => /Reload the report/.test(error.message) && !error.message.includes("private"),
  );
});
test("report supports an absent migration but does not hide an unavailable readiness check", async () => {
  for (const code of ["PGRST202", "42883"]) {
    const f = fixture({ readiness: { error: { code } } });
    assert.equal((await f.out.getShoppingReport({ context: f.context })).rankingReviewReady, false);
  }
  const good = fixture();
  assert.equal(
    (await good.out.getShoppingReport({ context: good.context })).rankingReviewReady,
    true,
  );
  const fail = fixture({ readiness: { error: { code: "503" } } });
  await assert.rejects(fail.out.getShoppingReport({ context: fail.context }), /status unavailable/);
});
