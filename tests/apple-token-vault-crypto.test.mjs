import test from "node:test";
import assert from "node:assert/strict";
import { randomBytes, randomUUID } from "node:crypto";
import { createAppleTokenVaultCrypto } from "../src/lib/apple-token-vault-crypto.server.ts";
import { DeletionStepError } from "../src/lib/account-deletion-worker.ts";
const signal = () => new AbortController().signal;
const config = () => ({
  projectUrl: "https://fixture.invalid",
  activeVersion: "v1",
  keys: { v1: randomBytes(32).toString("hex") },
});
const bundle = () => ({
  clientId: "com.fixture.bluebird",
  subject: "001.fixture-subject",
  refreshToken: "fixture-refresh+token&/=",
  accessToken: "fixture-access+token",
  idToken: "ey.fixture.signature",
});
const coded = (e) =>
  e instanceof DeletionStepError &&
  e.code === "authorization_unavailable" &&
  e.message === e.code &&
  e.cause === undefined;

test("Apple vault encryption binds every ownership field, randomizes ciphertext and never exposes a plaintext credential", async () => {
  const supplied = config(),
    v = createAppleTokenVaultCrypto(supplied),
    user = randomUUID(),
    identity = randomUUID(),
    b = bundle();
  const pending = v.seal(user, identity, b, signal());
  supplied.keys.v1 = "00".repeat(32);
  b.refreshToken = "caller-mutated-private-token";
  const e = await pending,
    again = await v.seal(user, identity, bundle(), signal());
  assert(Object.isFrozen(e));
  assert.deepEqual(await v.open(e, signal()), bundle());
  assert.notEqual(e.nonceHex, again.nonceHex);
  assert.notEqual(e.ciphertextHex, again.ciphertextHex);
  assert.equal(e.tokenFingerprint, again.tokenFingerprint);
  assert.equal(
    await v.fingerprint(user, bundle().clientId, bundle().refreshToken, signal()),
    e.tokenFingerprint,
  );
  assert.notEqual(
    await v.fingerprint(randomUUID(), bundle().clientId, bundle().refreshToken, signal()),
    e.tokenFingerprint,
  );
  for (const [field, value] of Object.entries(bundle()))
    if (field !== "clientId")
      assert(!JSON.stringify(e).includes(value), "Envelope contains no subject or credential");
  for (const patch of [
    { userId: randomUUID() },
    { identityId: randomUUID() },
    { clientId: "com.other.app" },
    { subjectFingerprint: "00".repeat(32) },
    { tokenFingerprint: "00".repeat(32) },
    { storeFingerprint: "00".repeat(32) },
    { keyVersion: "missing" },
    { nonceHex: (e.nonceHex[0] === "0" ? "1" : "0") + e.nonceHex.slice(1) },
    { ciphertextHex: (e.ciphertextHex[0] === "0" ? "1" : "0") + e.ciphertextHex.slice(1) },
    { ciphertextHex: "" },
    { ciphertextHex: "a".repeat(131073) },
    { nonceHex: "gg".repeat(12) },
  ])
    await assert.rejects(v.open({ ...e, ...patch }, signal()), coded);
});

test("Apple vault key rotation reads retained versions, while missing keys and another project cannot decrypt", async () => {
  const c = config(),
    user = randomUUID(),
    identity = randomUUID();
  const e = await createAppleTokenVaultCrypto(c).seal(user, identity, bundle(), signal());
  const rotated = {
    ...c,
    activeVersion: "v2",
    keys: { ...c.keys, v2: randomBytes(32).toString("hex") },
  };
  assert.deepEqual(await createAppleTokenVaultCrypto(rotated).open(e, signal()), bundle());
  const next = await createAppleTokenVaultCrypto(rotated).seal(user, identity, bundle(), signal());
  assert.notEqual(next.tokenFingerprint, e.tokenFingerprint);
  for (const other of [
    { ...rotated, keys: { v2: rotated.keys.v2 } },
    { ...c, projectUrl: "https://other.invalid" },
    config(),
  ])
    await assert.rejects(createAppleTokenVaultCrypto(other).open(e, signal()), coded);
});

test("Apple vault rejects invalid configuration, malformed payloads and cancellation with coded errors only", async () => {
  for (const patch of [
    { projectUrl: "http://fixture.invalid" },
    { projectUrl: "https://fixture.invalid/path" },
    { projectUrl: "https://user:secret@fixture.invalid" },
    { activeVersion: "missing" },
    { keys: {} },
    { keys: { v1: "private invalid key" } },
  ])
    assert.throws(() => createAppleTokenVaultCrypto({ ...config(), ...patch }), coded);
  const v = createAppleTokenVaultCrypto(config()),
    user = randomUUID(),
    identity = randomUUID();
  for (const patch of [
    { subject: "" },
    { clientId: 123 },
    { refreshToken: "private\nsecret" },
    { idToken: "unsigned" },
    { accessToken: "x".repeat(8193) },
  ])
    await assert.rejects(v.seal(user, identity, { ...bundle(), ...patch }, signal()), coded);
  const e = await v.seal(user, identity, bundle(), signal()),
    controller = new AbortController();
  controller.abort("private caller reason");
  await assert.rejects(v.open(e, controller.signal), coded);
  await assert.rejects(v.seal(user, identity, bundle(), controller.signal), coded);
  await assert.rejects(
    v.fingerprint(user, bundle().clientId, bundle().refreshToken, controller.signal),
    coded,
  );
});
