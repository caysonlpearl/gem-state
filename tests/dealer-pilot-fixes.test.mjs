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
function nodes(node) {
  if (Array.isArray(node)) return node.flatMap(nodes);
  if (!node || typeof node !== "object") return [];
  return [node, ...nodes(node.props?.children)];
}

test("dealer members expose text display names instead of non-renderable profile records", async () => {
  const dealerId = "10000000-0000-4000-8000-000000000001";
  const admin = {
    from(table) {
      const builder = {
        select: () => builder,
        eq: () => builder,
        order: async () => ({
          data: [
            { user_id: "owner", role: "owner", status: "active" },
            { user_id: "unnamed", role: "inventory", status: "active" },
          ],
        }),
        in: async () => ({
          data: [
            { id: "owner", display_name: "Cayson Pearl" },
            { id: "unnamed", display_name: null },
          ],
          error: null,
        }),
      };
      assert.ok(["dealer_members", "profiles"].includes(table));
      return builder;
    },
    auth: {
      admin: {
        listUsers: async () => ({
          data: { users: [{ id: "owner", email: "owner@example.com" }] },
          error: null,
        }),
      },
    },
  };
  const functions = compile("../src/lib/dealer.functions.ts", (name) => {
    if (name === "@tanstack/react-start")
      return {
        createServerFn() {
          let validate = (value) => value;
          const builder = {
            middleware: () => builder,
            validator: (fn) => ((validate = fn), builder),
            handler: (fn) => (args) => fn({ ...args, data: validate(args?.data) }),
          };
          return builder;
        },
      };
    if (name === "zod") return { z };
    if (name.endsWith("auth-middleware")) return { requireSupabaseAuth: {} };
    if (name.endsWith("client.server")) return { supabaseAdmin: admin };
    if (name.endsWith("supabase-public.server") || name.endsWith("classifieds.functions"))
      return {};
    throw Error(name);
  });
  const result = await functions.getDealerMembers({
    data: { dealerId },
    context: { userId: "owner", supabase: { rpc: async () => ({ data: true }) } },
  });
  assert.equal(result[0].display_name, "Cayson Pearl");
  assert.equal(typeof result[0].display_name, "string");
  assert.equal(result[1].display_name, null);
});

test("broken dealer logos fall back and a changed URL can load again", () => {
  let failed = null;
  const { DealerLogo } = compile("../src/components/dealers/DealerLogo.tsx", (name) => {
    if (name === "react")
      return {
        useState: () => [
          failed,
          (value) => {
            failed = value;
          },
        ],
      };
    if (name === "react/jsx-runtime") return jsx;
    throw Error(name);
  });
  let tree = DealerLogo({ src: "https://example.com/missing.png", name: "Bluebird QA Motors" });
  assert.equal(tree.type, "img");
  tree.props.onError();
  tree = DealerLogo({ src: "https://example.com/missing.png", name: "Bluebird QA Motors" });
  assert.equal(tree.type, "div");
  assert.equal(tree.props.children, "BQ");
  assert.match(tree.props["aria-label"], /placeholder/);
  assert.equal(
    DealerLogo({ src: "https://example.com/new.png", name: "Bluebird QA Motors" }).type,
    "img",
  );
});

test("make available removes only a dealer hold; feed-sold correction submits a report", async () => {
  for (const scenario of [
    { visibility: "hidden", feed: "active", expected: "visible" },
    { visibility: "visible", feed: "sold", expected: "report" },
  ]) {
    const state = [null, ""],
      calls = [];
    let cursor = 0,
      mutationFn;
    const { DealerInventoryControls } = compile(
      "../src/components/account/DealerInventoryControls.tsx",
      (name) => {
        if (name === "react/jsx-runtime") return jsx;
        if (name === "react")
          return {
            useState() {
              const index = cursor++;
              return [
                state[index],
                (value) => {
                  state[index] = value;
                },
              ];
            },
          };
        if (name === "@tanstack/react-query")
          return {
            useQueryClient: () => ({}),
            useMutation: (options) => {
              mutationFn = options.mutationFn;
              return { reset() {}, isPending: false };
            },
          };
        if (name === "@tanstack/react-start") return { useServerFn: (fn) => fn };
        if (name === "sonner") return { toast: {} };
        if (name.endsWith("dealer-inventory-controls.functions"))
          return {
            setDealerInventoryVisibility: async (input) => calls.push({ type: "visible", input }),
            reportDealerInventoryDetails: async (input) => calls.push({ type: "report", input }),
          };
        if (name.endsWith("ui/dialog"))
          return Object.fromEntries(
            ["Dialog", "DialogContent", "DialogDescription", "DialogHeader", "DialogTitle"].map(
              (key) => [key, key],
            ),
          );
        throw Error(name);
      },
    );
    const render = () => {
      cursor = 0;
      return nodes(
        DealerInventoryControls({
          record: {
            id: "record",
            title: "Vehicle",
            status: scenario.feed,
            dealerVisibility: scenario.visibility,
          },
        }),
      );
    };
    render()
      .find((node) => node.type === "button" && node.props.children === "Make available again")
      .props.onClick();
    let tree = render();
    if (scenario.expected === "report") {
      assert.ok(
        tree.some(
          (node) => node.type === "button" && node.props.children === "Report availability issue",
        ),
      );
      tree
        .find((node) => node.type === "textarea")
        .props.onChange({ target: { value: "Vehicle is still available" } });
      render();
    }
    await mutationFn();
    assert.equal(calls[0].type, scenario.expected);
    if (scenario.expected === "visible") assert.equal(calls[0].input.data.visibility, "visible");
    else assert.equal(calls[0].input.data.details, "Vehicle is still available");
  }
});
