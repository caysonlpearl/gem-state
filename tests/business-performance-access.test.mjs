import test from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import { readFileSync } from "node:fs";
import ts from "typescript";
import { z } from "zod";

test("business reports and model writes reject non-admins before loading privileged data", async () => {
  let privilegedLoads = 0;
  const exports = {};
  const headers = [];
  const createServerFn = () => {
    let validate;
    const builder = {
      middleware: () => builder,
      validator: (fn) => {
        validate = fn;
        return builder;
      },
      handler: (fn) => (args) => fn({ ...args, data: validate(args.data) }),
    };
    return builder;
  };
  vm.runInNewContext(
    ts.transpile(
      readFileSync(
        new URL("../src/lib/business-performance.functions.ts", import.meta.url),
        "utf8",
      ),
      { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
    ),
    {
      exports,
      require(name) {
        if (name === "@tanstack/react-start") return { createServerFn };
        if (name === "@tanstack/react-start/server")
          return { setResponseHeader: (...args) => headers.push(args) };
        if (name === "zod") return { z };
        if (name.endsWith("auth-middleware")) return { requireSupabaseAuth: {} };
        if (name.endsWith("client.server")) {
          privilegedLoads++;
          throw Error("must not load privileged client");
        }
        throw Error(name);
      },
    },
  );
  for (const access of [false, null]) {
    const context = {
      userId: "member",
      supabase: { rpc: async () => ({ data: access, error: null }) },
    };
    await assert.rejects(
      exports.getBusinessPerformance({ data: { days: 30 }, context }),
      /Administrator access required/,
    );
    await assert.rejects(
      exports.getBusinessSellerKey({ data: { slug: "diesel" }, context }),
      /Administrator access required/,
    );
    await assert.rejects(
      exports.saveBusinessSalesAssumption({
        data: { businessKey: "dealer:real", conversionPercent: 5 },
        context,
      }),
      /Administrator access required/,
    );
  }
  assert.equal(privilegedLoads, 0);
  assert.ok(
    headers.every(([key, value]) => key === "Cache-Control" && value === "private, no-store"),
  );
  assert.throws(() => exports.getBusinessPerformance({ data: { days: 365 }, context: {} }));
  assert.throws(() =>
    exports.saveBusinessSalesAssumption({
      data: { businessKey: "dealer:real", conversionPercent: 101 },
      context: {},
    }),
  );
});
