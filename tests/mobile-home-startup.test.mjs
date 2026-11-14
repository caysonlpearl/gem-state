import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import ts from "typescript";
import { requestScope } from "../apps/mobile/src/request-scope.ts";

const compile = (path) =>
  ts.transpileModule(
    readFileSync(new URL(path, import.meta.url), "utf8").replaceAll(
      "import.meta.env",
      "environment",
    ),
    {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
    },
  ).outputText;
const clientSource = compile("../apps/mobile/src/client.ts"),
  homeSource = compile("../apps/mobile/src/home-startup.ts");
const snapshot = () => ({ motors: [], recent: [] });
const pause = (ms) => new Promise((r) => setTimeout(r, ms));
function fixture(fetcher = async () => Response.json({ data: snapshot() }), duration = 100) {
  const client = {},
    home = {},
    calls = [];
  const modules = {
    "./request-scope": {
      requestScope: (ms, signal) => {
        assert.equal(ms, 20000);
        return requestScope(duration, signal);
      },
    },
    "@supabase/supabase-js": {
      createClient() {
        throw Error("Prefetch must not initialize Auth");
      },
    },
    "@capacitor/core": {},
    "@capacitor/browser": {},
    "../../../src/lib/mobile-contract": {},
    "./identity": {
      installIdentifier() {
        throw Error("Prefetch must not read an identifier");
      },
    },
    "./client": client,
  };
  const transport = (url, options) => {
    calls.push({ url, options });
    return fetcher(url, options);
  };
  for (const [code, exports] of [
    [clientSource, client],
    [homeSource, home],
  ])
    new Function("require", "exports", "environment", "fetch", code)(
      (name) => {
        assert(Object.hasOwn(modules, name), name);
        return modules[name];
      },
      exports,
      { VITE_MOBILE_API_ORIGIN: "https://fixture.invalid", DEV: true },
      transport,
    );
  client.auth = {
    auth: {
      getSession() {
        throw Error("Prefetch must not read an account session");
      },
    },
  };
  return { home, client, calls };
}
function deferred() {
  let resolve, reject;
  const promise = new Promise((a, b) => {
    resolve = a;
    reject = b;
  });
  return { promise, resolve, reject };
}

test("public home transport bypasses Auth and identifiers, sends no credentials/referrer and returns only its public snapshot", async () => {
  const f = fixture(async () =>
    Response.json({ data: { ...snapshot(), futurePrivateField: "must not be retained" } }),
  );
  assert.deepEqual(await f.home.readPublicHome(), snapshot());
  assert.equal(f.calls.length, 1);
  const { url, options } = f.calls[0];
  assert.equal(url, "https://fixture.invalid/api/mobile/v1/home");
  assert.equal(options.method, "GET");
  assert.equal(options.credentials, "omit");
  assert.equal(options.referrerPolicy, "no-referrer");
  assert.equal(options.redirect, "error");
  assert.equal(options.cache, "no-store");
  assert.deepEqual(options.headers, { Accept: "application/json" });
  assert.equal(options.body, undefined);
});

test("public read retains body deadlines, caller cancellation and safe HTTP/invalid-body failures without retries or newer AbortSignal statics", async (t) => {
  const any = AbortSignal.any,
    timeout = AbortSignal.timeout;
  AbortSignal.any = undefined;
  AbortSignal.timeout = undefined;
  t.after(() => {
    AbortSignal.any = any;
    AbortSignal.timeout = timeout;
  });
  const f = fixture(
    (url, { signal }) =>
      new Promise((resolve, reject) =>
        signal.addEventListener("abort", () => reject(signal.reason), { once: true }),
      ),
    15,
  );
  await assert.rejects(
    f.home.readPublicHome(new AbortController().signal),
    (e) => e.name === "TimeoutError",
  );
  assert.equal(f.calls.length, 1);
  const stopped = fixture();
  await assert.rejects(
    stopped.home.readPublicHome(AbortSignal.abort()),
    (e) => e.name === "AbortError",
  );
  assert.equal(stopped.calls.length, 0);
  for (const response of [
    Response.json({ error: { code: "offline", message: "Please retry" } }, { status: 503 }),
    new Response("not JSON"),
    Response.json({ data: { motors: [] } }),
  ]) {
    const a = fixture(async () => response);
    await assert.rejects(a.home.readPublicHome(), (e) => e instanceof a.client.ApiError);
    assert.equal(a.calls.length, 1);
  }
  const caller = new AbortController();
  const body = fixture(async () => ({
    ok: true,
    json: async () => {
      caller.abort();
      return { data: snapshot() };
    },
  }));
  await assert.rejects(body.home.readPublicHome(caller.signal), (e) => e.name === "AbortError");
  assert.equal(body.calls.length, 1);
});

test("startup begins immediately, is consumed only once, and never replays a snapshot for refresh or another screen", async () => {
  const { home } = fixture();
  const d = deferred();
  let reads = 0;
  const prefetch = home.startPublicHome(() => {
    reads++;
    return d.promise;
  });
  assert.equal(reads, 1);
  const caller = new AbortController();
  const first = prefetch.take(caller.signal);
  assert.equal(prefetch.take(caller.signal), null);
  d.resolve(snapshot());
  assert.deepEqual(await first, snapshot());
  assert.equal(prefetch.take(caller.signal), null);
  assert.equal(reads, 1);
});

test("discard and expiry clear unused snapshots, abort background reads, ignore late responses and never expose an unhandled background failure", async () => {
  const { home } = fixture();
  let time = 0,
    signal;
  const d = deferred();
  const expired = home.startPublicHome(
    (s) => {
      signal = s;
      return d.promise;
    },
    () => time,
  );
  time = 30001;
  assert.equal(expired.take(new AbortController().signal), null);
  assert(signal.aborted);
  d.resolve(snapshot());
  await pause(0);
  assert.equal(expired.take(new AbortController().signal), null);
  let timedSignal;
  const timed = home.startPublicHome(
    (s) => {
      timedSignal = s;
      return new Promise(() => {});
    },
    () => 0,
    5,
  );
  await pause(20);
  assert(timedSignal.aborted);
  assert.equal(timed.take(new AbortController().signal), null);
  const rejected = home.startPublicHome(() => Promise.reject(Error("background failure")));
  await pause(0);
  rejected.cancel();
  assert.equal(rejected.take(new AbortController().signal), null);
  const thrown = home.startPublicHome(() => {
    throw Error("synchronous failure");
  });
  await assert.rejects(thrown.take(new AbortController().signal), /synchronous failure/);
});

test("a claimed read belongs to its screen: navigation disposal cannot trigger a fallback before caller cleanup, and caller cancellation still wins", async () => {
  const { home } = fixture();
  let signal;
  const d = deferred();
  const prefetch = home.startPublicHome((s) => {
    signal = s;
    return d.promise;
  });
  const caller = new AbortController();
  const pending = prefetch.take(caller.signal);
  prefetch.cancel();
  assert.equal(signal.aborted, false);
  caller.abort();
  assert.equal(signal.aborted, true);
  d.resolve(snapshot());
  await assert.rejects(pending, (e) => e.name === "AbortError");
  const stopped = home.startPublicHome(() => Promise.resolve(snapshot()));
  await assert.rejects(stopped.take(AbortSignal.abort()), (e) => e.name === "AbortError");
});

test("a settled successful read removes the screen abort listener; unused public failures remain available only to the first consumer", async () => {
  const { home } = fixture();
  let signal;
  const prefetch = home.startPublicHome((s) => {
    signal = s;
    return Promise.resolve(snapshot());
  });
  const caller = new AbortController();
  assert.deepEqual(await prefetch.take(caller.signal), snapshot());
  caller.abort();
  assert.equal(signal.aborted, false);
  const failed = home.startPublicHome(() => Promise.reject(Error("read failed")));
  await pause(0);
  await assert.rejects(failed.take(new AbortController().signal), /read failed/);
  assert.equal(failed.take(new AbortController().signal), null);
});
