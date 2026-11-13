import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import ts from "typescript";
import * as access from "../src/lib/account-deletion-access.server.ts";
function database(owner) {
  const pending = new Set(),
    reads = [];
  let failed = false;
  const db = {
    from(table) {
      assert.equal(table, "mobile_account_deletions");
      return {
        select(columns) {
          assert.equal(columns, "status");
          return {
            eq(column, id) {
              assert.equal(column, "user_id");
              reads.push(id);
              return {
                maybeSingle: async () => ({
                  data: pending.has(id) ? { status: "requested" } : null,
                  error: failed ? { message: "private-connection-data" } : null,
                }),
              };
            },
          };
        },
      };
    },
  };
  return {
    db,
    pending,
    reads,
    fail: () => {
      failed = true;
    },
  };
}
test("account availability is fresh, server-owned, isolated and fails closed on a database outage", async () => {
  const owner = randomUUID(),
    other = randomUUID(),
    f = database(owner);
  f.pending.add(other);
  await access.assertAccountAvailable(f.db, owner);
  f.pending.add(owner);
  await assert.rejects(
    () => access.assertAccountAvailable(f.db, owner),
    access.AccountDeletionPending,
  );
  assert.deepEqual(f.reads, [owner, owner]);
  f.fail();
  await assert.rejects(
    () => access.accountDeletionPending(f.db, owner),
    (e) =>
      e.message === "Account controls are temporarily unavailable." &&
      !e.message.includes("private"),
  );
});
test("the actual website authentication middleware rejects a deletion request before running any domain handler", async () => {
  const owner = randomUUID(),
    f = database(owner);
  let identityPresent = true;
  const previousUrl = process.env.GEM_STATE_SUPABASE_URL,
    previousKey = process.env.GEM_STATE_SUPABASE_PUBLISHABLE_KEY;
  process.env.GEM_STATE_SUPABASE_URL = "https://fixture.invalid";
  process.env.GEM_STATE_SUPABASE_PUBLISHABLE_KEY = "sb_publishable_fixture";
  try {
    const exports = {},
      modules = {
        "@tanstack/react-start": { createMiddleware: () => ({ server: (handler) => handler }) },
        "@tanstack/react-start/server": {
          getRequest: () =>
            new Request("https://fixture.invalid", {
              headers: { Authorization: "Bearer one.two.three" },
            }),
        },
        "@supabase/supabase-js": {
          createClient: () => ({
            auth: {
              getClaims: async () => ({ data: { claims: { sub: owner } }, error: null }),
              getUser: async () => ({
                data: { user: identityPresent ? { id: owner } : null },
                error: null,
              }),
            },
          }),
        },
        "@/lib/account-deletion-access.server": access,
        "./client.server": { supabaseAdmin: f.db },
      };
    const compiled = ts.transpileModule(
      readFileSync(
        new URL("../src/integrations/supabase/auth-middleware.ts", import.meta.url),
        "utf8",
      ),
      { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } },
    ).outputText;
    new Function("require", "exports", compiled)((name) => {
      assert(name in modules, name);
      return modules[name];
    }, exports);
    let runs = 0;
    const next = async ({ context }) => {
      runs++;
      assert.equal(context.userId, owner);
      return "allowed";
    };
    assert.equal(await exports.requireSupabaseAuth({ next }), "allowed");
    f.pending.add(owner);
    await assert.rejects(
      () => exports.requireSupabaseAuth({ next }),
      access.AccountDeletionPending,
    );
    assert.equal(runs, 1);
    assert.deepEqual(f.reads, [owner, owner]);
    f.pending.clear();
    identityPresent = false;
    await assert.rejects(
      () => exports.requireSupabaseAuth({ next }),
      /Unauthorized: Account is unavailable/,
    );
    assert.equal(runs, 1, "A signed JWT cannot revive an identity after Auth deletion");
  } finally {
    if (previousUrl === undefined) delete process.env.GEM_STATE_SUPABASE_URL;
    else process.env.GEM_STATE_SUPABASE_URL = previousUrl;
    if (previousKey === undefined) delete process.env.GEM_STATE_SUPABASE_PUBLISHABLE_KEY;
    else process.env.GEM_STATE_SUPABASE_PUBLISHABLE_KEY = previousKey;
  }
});
