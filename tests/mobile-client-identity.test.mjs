import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import ts from "typescript";
const source = readFileSync(
  new URL("../apps/mobile/src/client.ts", import.meta.url),
  "utf8",
).replaceAll("import.meta.env", "environment");
const compiled = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;
function fixture() {
  const calls = [],
    state = { install: randomUUID(), session: null };
  const modules = {
    "@supabase/supabase-js": {},
    "@capacitor/core": { Capacitor: { isNativePlatform: () => false } },
    "@capacitor/browser": {},
    "../../../src/lib/mobile-contract": {},
    "./identity": { installIdentifier: () => state.install },
  };
  const exports = {};
  new Function("require", "exports", "environment", "fetch", compiled)(
    (name) => modules[name],
    exports,
    { VITE_MOBILE_API_ORIGIN: "https://fixture.invalid", DEV: true },
    async (url, options) => {
      calls.push({ url, options });
      return Response.json({ data: { ok: true } });
    },
  );
  exports.auth = { auth: { getSession: async () => ({ data: { session: state.session } }) } };
  return { client: exports, state, calls };
}
test("activity cannot cross an account switch while waiting for the current session", async () => {
  const f = fixture(),
    original = f.state.install;
  f.state.session = { access_token: "current-token", user: { id: randomUUID() } };
  await assert.rejects(
    () =>
      f.client.api("activity", "POST", { events: [] }, undefined, {
        userId: null,
        installId: original,
      }),
    (e) => e.code === "account_changed",
  );
  assert.equal(f.calls.length, 0);
});
test("clearing an install identifier invalidates an old guest activity batch", async () => {
  const f = fixture(),
    original = f.state.install;
  f.state.install = randomUUID();
  await assert.rejects(
    () =>
      f.client.api("activity", "POST", { events: [] }, undefined, {
        userId: null,
        installId: original,
      }),
    (e) => e.code === "account_changed",
  );
  assert.equal(f.calls.length, 0);
});
test("guest identifiers are sent only to shopping controls/activity, not ordinary marketplace reads", async () => {
  const f = fixture();
  await f.client.api("listings?q=family+car");
  assert.equal(f.calls[0].options.headers["X-Bluebird-Install"], undefined);
  await f.client.api("shopping", "GET", undefined, undefined, {
    userId: null,
    installId: f.state.install,
  });
  assert.equal(f.calls[1].options.headers["X-Bluebird-Install"], f.state.install);
});

test("a corrupted stored guest identifier is replaced, including when storage is unavailable", () => {
  const code = ts.transpileModule(
    readFileSync(new URL("../apps/mobile/src/identity.ts", import.meta.url), "utf8"),
    { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } },
  ).outputText;
  for (const blocked of [false, true]) {
    let stored = "------------------------------------";
    const exports = {};
    const storage = {
      getItem() {
        if (blocked) throw Error("blocked");
        return stored;
      },
      setItem(_, value) {
        if (blocked) throw Error("blocked");
        stored = value;
      },
    };
    new Function("exports", "localStorage", "crypto", code)(exports, storage, crypto);
    const id = exports.installIdentifier();
    assert.match(id, /^[0-9a-f]{8}-[0-9a-f-]{27}$/i);
    assert.notEqual(id, "------------------------------------");
    assert.equal(exports.installIdentifier(), id);
    assert.notEqual(exports.resetInstallIdentifier(), id);
  }
});
