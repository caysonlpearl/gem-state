import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import ts from "typescript";
import { MEMBER_INTENTS } from "../src/config/account.ts";
function load(path, modules) {
  const code = ts.transpileModule(readFileSync(new URL(path, import.meta.url), "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const exports = {};
  new Function("require", "exports", code)((name) => {
    assert(name in modules, name);
    return modules[name];
  }, exports);
  return exports;
}
test("profile and avatar domain handlers validate content and always update the authenticated owner", async () => {
  const owner = randomUUID(),
    outsider = randomUUID(),
    writes = [];
  const functions = load("../src/lib/account.functions.ts", {
    "@/config/account": { MEMBER_INTENTS },
    "@/integrations/supabase/auth-middleware": { requireSupabaseAuth: {} },
    "@tanstack/react-start": {
      createServerFn: () => {
        let validate;
        const f = {
          middleware: () => f,
          validator: (v) => ((validate = v), f),
          handler:
            (handler) =>
            async ({ data, context }) =>
              handler({ data: validate ? validate(data) : data, context }),
        };
        return f;
      },
    },
  });
  const context = {
    userId: owner,
    supabase: {
      from: (table) => ({
        update: (values) => ({
          eq: async (field, id) => {
            writes.push({ table, values, field, id });
            return { error: null };
          },
        }),
      }),
      storage: {
        from: (bucket) => ({
          getPublicUrl: (path) => ({
            data: { publicUrl: `https://fixture.invalid/${bucket}/${path}` },
          }),
        }),
      },
    },
  };

  await assert.rejects(
    () =>
      functions.saveMyProfile({
        context,
        data: { displayName: "x", homeResortCode: "ID", primaryIntent: "buying" },
      }),
    /Display name/,
  );
  await assert.rejects(
    () =>
      functions.saveMyProfile({
        context,
        data: { displayName: "Fixture", homeResortCode: "CA", primaryIntent: "buying" },
      }),
    /Choose Idaho/,
  );
  await assert.rejects(
    () =>
      functions.saveMyProfile({
        context,
        data: { displayName: "Fixture", homeResortCode: "ID", primaryIntent: "admin" },
      }),
    /Choose what/,
  );
  assert.equal(writes.length, 0);
  await functions.saveMyProfile({
    context,
    data: {
      displayName: " Fixture member ",
      homeResortCode: "ID",
      primaryIntent: "buying",
      markOnboarded: true,
      userId: outsider,
    },
  });
  assert.equal(writes[0].id, owner);
  assert.equal(writes[0].field, "id");
  assert.equal(writes[0].values.display_name, "Fixture member");
  assert(writes[0].values.onboarded_at);
  await assert.rejects(
    () =>
      functions.updateMyAvatar({
        context,
        data: { path: `${outsider}/avatar-${randomUUID()}.png` },
      }),
    /does not belong/,
  );
  await assert.rejects(
    () =>
      functions.updateMyAvatar({ context, data: { path: `${owner}/avatar-${randomUUID()}.html` } }),
    /valid profile image/,
  );
  assert.equal(writes.length, 1);
  const path = `${owner}/avatar-${randomUUID()}.png`;
  await functions.updateMyAvatar({ context, data: { path } });
  assert.equal(writes[1].id, owner);
  assert.equal(writes[1].values.avatar_url, `https://fixture.invalid/profile-avatars/${path}`);
  await functions.updateMyAvatar({ context, data: { path: null } });
  assert.equal(writes[2].values.avatar_url, null);
  assert.equal(writes[2].id, owner);
});
test("native avatar upload rejects invalid media and never saves a photo to a switched account", async () => {
  const owner = randomUUID(),
    uploads = [],
    updates = [];
  let current = owner,
    changeAfterUpload = true;
  const actor = { userId: owner, installId: "fixture-install" };
  const client = load("../apps/mobile/src/account-media.ts", {
    "./identity": { installIdentifier: () => actor.installId },
    "./client": {
      auth: {
        auth: { getSession: async () => ({ data: { session: { user: { id: current } } } }) },
        storage: {
          from: (bucket) => ({
            upload: async (path, file, options) => {
              uploads.push({ bucket, path, type: file.type, options });
              if (changeAfterUpload) current = randomUUID();
              return { error: null };
            },
          }),
        },
      },
      api: async (path, method, payload, signal, expected) => {
        assert.deepEqual(expected, actor);
        if (current !== expected.userId) throw Error("Your account changed");
        updates.push({ path, method, payload });
        return { ok: true };
      },
    },
  });
  await assert.rejects(
    () =>
      client.saveProfileAvatar(actor, new File(["not an image"], "x.html", { type: "text/html" })),
    /JPG/,
  );
  assert.equal(uploads.length, 0);
  const file = new File(["fixture image"], "photo.png", { type: "image/png" });
  await assert.rejects(() => client.saveProfileAvatar(actor, file), /account changed/);
  assert.equal(uploads.length, 1);
  assert.equal(updates.length, 0);
  assert(uploads[0].path.startsWith(`${owner}/avatar-`));
  assert.equal(uploads[0].options.upsert, false);
  await assert.rejects(() => client.saveProfileAvatar(actor, file), /account changed/);
  assert.equal(uploads.length, 1);
  current = owner;
  changeAfterUpload = false;
  await client.saveProfileAvatar(actor, file);
  assert.equal(updates.length, 1);
  assert.equal(updates[0].path, "account/avatar");
  assert.equal(updates[0].payload.path, uploads[1].path);
  await client.saveProfileAvatar(actor, null);
  assert.deepEqual(updates[1].payload, { path: null });
  assert.equal(uploads.length, 2);
});

test("shared session sign-out revokes before global logout, preserves local scope, and stops on failure or owner change", async () => {
  const owner = randomUUID(),
    other = randomUUID(),
    calls = [];
  let actor = owner,
    fail = false,
    switchDuring = false;
  const { completeAccountSignOut } = load("../src/lib/account-session.ts", {});
  const auth = {
    getSession: async () => ({
      data: {
        session: actor ? { user: { id: actor }, access_token: "private-session-token" } : null,
      },
    }),
    signOut: async ({ scope }) => {
      calls.push("logout:" + scope);
      return { error: fail ? Error("Auth provider unavailable") : null };
    },
  };
  const revokeAll = async (token) => {
    assert.equal(token, "private-session-token");
    calls.push("revoke");
    if (fail) throw Error("Revocation unavailable");
    if (switchDuring) actor = other;
  };
  const run = (scope) => completeAccountSignOut({ auth, expectedOwnerId: owner, scope, revokeAll });
  await run("local");
  assert.deepEqual(calls, ["logout:local"]);
  calls.length = 0;
  await run("global");
  assert.deepEqual(calls, ["revoke", "logout:global"]);
  calls.length = 0;
  fail = true;
  await assert.rejects(() => run("global"), /Revocation unavailable/);
  assert.deepEqual(calls, ["revoke"]);
  calls.length = 0;
  await assert.rejects(() => run("local"), /Auth provider unavailable/);
  assert.deepEqual(calls, ["logout:local"]);
  calls.length = 0;
  fail = false;
  switchDuring = true;
  await assert.rejects(() => run("global"), /account changed/);
  assert.deepEqual(calls, ["revoke"]);
  calls.length = 0;
  await assert.rejects(() => run("local"), /account changed/);
  assert.deepEqual(calls, []);
  actor = null;
  await assert.rejects(() => run("global"), /account changed/);
  assert.deepEqual(calls, []);
});

test("website global sign-out uses the own-token revocation endpoint without browser cookies and stops on errors", async () => {
  const owner = randomUUID(),
    calls = [];
  let ok = true;
  const code = ts.transpileModule(
    readFileSync(new URL("../src/lib/account-session.ts", import.meta.url), "utf8"),
    { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } },
  ).outputText;
  const exports = {};
  new Function("exports", "fetch", code)(exports, async (path, options) => {
    assert.equal(path, "/api/mobile/v1/devices/all");
    assert.equal(options.method, "DELETE");
    assert.equal(options.headers.Authorization, "Bearer own-token");
    assert.equal(options.credentials, "omit");
    calls.push("revoke");
    return { ok };
  });
  const auth = {
    getSession: async () => ({
      data: { session: { user: { id: owner }, access_token: "own-token" } },
    }),
    signOut: async ({ scope }) => {
      calls.push(scope);
      return { error: null };
    },
  };
  await exports.websiteAccountSignOut(auth, owner);
  assert.deepEqual(calls, ["local"]);
  calls.length = 0;
  await exports.websiteAccountSignOut(auth, owner, "global");
  assert.deepEqual(calls, ["revoke", "global"]);
  calls.length = 0;
  ok = false;
  await assert.rejects(
    () => exports.websiteAccountSignOut(auth, owner, "global"),
    /Could not sign out/,
  );
  assert.deepEqual(calls, ["revoke"]);
});
