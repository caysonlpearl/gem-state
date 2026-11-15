import test from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { once } from "node:events";
import { createClient } from "@supabase/supabase-js";
import { withFetchSignal } from "../src/lib/scoped-fetch.server.ts";
import { loadPhotoModules } from "./photo-storage-fixture.mjs";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import ts from "typescript";

test("actual scoped service-client factory retains opaque/JWT key handling and shorter SDK cancellation", async () => {
  const code = ts.transpileModule(
    readFileSync(new URL("../src/integrations/supabase/client.server.ts", import.meta.url), "utf8"),
    { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } },
  ).outputText;
  for (const key of ["sb_secret_fixture", "fixture-legacy-jwt"]) {
    const exports = {};
    let observed;
    vm.runInNewContext(code, {
      exports,
      require: (name) => {
        if (name === "@supabase/supabase-js") return { createClient };
        if (name === "../../lib/scoped-fetch.server") return { withFetchSignal };
        throw Error("Unexpected factory dependency");
      },
      process: {
        env: {
          GEM_STATE_SUPABASE_URL: "https://factory.fixture.invalid",
          GEM_STATE_SUPABASE_SERVICE_ROLE_KEY: key,
        },
      },
      Headers,
      Request,
      fetch: async (input, init) => {
        observed = { input, init };
        return Response.json([]);
      },
      console,
    });
    const scope = new AbortController(),
      shorter = new AbortController();
    const client = exports.createSupabaseAdminClient(scope.signal);
    const result = await client
      .from("photo_object_receipts")
      .select("*")
      .abortSignal(shorter.signal)
      .retry(false);
    assert.equal(result.error, null);
    const headers = new Headers(observed.init.headers);
    assert.equal(headers.get("apikey"), key);
    assert.equal(
      headers.get("Authorization"),
      key.startsWith("sb_secret_") ? null : `Bearer ${key}`,
    );
    assert.equal(observed.init.signal.aborted, false);
    shorter.abort();
    assert.equal(observed.init.signal.aborted, true);
  }
});

test(
  "seller photo deadline aborts real SDK transport before headers and during response-body reading",
  { timeout: 10000 },
  async (t) => {
    for (const partialBody of [false, true]) {
      let started,
        closed,
        calls = 0;
      const arrived = new Promise((resolve) => (started = resolve)),
        disconnected = new Promise((resolve) => (closed = resolve));
      const server = createServer((_req, res) => {
        calls++;
        res.once("close", closed);
        if (partialBody) {
          res.writeHead(200, { "Content-Type": "application/json" });
          res.write('[{"path":"owner/photo.jpg",');
        }
        started();
      });
      server.listen(0, "127.0.0.1");
      await once(server, "listening");
      t.after(() => {
        server.closeAllConnections();
        server.close();
      });
      const scope = new AbortController();
      const db = createClient(`http://127.0.0.1:${server.address().port}`, "fixture-key", {
        auth: { persistSession: false, autoRefreshToken: false },
        global: { fetch: withFetchSignal(fetch, scope.signal) },
      });
      const { createSupabasePhotoSource } = loadPhotoModules()("./photo-storage.server");
      const result = createSupabasePhotoSource(db).sign(
        "listing-media",
        ["owner/photo.jpg"],
        3600,
        false,
      );
      // Observe the request before cancelling; an idle timeout is not proof that
      // a network operation actually began or that its body read was cancelled.
      await arrived;
      scope.abort(new DOMException("Seller photo deadline exceeded", "TimeoutError"));
      await assert.rejects(result, /Photo source signing failed/);
      await disconnected;
      assert.equal(calls, 1);
      await new Promise((resolve) => server.close(resolve));
    }
  },
);

test("scoped fetch retains shorter SDK and Request cancellation without changing shared fetch", async () => {
  const scope = new AbortController(),
    shorter = new AbortController(),
    requestScope = new AbortController();
  let observed;
  const fetcher = async (input, init) => {
    observed = { input, init };
    return Response.json({ ok: true });
  };
  assert.equal(withFetchSignal(fetcher), fetcher);
  const scoped = withFetchSignal(fetcher, scope.signal);
  await scoped("https://fixture.invalid", {
    signal: shorter.signal,
    headers: { "x-fixture": "kept" },
  });
  assert.equal(observed.init.headers["x-fixture"], "kept");
  assert.equal(observed.init.signal.aborted, false);
  shorter.abort();
  assert.equal(observed.init.signal.aborted, true);
  const request = new Request("https://fixture.invalid", { signal: requestScope.signal });
  await scoped(request);
  requestScope.abort();
  assert.equal(observed.init.signal.aborted, true);
  scope.abort();
  assert.throws(() => scoped("https://fixture.invalid"), /abort/i);
});

test("scoped photo stores never reuse or poison the shared singleton, and swallowed cancellation is rejected", async () => {
  const signals = [],
    sharedDb = {};
  let instances = 0,
    abortDuringSign;
  const module = loadPhotoModules({
    "./runtime-env.server": { serverEnv: () => "" },
    "@/integrations/supabase/client.server": {
      supabaseAdmin: sharedDb,
      createSupabaseAdminClient: (signal) => {
        signals.push(signal);
        return { signal };
      },
    },
    "./photo-storage-core.server": {
      createPhotoStorage: () => ({
        instance: ++instances,
        sign: async () => {
          abortDuringSign?.();
          return new Map();
        },
      }),
    },
  })("./photo-storage.server");
  const shared = await module.getPhotoStorage();
  const scope = new AbortController();
  const first = await module.getPhotoStorage(false, scope.signal),
    second = await module.getPhotoStorage(false, scope.signal);
  assert.notEqual(first.instance, shared.instance);
  assert.notEqual(first.instance, second.instance);
  assert.equal(await module.getPhotoStorage(), shared);
  assert.deepEqual(signals, [scope.signal, scope.signal]);
  abortDuringSign = () => scope.abort();
  await assert.rejects(
    module.signPrivatePhotoUrls("listing-media", ["owner/photo.jpg"], 3600, false, scope.signal),
    /abort/i,
  );
  assert.equal(await module.getPhotoStorage(), shared);
});

test(
  "one seller-photo deadline cancels the R2 photo pool and prevents later network batches",
  { timeout: 10000 },
  async (t) => {
    const scope = new AbortController(),
      paths = Array.from({ length: 32 }, (_, n) => `owner/photo-${n}.jpg`);
    const records = paths.map((path, n) => ({
      bucket: "listing-media",
      path,
      r2_key: `original/v1/${String(n).padStart(64, "0")}/${"a".repeat(64)}`,
      sha256: "a".repeat(64),
      byte_size: 120,
      content_type: "image/jpeg",
      verified_at: "2026-11-14T00:00:00Z",
    }));
    let ready,
      heads = 0,
      receiptReads = 0;
    const poolStarted = new Promise((resolve) => (ready = resolve));
    const fakeFetch = async (input, init) => {
      const request = input instanceof Request ? input : new Request(input, init);
      const url = new URL(request.url);
      if (url.hostname === "photo-deadline.fixture.invalid") {
        assert.equal(url.pathname, "/rest/v1/photo_object_receipts");
        receiptReads++;
        return Response.json(records);
      }
      assert.equal(url.hostname, `${"a".repeat(32)}.r2.cloudflarestorage.com`);
      assert.equal(request.method, "HEAD");
      if (url.pathname === "/listing-fixture") return new Response(null, { status: 200 });
      heads++;
      return new Promise((_resolve, reject) => {
        const signal = init?.signal ?? request.signal;
        signal.addEventListener("abort", () => reject(signal.reason), { once: true });
        if (heads === 6) ready();
      });
    };
    t.mock.method(globalThis, "fetch", fakeFetch);
    const env = {
      BLUEBIRD_PHOTO_STORAGE_MODE: "r2",
      BLUEBIRD_R2_ACCOUNT_ID: "a".repeat(32),
      BLUEBIRD_R2_ACCESS_KEY_ID: "fixture-access",
      BLUEBIRD_R2_SECRET_ACCESS_KEY: "fixture-secret",
      BLUEBIRD_R2_LISTING_BUCKET: "listing-fixture",
      BLUEBIRD_R2_EVIDENCE_BUCKET: "evidence-fixture",
    };
    const module = loadPhotoModules({
      "./runtime-env.server": { serverEnv: (name) => env[name] ?? "" },
      "@/integrations/supabase/client.server": {
        supabaseAdmin: {},
        createSupabaseAdminClient: (signal) =>
          createClient("https://photo-deadline.fixture.invalid", "fixture-key", {
            auth: { persistSession: false, autoRefreshToken: false },
            global: { fetch: withFetchSignal(fakeFetch, signal) },
          }),
      },
    })("./photo-storage.server");
    const result = module.signPrivatePhotoUrls("listing-media", paths, 3600, false, scope.signal);
    await poolStarted;
    scope.abort(new DOMException("Seller photo deadline exceeded", "TimeoutError"));
    await assert.rejects(result, /Seller photo deadline exceeded/);
    assert.equal(heads, 6, "No remaining photo batch reaches the transport after cancellation");
    assert.equal(receiptReads, 1);
  },
);
