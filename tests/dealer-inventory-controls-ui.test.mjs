import test from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import { readFileSync } from "node:fs";
import ts from "typescript";
import * as jsx from "react/jsx-runtime";
import { z } from "zod";
function compile(path, require) {
  const exports = {};
  vm.runInNewContext(
    ts.transpile(readFileSync(new URL(path, import.meta.url), "utf8"), {
      target: ts.ScriptTarget.ES2022,
      module: ts.ModuleKind.CommonJS,
      jsx: ts.JsxEmit.ReactJSX,
    }),
    { exports, require },
  );
  return exports;
}
const id = "10000000-0000-4000-8000-000000000001";
test("inventory server requests accept only scoped visibility/report fields and propagate permission failures", async () => {
  const calls = [];
  const f = compile("../src/lib/dealer-inventory-controls.functions.ts", (name) => {
    if (name === "@tanstack/react-start")
      return {
        createServerFn: () => {
          let validate;
          const b = {
            middleware: () => b,
            validator: (fn) => ((validate = fn), b),
            handler: (fn) => (args) => fn({ ...args, data: validate(args.data) }),
          };
          return b;
        },
      };
    if (name === "zod") return { z };
    if (name.endsWith("auth-middleware")) return { requireSupabaseAuth: {} };
    throw Error(name);
  });
  const context = {
    supabase: {
      rpc: async (name, args) => {
        calls.push({ name, args });
        return { data: { recordId: id, visibility: "hidden" }, error: null };
      },
    },
  };
  await f.setDealerInventoryVisibility({
    data: {
      recordId: id,
      visibility: "hidden",
      priceCents: 1,
      dealerId: "other",
      photos: ["fake"],
    },
    context,
  });
  assert.deepEqual(JSON.parse(JSON.stringify(calls[0])), {
    name: "set_dealer_inventory_visibility",
    args: { _record_id: id, _visibility: "hidden", _reason: null },
  });
  assert.throws(() =>
    f.setDealerInventoryVisibility({ data: { recordId: id, visibility: "active" }, context }),
  );
  assert.throws(() =>
    f.reportDealerInventoryDetails({ data: { recordId: id, details: "no" }, context }),
  );
  await f.reportDealerInventoryDetails({
    data: { recordId: id, details: "Mileage incorrect" },
    context,
  });
  assert.equal(calls[1].name, "report_dealer_inventory_details");
  await assert.rejects(
    f.setDealerInventoryVisibility({
      data: { recordId: id, visibility: "sold" },
      context: { supabase: { rpc: async () => ({ error: { message: "Access denied" } }) } },
    }),
    /Access denied/,
  );
});
function descendants(node) {
  if (!node || typeof node !== "object") return [];
  const children = Array.isArray(node.props?.children)
    ? node.props.children
    : [node.props?.children];
  return [
    node,
    ...children.flatMap((child) =>
      Array.isArray(child) ? child.flatMap(descendants) : descendants(child),
    ),
  ];
}
test("inventory preview actions remain non-saving even when a form is submitted", () => {
  for (const preview of [true, false]) {
    let mutations = 0;
    let stateIndex = 0;
    const component = compile("../src/components/account/DealerInventoryControls.tsx", (name) => {
      if (name === "react") return { useState: () => [["hidden", ""][stateIndex++], () => {}] };
      if (name === "@tanstack/react-query")
        return {
          useQueryClient: () => ({}),
          useMutation: () => ({
            mutate() {
              mutations++;
            },
            reset() {},
            isPending: false,
          }),
        };
      if (name === "@tanstack/react-start")
        return {
          useServerFn: () => () => {
            throw Error("No requests from preview");
          },
        };
      if (name === "sonner") return { toast: {} };
      if (name.endsWith("dealer-inventory-controls.functions")) return {};
      if (name.endsWith("ui/dialog"))
        return Object.fromEntries(
          ["Dialog", "DialogContent", "DialogDescription", "DialogHeader", "DialogTitle"].map(
            (key) => [key, key],
          ),
        );
      if (name === "react/jsx-runtime") return jsx;
      throw Error(name);
    }).DealerInventoryControls;
    const nodes = descendants(
      component({ record: { id, title: "Vehicle", dealerVisibility: "visible" }, preview }),
    );
    nodes.find((node) => node.type === "form").props.onSubmit({ preventDefault() {} });
    assert.equal(mutations, preview ? 0 : 1);
    assert.equal(
      nodes.find((node) => node.type === "button" && node.props.type === "submit").props.disabled,
      preview,
    );
  }
});
