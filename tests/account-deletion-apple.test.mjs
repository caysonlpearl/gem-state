import test from "node:test";
import assert from "node:assert/strict";
import { createAppleTokenRevoker } from "../src/lib/account-deletion-apple.server.ts";
import { DeletionStepError } from "../src/lib/account-deletion-worker.ts";
const keys = await crypto.subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, true, [
  "sign",
  "verify",
]);
const pkcs8 = await crypto.subtle.exportKey("pkcs8", keys.privateKey);
const pem =
  "-----BEGIN PRIVATE KEY-----\n" +
  Buffer.from(pkcs8).toString("base64") +
  "\n-----END PRIVATE KEY-----\n";
const config = () => ({
  teamId: "TEAMID1234",
  keyId: "KEYID12345",
  clientId: "com.fixture.bluebird",
  privateKeyPem: pem,
});
const token = () => ({
  clientId: "com.fixture.bluebird",
  kind: "refresh_token",
  value: "fixture-token+with&encoded/=characters?",
});
const signal = () => new AbortController().signal;
const coded = (e) =>
  e instanceof DeletionStepError &&
  e.code === "authorization_unavailable" &&
  e.message === "authorization_unavailable" &&
  e.cause === undefined;

test("Apple revocation signs a short-lived ES256 client secret and sends only the documented percent-encoded form", async () => {
  for (const kind of ["refresh_token", "access_token"]) {
    let calls = 0;
    const revoke = createAppleTokenRevoker(
      config(),
      async (url, init) => {
        calls++;
        assert.equal(url, "https://appleid.apple.com/auth/revoke");
        assert.equal(init.method, "POST");
        assert.equal(init.redirect, "error");
        assert.equal(init.credentials, "omit");
        assert.equal(init.cache, "no-store");
        assert.equal(init.headers["Content-Type"], "application/x-www-form-urlencoded");
        assert.equal(init.headers.Authorization, undefined);
        const body = new URLSearchParams(init.body);
        assert.deepEqual([...body.keys()].sort(), [
          "client_id",
          "client_secret",
          "token",
          "token_type_hint",
        ]);
        assert.equal(body.get("client_id"), config().clientId);
        assert.equal(body.get("token_type_hint"), kind);
        assert.equal(body.get("token"), token().value);
        const [header, payload, signature] = body.get("client_secret").split(".");
        assert.deepEqual(JSON.parse(Buffer.from(header, "base64url")), {
          alg: "ES256",
          kid: config().keyId,
        });
        assert.deepEqual(JSON.parse(Buffer.from(payload, "base64url")), {
          iss: config().teamId,
          iat: 1800000000,
          exp: 1800000300,
          aud: "https://appleid.apple.com",
          sub: config().clientId,
        });
        assert.equal(Buffer.from(signature, "base64url").length, 64);
        assert(
          await crypto.subtle.verify(
            { name: "ECDSA", hash: "SHA-256" },
            keys.publicKey,
            Buffer.from(signature, "base64url"),
            new TextEncoder().encode(header + "." + payload),
          ),
        );
        return new Response(null, { status: 200 });
      },
      () => 1800000000000,
    );
    assert.equal(await revoke.revoke({ ...token(), kind }, signal()), undefined);
    assert.equal(calls, 1);
    assert.deepEqual(Object.keys(revoke), ["revoke"]);
    assert(Object.isFrozen(revoke));
  }
});

test("caller mutations cannot retarget the configured app or change the token during signing", async () => {
  const supplied = config(),
    t = token();
  let sent;
  const revoke = createAppleTokenRevoker(supplied, async (_url, init) => {
    sent = new URLSearchParams(init.body);
    return new Response(null, { status: 200 });
  });
  const pending = revoke.revoke(t, signal());
  supplied.clientId = "com.other.app";
  supplied.teamId = "OTHER12345";
  supplied.privateKeyPem = "PRIVATE mutated key";
  t.value = "PRIVATE other member token";
  t.kind = "access_token";
  t.clientId = "com.other.app";
  await pending;
  assert.equal(sent.get("client_id"), config().clientId);
  assert.equal(sent.get("token"), token().value);
  assert.equal(sent.get("token_type_hint"), "refresh_token");
});

test("missing/mismatched configuration and tokens fail closed without a provider call or leaking values", async () => {
  let calls = 0;
  const fetcher = async () => {
    calls++;
    throw Error("must not call");
  };
  for (const patch of [
    { teamId: "bad" },
    { keyId: "bad" },
    { clientId: "TEAMID1234.com.fixture" },
    { clientId: "https://evil.invalid" },
    { privateKeyPem: "PRIVATE invalid key" },
    { privateKeyPem: "x".repeat(17000) },
  ])
    assert.throws(() => createAppleTokenRevoker({ ...config(), ...patch }, fetcher), coded);
  const revoker = createAppleTokenRevoker(config(), fetcher);
  for (const patch of [
    { clientId: "com.other.client" },
    { value: "" },
    { value: " white space " },
    { value: "fixture\nsecret" },
    { value: "\u0000" },
    { value: "é" },
    { value: "x".repeat(8193) },
    { kind: "id_token" },
  ])
    await assert.rejects(revoker.revoke({ ...token(), ...patch }, signal()), coded);
  const malformed = createAppleTokenRevoker(
    {
      ...config(),
      privateKeyPem: "-----BEGIN PRIVATE KEY-----\nAAAA\n-----END PRIVATE KEY-----\n",
    },
    fetcher,
  );
  await assert.rejects(malformed.revoke(token(), signal()), coded);
  assert.equal(calls, 0);
});

test("provider errors, redirects, unexpected successes and nonempty bodies never acknowledge revocation", async () => {
  for (const status of [200, 202, 204, 301, 400, 401, 403, 429, 500]) {
    let calls = 0;
    const revoker = createAppleTokenRevoker(config(), async () => {
      calls++;
      return new Response(status === 204 ? null : "PRIVATE provider diagnostics and token", {
        status,
      });
    });
    await assert.rejects(revoker.revoke(token(), signal()), coded);
    assert.equal(calls, 1);
  }
  const redirected = new Response(null, { status: 200 });
  Object.defineProperty(redirected, "redirected", { value: true });
  await assert.rejects(
    createAppleTokenRevoker(config(), async () => redirected).revoke(token(), signal()),
    coded,
  );
});

test("lost acknowledgements are retried by the caller, not by the transport, and repeated empty 200s are accepted", async () => {
  let calls = 0;
  const bodies = [];
  const revoker = createAppleTokenRevoker(config(), async (_url, init) => {
    calls++;
    bodies.push(new URLSearchParams(init.body));
    if (calls === 1) throw Error("PRIVATE ambiguous network outcome");
    return new Response(null, { status: 200 });
  });
  await assert.rejects(revoker.revoke(token(), signal()), coded);
  assert.equal(calls, 1);
  await revoker.revoke(token(), signal());
  await revoker.revoke(token(), signal());
  assert.equal(calls, 3);
  assert(bodies.every((b) => b.get("token") === token().value));
});

test("cancellation before signing prevents requests and a stalled provider read has one 15-second deadline", async (t) => {
  let calls = 0;
  const controller = new AbortController();
  controller.abort();
  const immediate = createAppleTokenRevoker(config(), async () => {
    calls++;
    throw Error();
  });
  await assert.rejects(immediate.revoke(token(), controller.signal), coded);
  assert.equal(calls, 0);
  const keepAlive = setTimeout(() => {}, 1000);
  t.after(() => clearTimeout(keepAlive));
  const realTimeout = AbortSignal.timeout.bind(AbortSignal);
  t.mock.method(AbortSignal, "timeout", (ms) => {
    assert.equal(ms, 15000);
    return realTimeout(25);
  });
  let requestSignal;
  const stalled = createAppleTokenRevoker(config(), async (_url, init) => {
    calls++;
    requestSignal = init.signal;
    return new Promise((_resolve, reject) =>
      init.signal.addEventListener("abort", () => reject(Error("PRIVATE cancelled")), {
        once: true,
      }),
    );
  });
  await assert.rejects(stalled.revoke(token(), signal()), coded);
  assert.equal(calls, 1);
  assert(requestSignal.aborted);
});

test("a stalled 200 response body is cancelled and does not become a successful revocation", async () => {
  const controller = new AbortController();
  let cancelled = false;
  const revoker = createAppleTokenRevoker(config(), async () => {
    setTimeout(() => controller.abort(), 20);
    return new Response(
      new ReadableStream({
        cancel() {
          cancelled = true;
        },
      }),
      { status: 200 },
    );
  });
  await assert.rejects(revoker.revoke(token(), controller.signal), coded);
  assert(cancelled);
});

test("invalid clocks do not mint a secret or send user tokens", async () => {
  let calls = 0;
  for (const value of [NaN, Infinity, -1000, Number.MAX_SAFE_INTEGER * 1000]) {
    const revoker = createAppleTokenRevoker(
      config(),
      async () => {
        calls++;
        throw Error();
      },
      () => value,
    );
    await assert.rejects(revoker.revoke(token(), signal()), coded);
  }
  assert.equal(calls, 0);
});
