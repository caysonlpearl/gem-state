import { DeletionStepError } from "./account-deletion-worker.ts";

export type AppleTokenBundle = Readonly<{
  clientId: string;
  subject: string;
  refreshToken: string;
  accessToken: string;
  idToken: string;
}>;
export type AppleTokenEnvelope = Readonly<{
  userId: string;
  identityId: string;
  clientId: string;
  subjectFingerprint: string;
  tokenFingerprint: string;
  storeFingerprint: string;
  keyVersion: string;
  nonceHex: string;
  ciphertextHex: string;
}>;
export type AppleVaultKeyring = Readonly<{
  projectUrl: string;
  activeVersion: string;
  keys: Readonly<Record<string, string>>;
}>;
const unavailable = () => new DeletionStepError("authorization_unavailable");
const uuid = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
const hex = (b: Uint8Array) => Array.from(b, (x) => x.toString(16).padStart(2, "0")).join("");
const bytes = (s: string) => Uint8Array.from(s.match(/../g) ?? [], (x) => parseInt(x, 16));
const encode = (v: unknown) =>
  new TextEncoder().encode(typeof v === "string" ? v : JSON.stringify(v));
const hash = async (s: string) =>
  hex(new Uint8Array(await crypto.subtle.digest("SHA-256", encode(s))));
const printable = (s: unknown, max = 8192): s is string =>
  typeof s === "string" && s.length > 0 && s.length <= max && /^[\x21-\x7e]+$/.test(s);
function bundle(s: AppleTokenBundle): AppleTokenBundle {
  const v = Object.freeze({
    clientId: s.clientId,
    subject: s.subject,
    refreshToken: s.refreshToken,
    accessToken: s.accessToken,
    idToken: s.idToken,
  });
  if (
    !printable(v.clientId, 255) ||
    !/^[A-Za-z0-9][A-Za-z0-9._-]{0,254}$/.test(v.clientId) ||
    !printable(v.subject, 255) ||
    !printable(v.refreshToken) ||
    !printable(v.accessToken) ||
    !printable(v.idToken, 32768) ||
    !/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(v.idToken)
  )
    throw unavailable();
  return v;
}
/** Encryption only. The capture coordinator must verify Apple and account
 * ownership before sealing. Ciphertexts never themselves authorize revocation. */
export function createAppleTokenVaultCrypto(supplied: AppleVaultKeyring) {
  let project: string, active: string;
  const roots = new Map<string, string>();
  try {
    const url = new URL(supplied.projectUrl);
    project = url.origin;
    active = supplied.activeVersion;
    if (
      url.protocol !== "https:" ||
      url.username ||
      url.password ||
      url.pathname !== "/" ||
      url.search ||
      url.hash
    )
      throw unavailable();
    for (const [version, key] of Object.entries(supplied.keys)) {
      if (
        !/^[A-Za-z0-9_-]{1,32}$/.test(version) ||
        typeof key !== "string" ||
        !/^[a-f0-9]{64}$/i.test(key)
      )
        throw unavailable();
      roots.set(version, key);
    }
    if (roots.size < 1 || roots.size > 8 || !roots.has(active)) throw unavailable();
  } catch {
    throw unavailable();
  }
  const store = hash(JSON.stringify(["bluebird-apple-vault-v1", project]));
  const keys = new Map<string, Promise<{ aes: CryptoKey; hmac: CryptoKey }>>();
  function key(version: string) {
    if (!roots.has(version)) throw unavailable();
    let pending = keys.get(version);
    if (!pending) {
      pending = (async () => {
        const root = await crypto.subtle.importKey(
          "raw",
          bytes(roots.get(version)!),
          "HKDF",
          false,
          ["deriveKey"],
        );
        const params = (purpose: string) => ({
          name: "HKDF",
          hash: "SHA-256",
          salt: encode(project),
          info: encode("bluebird.apple-vault.v1/" + purpose),
        });
        const [aes, hmac] = await Promise.all([
          crypto.subtle.deriveKey(
            params("encryption"),
            root,
            { name: "AES-GCM", length: 256 },
            false,
            ["encrypt", "decrypt"],
          ),
          crypto.subtle.deriveKey(
            params("fingerprint"),
            root,
            { name: "HMAC", hash: "SHA-256", length: 256 },
            false,
            ["sign"],
          ),
        ]);
        return { aes, hmac };
      })();
      keys.set(version, pending);
    }
    return pending;
  }
  async function fingerprint(user: string, client: string, token: string, version: string) {
    return hex(
      new Uint8Array(
        await crypto.subtle.sign(
          "HMAC",
          (await key(version)).hmac,
          encode(["apple-refresh-v1", user, client, token]),
        ),
      ),
    );
  }
  function aad(e: AppleTokenEnvelope) {
    return encode([
      "bluebird.apple-vault",
      1,
      e.storeFingerprint,
      e.userId,
      e.identityId,
      e.clientId,
      e.subjectFingerprint,
      e.tokenFingerprint,
      e.keyVersion,
    ]);
  }
  return Object.freeze({
    async fingerprint(user: string, client: string, token: string, signal: AbortSignal) {
      try {
        signal.throwIfAborted();
        if (!uuid.test(user) || !printable(client, 255) || !printable(token)) throw unavailable();
        const value = await fingerprint(user.toLowerCase(), client, token, active);
        signal.throwIfAborted();
        return value;
      } catch {
        throw unavailable();
      }
    },
    activeVersion: active,
    async seal(
      user: string,
      identity: string,
      suppliedBundle: AppleTokenBundle,
      signal: AbortSignal,
    ): Promise<AppleTokenEnvelope> {
      try {
        signal.throwIfAborted();
        if (!uuid.test(user) || !uuid.test(identity)) throw unavailable();
        const value = bundle(suppliedBundle),
          userId = user.toLowerCase(),
          identityId = identity.toLowerCase();
        const e = {
          userId,
          identityId,
          clientId: value.clientId,
          subjectFingerprint: await hash(value.subject),
          tokenFingerprint: await fingerprint(userId, value.clientId, value.refreshToken, active),
          storeFingerprint: await store,
          keyVersion: active,
          nonceHex: "",
          ciphertextHex: "",
        };
        signal.throwIfAborted();
        const nonce = crypto.getRandomValues(new Uint8Array(12));
        const plaintext = encode(value);
        if (plaintext.length > 65520) throw unavailable();
        e.nonceHex = hex(nonce);
        e.ciphertextHex = hex(
          new Uint8Array(
            await crypto.subtle.encrypt(
              { name: "AES-GCM", iv: nonce, additionalData: aad(e), tagLength: 128 },
              (await key(active)).aes,
              plaintext,
            ),
          ),
        );
        signal.throwIfAborted();
        return Object.freeze(e);
      } catch {
        throw unavailable();
      }
    },
    async open(
      suppliedEnvelope: AppleTokenEnvelope,
      signal: AbortSignal,
    ): Promise<AppleTokenBundle> {
      try {
        signal.throwIfAborted();
        const e = Object.freeze({
          ...suppliedEnvelope,
          userId: suppliedEnvelope.userId.toLowerCase(),
          identityId: suppliedEnvelope.identityId.toLowerCase(),
        });
        if (
          !uuid.test(e.userId) ||
          !uuid.test(e.identityId) ||
          !printable(e.clientId, 255) ||
          ![e.subjectFingerprint, e.tokenFingerprint, e.storeFingerprint].every(
            (s) => typeof s === "string" && /^[a-f0-9]{64}$/.test(s),
          ) ||
          !/^[a-f0-9]{24}$/.test(e.nonceHex) ||
          typeof e.ciphertextHex !== "string" ||
          e.ciphertextHex.length < 34 ||
          e.ciphertextHex.length > 131072 ||
          e.ciphertextHex.length % 2 !== 0 ||
          !/^[a-f0-9]+$/.test(e.ciphertextHex) ||
          e.storeFingerprint !== (await store)
        )
          throw unavailable();
        const plaintext = await crypto.subtle.decrypt(
          { name: "AES-GCM", iv: bytes(e.nonceHex), additionalData: aad(e), tagLength: 128 },
          (await key(e.keyVersion)).aes,
          bytes(e.ciphertextHex),
        );
        const parsed = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(plaintext));
        if (
          !parsed ||
          typeof parsed !== "object" ||
          Array.isArray(parsed) ||
          Object.keys(parsed).length !== 5
        )
          throw unavailable();
        const value = bundle(parsed);
        if (
          value.clientId !== e.clientId ||
          (await hash(value.subject)) !== e.subjectFingerprint ||
          (await fingerprint(e.userId, e.clientId, value.refreshToken, e.keyVersion)) !==
            e.tokenFingerprint
        )
          throw unavailable();
        signal.throwIfAborted();
        return value;
      } catch {
        throw unavailable();
      }
    },
  });
}
