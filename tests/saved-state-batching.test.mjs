import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import ts from "typescript";
import { createSavedStateBatcher } from "../src/lib/saved-state-batcher.ts";
import { savedStateRequest } from "../src/lib/saved-state-contract.ts";
const viewer = "11111111-1111-4111-8111-111111111111";

test("200 card state reads use four bounded calls, including duplicate cards", async () => {
  const calls = [];
  const read = createSavedStateBatcher(async (ids) => {
    calls.push(ids);
    return Object.fromEntries(ids.map((id, i) => [id, i % 2 === 0]));
  });
  const result = await Promise.all(Array.from({ length: 200 }, (_, i) => read("adzuna-" + i)));
  assert.equal(calls.length, 4);
  assert.ok(calls.every((ids) => ids.length === 50));
  assert.equal(result.length, 200);
  const duplicateCalls = [];
  const duplicate = createSavedStateBatcher(async (ids) => {
    duplicateCalls.push(ids);
    return { [ids[0]]: true };
  });
  assert.deepEqual(await Promise.all([duplicate("same"), duplicate("same"), duplicate("same")]), [
    true,
    true,
    true,
  ]);
  assert.deepEqual(duplicateCalls, [["same"]]);
});
test("a failed batch rejects readers and a later request can recover", async () => {
  let attempts = 0;
  const read = createSavedStateBatcher(async (ids) => {
    if (++attempts === 1) throw Error("offline");
    return { [ids[0]]: true };
  });
  const result = await Promise.allSettled([read("a"), read("b")]);
  assert.ok(result.every((r) => r.status === "rejected"));
  assert.equal(await read("a"), true);
  assert.equal(attempts, 2);
});
test("saved state validates provider IDs, account identity and bounded batch sizes", () => {
  assert.deepEqual(
    savedStateRequest({ kind: "jobs", ids: ["adzuna-1", "adzuna-1"], viewerId: viewer }).ids,
    ["adzuna-1"],
  );
  for (const input of [
    { kind: "constructor", ids: ["x"], viewerId: viewer },
    { kind: "jobs", ids: ["openwebninja-1"], viewerId: viewer },
    { kind: "jobs", ids: [], viewerId: viewer },
    { kind: "jobs", ids: Array(51).fill("adzuna-1"), viewerId: viewer },
    { kind: "jobs", ids: ["adzuna-1"], viewerId: "not-a-user" },
  ])
    assert.throws(() => savedStateRequest(input));
});
function harness(rowsByTable) {
  const calls = [];
  let validate;
  const require = (name) => {
    if (name === "@tanstack/react-start")
      return {
        createServerFn: () => ({
          middleware() {
            return this;
          },
          validator(fn) {
            validate = fn;
            return this;
          },
          handler(fn) {
            return (input, context) => fn({ data: validate(input), context });
          },
        }),
      };
    if (name.includes("auth-middleware")) return { requireSupabaseAuth: {} };
    if (name.includes("catalog-read-deadline"))
      return { withCatalogReadDeadline: (q) => Promise.resolve(q) };
    if (name.includes("saved-state-contract")) return { savedStateRequest };
    throw Error("Unexpected module " + name);
  };
  const db = {
    from(table) {
      const call = { table, filters: [], orders: [], limit: [] };
      calls.push(call);
      const query = {
        select(value) {
          call.select = value;
          return this;
        },
        eq(k, v) {
          call.filters.push([k, v]);
          return this;
        },
        in(k, v) {
          call.filters.push([k, v]);
          return this;
        },
        order(k, v) {
          call.orders.push([k, v]);
          return this;
        },
        limit(...args) {
          call.limit = args;
          return this;
        },
        then(resolve, reject) {
          return Promise.resolve(rowsByTable[table] ?? { data: [], error: null }).then(
            resolve,
            reject,
          );
        },
      };
      return query;
    },
  };
  const context = vm.createContext({ exports: {}, require, Map, Set, Object });
  vm.runInContext(
    ts.transpile(
      fs.readFileSync(new URL("../src/lib/saved-state.functions.ts", import.meta.url), "utf8"),
      { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
    ),
    context,
  );
  return {
    run: (input, userId = viewer) =>
      context.exports.getSavedListingStates(input, { userId, supabase: db }),
    calls,
  };
}
test("one authenticated RLS read returns only requested partner states", async () => {
  for (const [kind, prefix, table] of [
    ["jobs", "adzuna-", "saved_partner_jobs"],
    ["homes", "openwebninja-", "saved_partner_homes"],
    ["vehicles", "marketcheck-dealer-", "saved_partner_vehicles"],
  ]) {
    const h = harness({
      [table]: {
        data: [{ listing_id: prefix + "1" }, { listing_id: prefix + "999" }],
        error: null,
      },
    });
    const states = await h.run({ kind, ids: [prefix + "1", prefix + "2"], viewerId: viewer });
    assert.deepEqual({ ...states }, { [prefix + "1"]: true, [prefix + "2"]: false });
    assert.equal(h.calls.length, 1);
    assert.deepEqual(h.calls[0].filters, [
      ["user_id", viewer],
      ["listing_id", [prefix + "1", prefix + "2"]],
    ]);
  }
});
test("account switches fail before any database read and read errors never become cached false", async () => {
  const h = harness({ saved_partner_jobs: { data: null, error: { message: "unavailable" } } });
  await assert.rejects(
    h.run(
      { kind: "jobs", ids: ["adzuna-1"], viewerId: viewer },
      "22222222-2222-4222-8222-222222222222",
    ),
    /account changed/,
  );
  assert.equal(h.calls.length, 0);
  await assert.rejects(
    h.run({ kind: "jobs", ids: ["adzuna-1"], viewerId: viewer }),
    /could not be read/,
  );
});
test("native hearts preserve earliest-variation semantics using two bounded reads", async () => {
  const p1 = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
    p2 = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
  const h = harness({
    products: {
      data: [
        { id: p1, product_variants: [{ id: "v1" }] },
        { id: p2, product_variants: [{ id: "v2" }] },
      ],
      error: null,
    },
    watchlist: { data: [{ variant_id: "v2" }], error: null },
  });
  assert.deepEqual(
    { ...(await h.run({ kind: "products", ids: [p1, p2], viewerId: viewer })) },
    { [p1]: false, [p2]: true },
  );
  assert.equal(h.calls.length, 2);
  assert.deepEqual(JSON.parse(JSON.stringify(h.calls[0].limit)), [
    1,
    { referencedTable: "product_variants" },
  ]);
  assert.ok(h.calls[1].filters.some(([k, v]) => k === "user_id" && v === viewer));
});
