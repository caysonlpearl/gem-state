import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import ts from "typescript";
import * as access from "../src/lib/account-deletion-access.server.ts";
function database(owner) {
  const pending = new Set(),
    reads = [];
  let failed = false,
    identityPresent = true;
  const db = {
    rpc: async (name, args) => {
      assert.equal(name, "account_session_state");
      assert.equal(args._user, owner);
      reads.push(args._user);
      return {
        data: !identityPresent
          ? "unavailable"
          : pending.has(args._user)
            ? "deletion_pending"
            : "active",
        error: failed ? {} : null,
      };
    },
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
    dropIdentity: () => {
      identityPresent = false;
    },
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
  assert.equal(await access.accountDeletionPending(f.db, owner), false);
  f.pending.add(owner);
  assert.equal(await access.accountDeletionPending(f.db, owner), true);
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
              getClaims: async () => ({
                data: {
                  claims: { sub: owner, session_id: "44444444-4444-4444-8444-444444444444" },
                },
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
    f.dropIdentity();
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

test("verified-session gates reject malformed claims, missing controls and removed identities; pending exceptions are limited", async () => {
  const user = randomUUID(),
    session = randomUUID();
  let state = "active",
    error = null,
    reads = 0;
  const db = {
    rpc: async (name, args) => {
      reads++;
      assert.equal(name, "account_session_state");
      assert.deepEqual(args, { _user: user, _session: session });
      return { data: state, error };
    },
  };
  await access.assertAccountSession(db, user, session);
  state = "deletion_pending";
  await assert.rejects(
    () => access.assertAccountSession(db, user, session),
    access.AccountDeletionPending,
  );
  await access.assertAccountSession(db, user, session, true);
  state = "unavailable";
  await assert.rejects(
    () => access.assertAccountSession(db, user, session, true),
    access.AccountSessionUnavailable,
  );
  state = { unexpected: "private@example.com" };
  await assert.rejects(
    () => access.assertAccountSession(db, user, session),
    /temporarily unavailable/,
  );
  state = "active";
  error = { message: "private-token" };
  await assert.rejects(
    () => access.assertAccountSession(db, user, session),
    (e) => e.message === "Account controls are temporarily unavailable.",
  );
  const before = reads;
  for (const id of [null, undefined, "not-a-session"])
    await assert.rejects(
      () => access.assertAccountSession(db, user, id),
      access.AccountSessionUnavailable,
    );
  assert.equal(reads, before);
});
