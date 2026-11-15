import { createLocalJWKSet, jwtVerify, type JSONWebKeySet } from "jose";
import {
  createAppleClientSecretSigner,
  type AppleClientConfig,
} from "./apple-client-secret.server.ts";
import {
  createAppleTokenVaultCrypto,
  type AppleVaultKeyring,
  type AppleTokenBundle,
  type AppleTokenEnvelope,
} from "./apple-token-vault-crypto.server.ts";
import { DeletionStepError } from "./account-deletion-worker.ts";
import type { PrivateRecordErasureDatabase } from "./account-deletion-private-records.server.ts";

type Client = PrivateRecordErasureDatabase & {
  auth: {
    admin: { getUserById(id: string): Promise<{ data: { user: unknown }; error: unknown }> };
  };
};
type Identity = Readonly<{ identityId: string; subject: string }>;
const failed = () => new DeletionStepError("authorization_unavailable");
const uuid = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
const object = (v: unknown): v is Record<string, unknown> =>
  !!v && typeof v === "object" && !Array.isArray(v);
const printable = (v: unknown, max = 8192): v is string =>
  typeof v === "string" && v.length > 0 && v.length <= max && /^[\x21-\x7e]+$/.test(v);
async function json(response: Response, signal: AbortSignal, max: number) {
  if (signal.aborted) {
    void response.body?.cancel().catch(() => {});
    throw failed();
  }
  if (
    response.redirected ||
    response.status !== 200 ||
    !/^application\/json(?:\s*;|$)/i.test(response.headers.get("content-type") ?? "")
  ) {
    void response.body?.cancel().catch(() => {});
    throw failed();
  }
  const reader = response.body?.getReader();
  if (!reader) throw failed();
  const cancel = () => {
    void reader.cancel().catch(() => {});
  };
  signal.addEventListener("abort", cancel, { once: true });
  try {
    let total = 0;
    const chunks: Uint8Array[] = [];
    for (let n = 0; n < 1024; n++) {
      const next = await reader.read();
      signal.throwIfAborted();
      if (next.done) {
        const bytes = new Uint8Array(total);
        let offset = 0;
        for (const chunk of chunks) {
          bytes.set(chunk, offset);
          offset += chunk.length;
        }
        return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
      }
      total += next.value.length;
      if (total > max) throw failed();
      chunks.push(next.value);
    }
    throw failed();
  } finally {
    signal.removeEventListener("abort", cancel);
    cancel();
    reader.releaseLock();
  }
}
function identities(value: unknown, userId: string): readonly Identity[] {
  if (
    !object(value) ||
    value.id !== userId ||
    !Array.isArray(value.identities) ||
    value.identities.length > 64
  )
    throw failed();
  const seen = new Set<string>(),
    result: Identity[] = [];
  for (const row of value.identities) {
    if (
      !object(row) ||
      row.user_id !== userId ||
      !printable(row.provider, 255) ||
      typeof row.identity_id !== "string" ||
      !uuid.test(row.identity_id) ||
      seen.has(row.identity_id)
    )
      throw failed();
    seen.add(row.identity_id);
    if (row.provider !== "apple") continue;
    // The Auth API returns provider_id as `id` for SDK compatibility. Its
    // independent identity UUID is `identity_id`; user metadata is not proof.
    if (!printable(row.id, 255) || (row.provider_id !== undefined && row.provider_id !== row.id))
      throw failed();
    if (row.identity_data !== undefined) {
      if (
        !object(row.identity_data) ||
        (row.identity_data.sub !== undefined && row.identity_data.sub !== row.id) ||
        (row.identity_data.iss !== undefined &&
          !["https://appleid.apple.com", "https://account.apple.com"].includes(
            row.identity_data.iss as string,
          ))
      )
        throw failed();
    }
    result.push(Object.freeze({ identityId: row.identity_id.toLowerCase(), subject: row.id }));
  }
  return Object.freeze(result);
}

/** Server-only capture of an existing member's Apple refresh credential. This
 * does not sign a user in, accept an email match, enable Apple or authorize data
 * collection. clientForSignal must use the same privileged project client for
 * Auth and RPC, with the supplied deadline bound to its fetch implementation. */
export function createAppleAuthorizationCapture(
  supplied: { apple: AppleClientConfig; vault: AppleVaultKeyring },
  clientForSignal: (signal: AbortSignal) => Client,
  fetcher: typeof fetch = fetch,
  clock = Date.now,
) {
  const signer = createAppleClientSecretSigner(supplied.apple, clock),
    vault = createAppleTokenVaultCrypto(supplied.vault);
  let cachedKeys: { until: number; resolve: ReturnType<typeof createLocalJWKSet> } | undefined;
  async function keys(signal: AbortSignal, force = false) {
    if (!force && cachedKeys && clock() < cachedKeys.until) return cachedKeys.resolve;
    const response = await fetcher("https://appleid.apple.com/auth/keys", {
      method: "GET",
      redirect: "error",
      credentials: "omit",
      signal,
      headers: { Accept: "application/json" },
    });
    const data = await json(response, signal, 32768);
    if (!object(data) || !Array.isArray(data.keys) || data.keys.length < 1 || data.keys.length > 16)
      throw failed();
    const seen = new Set<string>();
    const selected = [];
    for (const k of data.keys) {
      if (!object(k) || k.kty !== "RSA" || k.alg !== "RS256" || k.use !== "sig") continue;
      if (
        !printable(k.kid, 128) ||
        seen.has(k.kid) ||
        typeof k.n !== "string" ||
        !/^[A-Za-z0-9_-]{342,1366}$/.test(k.n) ||
        typeof k.e !== "string" ||
        !/^[A-Za-z0-9_-]{1,16}$/.test(k.e)
      )
        throw failed();
      seen.add(k.kid);
      selected.push({ kty: "RSA", alg: "RS256", use: "sig", kid: k.kid, n: k.n, e: k.e });
    }
    if (!selected.length) throw failed();
    const resolve = createLocalJWKSet({ keys: selected } as JSONWebKeySet);
    cachedKeys = { until: clock() + 3600000, resolve };
    return resolve;
  }
  async function validate(refreshToken: string, signal: AbortSignal): Promise<AppleTokenBundle> {
    const secret = await signer.secret(signal);
    const response = await fetcher("https://appleid.apple.com/auth/token", {
      method: "POST",
      redirect: "error",
      credentials: "omit",
      cache: "no-store",
      signal,
      headers: { "Content-Type": "application/x-www-form-urlencoded", "Cache-Control": "no-store" },
      body: new URLSearchParams({
        client_id: signer.clientId,
        client_secret: secret,
        grant_type: "refresh_token",
        refresh_token: refreshToken,
      }).toString(),
    });
    const data = await json(response, signal, 65536);
    if (
      !object(data) ||
      data.error !== undefined ||
      data.token_type !== "Bearer" ||
      !printable(data.access_token) ||
      !printable(data.id_token, 32768) ||
      !Number.isSafeInteger(data.expires_in) ||
      (data.expires_in as number) < 1 ||
      (data.expires_in as number) > 86400 ||
      (data.refresh_token !== undefined && data.refresh_token !== refreshToken)
    )
      throw failed();
    const now = clock();
    if (!Number.isSafeInteger(now) || now < 0 || !Number.isFinite(new Date(now).getTime()))
      throw failed();
    const options = {
      issuer: "https://appleid.apple.com",
      audience: signer.clientId,
      algorithms: ["RS256"],
      requiredClaims: ["iss", "aud", "sub", "iat", "exp"],
      clockTolerance: 30,
      currentDate: new Date(now),
    };
    let verified;
    try {
      verified = await jwtVerify(data.id_token, await keys(signal), options);
    } catch (error) {
      if ((error as { code?: unknown })?.code !== "ERR_JWKS_NO_MATCHING_KEY") throw failed();
      verified = await jwtVerify(data.id_token, await keys(signal, true), options);
    }
    signal.throwIfAborted();
    const payload = verified.payload;
    if (
      payload.aud !== signer.clientId ||
      !printable(payload.sub, 255) ||
      !Number.isSafeInteger(payload.iat) ||
      !Number.isSafeInteger(payload.exp) ||
      (payload.iat as number) > Math.floor(now / 1000) + 30 ||
      (payload.exp as number) <= (payload.iat as number)
    )
      throw failed();
    if (payload.at_hash !== undefined) {
      const digest = new Uint8Array(
        await crypto.subtle.digest("SHA-256", new TextEncoder().encode(data.access_token)),
      ).slice(0, 16);
      const expected = btoa(Array.from(digest, (b) => String.fromCharCode(b)).join(""))
        .replace(/=/g, "")
        .replace(/\+/g, "-")
        .replace(/\//g, "_");
      if (payload.at_hash !== expected) throw failed();
    }
    return Object.freeze({
      clientId: signer.clientId,
      subject: payload.sub,
      refreshToken,
      accessToken: data.access_token,
      idToken: data.id_token,
    });
  }
  return Object.freeze({
    async capture(
      suppliedMember: { userId: string; sessionId: string },
      suppliedToken: string,
      caller: AbortSignal,
    ): Promise<{ stored: true }> {
      try {
        const member = Object.freeze({
            userId: suppliedMember.userId.toLowerCase(),
            sessionId: suppliedMember.sessionId.toLowerCase(),
          }),
          token = suppliedToken;
        if (!uuid.test(member.userId) || !uuid.test(member.sessionId) || !printable(token))
          throw failed();
        const signal = AbortSignal.any([caller, AbortSignal.timeout(30000)]);
        signal.throwIfAborted();
        const db = clientForSignal(signal);
        const read = async () => {
          const r = await db.auth.admin.getUserById(member.userId);
          signal.throwIfAborted();
          if (!r || r.error !== null) throw failed();
          return identities(r.data.user, member.userId);
        };
        const before = await read();
        if (!before.length) throw failed();
        const fingerprint = await vault.fingerprint(member.userId, signer.clientId, token, signal);
        const cached = await db
          .rpc("apple_authorization_capture_cached", {
            _user: member.userId,
            _session: member.sessionId,
            _client_id: signer.clientId,
            _fingerprint: fingerprint,
            _key_version: vault.activeVersion,
          })
          .abortSignal(signal)
          .retry(false);
        signal.throwIfAborted();
        if (cached.error !== null || cached.data === undefined) throw failed();
        if (cached.data !== null) {
          if (
            !object(cached.data) ||
            cached.data.userId !== member.userId ||
            cached.data.clientId !== signer.clientId ||
            cached.data.tokenFingerprint !== fingerprint ||
            cached.data.keyVersion !== vault.activeVersion
          )
            throw failed();
          const envelope = cached.data as AppleTokenEnvelope;
          const restored = await vault.open(envelope, signal);
          if (
            restored.refreshToken !== token ||
            !before.some(
              (i) => i.identityId === envelope.identityId && i.subject === restored.subject,
            )
          )
            throw failed();
          return { stored: true };
        }
        const proof = await validate(token, signal),
          identity = before.find((i) => i.subject === proof.subject);
        if (!identity) throw failed();
        const envelope = await vault.seal(member.userId, identity.identityId, proof, signal);
        const after = await read();
        if (
          !after.some((i) => i.identityId === identity.identityId && i.subject === identity.subject)
        )
          throw failed();
        const stored = await db
          .rpc("store_verified_apple_authorization", {
            _user: member.userId,
            _session: member.sessionId,
            _identity_id: identity.identityId,
            _client_id: envelope.clientId,
            _subject_fingerprint: envelope.subjectFingerprint,
            _fingerprint: envelope.tokenFingerprint,
            _store_fingerprint: envelope.storeFingerprint,
            _key_version: envelope.keyVersion,
            _nonce_hex: envelope.nonceHex,
            _ciphertext_hex: envelope.ciphertextHex,
          })
          .abortSignal(signal)
          .retry(false);
        signal.throwIfAborted();
        if (stored.error !== null || stored.data !== true) throw failed();
        return { stored: true };
      } catch {
        throw failed();
      }
    },
  });
}
