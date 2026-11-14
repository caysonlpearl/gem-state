import test from "node:test";
import assert from "node:assert/strict";
import { requestScope } from "../apps/mobile/src/request-scope.ts";
import { readFileSync } from "node:fs";
import ts from "typescript";
function clientFixture(t, transport, duration = 25) {
  const source = readFileSync(
    new URL("../apps/mobile/src/client.ts", import.meta.url),
    "utf8",
  ).replaceAll("import.meta.env", "environment");
  const code = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const modules = {
    "./request-scope": {},
    "./identity": { installIdentifier: () => "install" },
    "@supabase/supabase-js": {},
    "@capacitor/core": {},
    "@capacitor/browser": {},
    "../../../src/lib/mobile-contract": {},
  };
  modules["./request-scope"].requestScope = (ms, caller) => {
    assert.equal(ms, 20000);
    return requestScope(duration, caller);
  };
  const exports = {};
  new Function("require", "exports", "environment", "fetch", code)(
    (id) => modules[id],
    exports,
    { VITE_MOBILE_API_ORIGIN: "https://fixture.invalid", DEV: true },
    transport,
  );
  return exports;
}
test("request timeout works without AbortSignal static helpers and cancels an in-flight transport exactly once", async (t) => {
  const originalTimeout = AbortSignal.timeout,
    originalAny = AbortSignal.any;
  AbortSignal.timeout = undefined;
  AbortSignal.any = undefined;
  t.after(() => {
    AbortSignal.timeout = originalTimeout;
    AbortSignal.any = originalAny;
  });
  assert.equal(typeof AbortSignal.timeout, "undefined");
  assert.equal(typeof AbortSignal.any, "undefined");
  let calls = 0,
    aborts = 0;
  const c = clientFixture(t, async (url, init) => {
    calls++;
    return new Promise((resolve, reject) =>
      init.signal.addEventListener(
        "abort",
        () => {
          aborts++;
          reject(init.signal.reason);
        },
        { once: true },
      ),
    );
  });
  await assert.rejects(
    c.api("home"),
    (e) => e.name === "TimeoutError" && /Please retry/.test(e.message),
  );
  assert.equal(calls, 1);
  assert.equal(aborts, 1);
});
test("a caller cancellation and an already-aborted caller propagate immediately without depending on newer methods", async () => {
  const c = new AbortController(),
    reason = new Error("cancelled by caller"),
    s = requestScope(1000, c.signal);
  c.abort(reason);
  assert.equal(s.signal.aborted, true);
  assert.equal(s.signal.reason, reason);
  s.dispose();
  const a = requestScope(1000, c.signal);
  assert.equal(a.signal.aborted, true);
  assert.equal(a.signal.reason, reason);
  a.dispose();
});
test("successful completion removes the caller listener and clears the pending timer", async () => {
  const c = new AbortController(),
    s = requestScope(25, c.signal);
  s.dispose();
  c.abort();
  await new Promise((r) => setTimeout(r, 40));
  assert.equal(s.signal.aborted, false);
});
test("the deadline remains in force when a caller supplies its own signal, and abort during body parsing stays uncertain", async (t) => {
  const caller = new AbortController();
  let aborts = 0;
  const c = clientFixture(t, async (url, init) => ({
    ok: true,
    json: () =>
      new Promise((resolve, reject) =>
        init.signal.addEventListener(
          "abort",
          () => {
            aborts++;
            reject(init.signal.reason);
          },
          { once: true },
        ),
      ),
  }));
  await assert.rejects(
    c.api("account", "GET", undefined, caller.signal),
    (e) => e.name === "TimeoutError",
  );
  assert.equal(aborts, 1);
  assert.equal(caller.signal.aborted, false);
});
test("ordinary responses and server errors preserve API behavior and never retry uncertain writes", async (t) => {
  for (const [response, status] of [
    [Response.json({ data: { ok: true } }), 200],
    [
      Response.json(
        { error: { code: "listing_changed", message: "Reload this listing." } },
        { status: 409 },
      ),
      409,
    ],
    [new Response("broken"), 503],
  ]) {
    let calls = 0;
    const c = clientFixture(
      t,
      async () => {
        calls++;
        return response;
      },
      1000,
    );
    if (status === 200) assert.deepEqual(await c.api("account"), { ok: true });
    else await assert.rejects(c.api("account"), (e) => e.status === status);
    assert.equal(calls, 1);
  }
});

test("client cancellation stops before transport, and a lost write response retains its original retry header and body", async (t) => {
  const controller = new AbortController(),
    reason = new DOMException("Cancelled", "AbortError");
  controller.abort(reason);
  let calls = 0;
  const stopped = clientFixture(t, async () => {
    calls++;
    return Response.json({ data: { ok: true } });
  });
  await assert.rejects(
    stopped.api("listings", "POST", { title: "Fixture" }, controller.signal),
    (e) => e === reason,
  );
  assert.equal(calls, 0);
  const attempts = [];
  const c = clientFixture(
    t,
    async (url, options) => {
      attempts.push({ url, method: options.method, headers: options.headers, body: options.body });
      if (attempts.length === 1) throw new TypeError("Response lost after commit");
      return Response.json({ data: { listingId: "same-listing", replayed: true } });
    },
    1000,
  );
  const id = crypto.randomUUID(),
    payload = { title: "Fixture", publicMediaPaths: ["owner/photo.jpg"] };
  await assert.rejects(
    c.api("listings", "POST", payload, undefined, undefined, id),
    /Response lost/,
  );
  assert.equal(attempts.length, 1);
  assert.deepEqual(await c.api("listings", "POST", payload, undefined, undefined, id), {
    listingId: "same-listing",
    replayed: true,
  });
  assert.deepEqual(attempts[0], attempts[1]);
  assert.equal(attempts[0].headers["Idempotency-Key"], id);
});
