import { DeletionStepError } from "./account-deletion-worker.ts";

export type AppleRevocationConfig = Readonly<{
  teamId: string;
  keyId: string;
  clientId: string;
  privateKeyPem: string;
}>;
/** Read only from the private, verified authorization record for the leased member.
 * Neither an email address nor a member-supplied token proves this relationship. */
export type AppleRevocationToken = Readonly<{
  clientId: string;
  kind: "refresh_token" | "access_token";
  value: string;
}>;
const unavailable = () => new DeletionStepError("authorization_unavailable");
const audience = "https://appleid.apple.com";
const endpoint = audience + "/auth/revoke";
function base64url(bytes: Uint8Array) {
  return btoa(Array.from(bytes, (b) => String.fromCharCode(b)).join(""))
    .replace(/=/g, "")
    .replace(/\+/g, "-")
    .replace(/\//g, "_");
}
function part(value: unknown) {
  return base64url(new TextEncoder().encode(JSON.stringify(value)));
}

/** Private HTTP transport only: no routes, token persistence, queue advancement or worker activation. */
export function createAppleTokenRevoker(
  supplied: AppleRevocationConfig,
  fetcher: typeof fetch = fetch,
  clock = Date.now,
) {
  let config: AppleRevocationConfig;
  try {
    config = Object.freeze({
      teamId: supplied.teamId,
      keyId: supplied.keyId,
      clientId: supplied.clientId,
      privateKeyPem: supplied.privateKeyPem,
    });
    if (
      !/^[A-Z0-9]{10}$/.test(config.teamId) ||
      !/^[A-Z0-9]{10}$/.test(config.keyId) ||
      !/^[A-Za-z0-9][A-Za-z0-9._-]{0,254}$/.test(config.clientId) ||
      config.clientId.startsWith(config.teamId + ".") ||
      typeof config.privateKeyPem !== "string" ||
      config.privateKeyPem.length > 16384 ||
      !/^-----BEGIN PRIVATE KEY-----\r?\n[A-Za-z0-9+/=\r\n]+-----END PRIVATE KEY-----\s*$/.test(
        config.privateKeyPem,
      )
    )
      throw unavailable();
  } catch {
    throw unavailable();
  }
  let key: Promise<CryptoKey> | undefined;
  async function signingKey() {
    key ??= (async () => {
      const pem = config.privateKeyPem.replace(
        /-----BEGIN PRIVATE KEY-----|-----END PRIVATE KEY-----|\s/g,
        "",
      );
      const bytes = Uint8Array.from(atob(pem), (c) => c.charCodeAt(0));
      return crypto.subtle.importKey(
        "pkcs8",
        bytes,
        { name: "ECDSA", namedCurve: "P-256" },
        false,
        ["sign"],
      );
    })();
    return key;
  }
  return Object.freeze({
    async revoke(suppliedToken: AppleRevocationToken, callerSignal: AbortSignal): Promise<void> {
      try {
        // Snapshot before key import/signing yields to other requests.
        const token = Object.freeze({
          clientId: suppliedToken.clientId,
          kind: suppliedToken.kind,
          value: suppliedToken.value,
        });
        if (
          token.clientId !== config.clientId ||
          !["refresh_token", "access_token"].includes(token.kind) ||
          typeof token.value !== "string" ||
          !token.value.length ||
          token.value.length > 8192 ||
          Array.from(token.value).some((c) => c.charCodeAt(0) < 33 || c.charCodeAt(0) > 126)
        )
          throw unavailable();
        const signal = AbortSignal.any([callerSignal, AbortSignal.timeout(15000)]);
        signal.throwIfAborted();
        const privateKey = await signingKey();
        signal.throwIfAborted();
        const issued = Math.floor(clock() / 1000);
        if (!Number.isSafeInteger(issued) || issued < 0 || !Number.isSafeInteger(issued + 300))
          throw unavailable();
        const unsigned =
          part({ alg: "ES256", kid: config.keyId }) +
          "." +
          part({
            iss: config.teamId,
            iat: issued,
            exp: issued + 300,
            aud: audience,
            sub: config.clientId,
          });
        const signature = new Uint8Array(
          await crypto.subtle.sign(
            { name: "ECDSA", hash: "SHA-256" },
            privateKey,
            new TextEncoder().encode(unsigned),
          ),
        );
        signal.throwIfAborted();
        if (signature.length !== 64) throw unavailable();
        const response = await fetcher(endpoint, {
          method: "POST",
          redirect: "error",
          credentials: "omit",
          cache: "no-store",
          signal,
          headers: {
            "Content-Type": "application/x-www-form-urlencoded",
            "Cache-Control": "no-store",
          },
          body: new URLSearchParams({
            client_id: config.clientId,
            client_secret: unsigned + "." + base64url(signature),
            token: token.value,
            token_type_hint: token.kind,
          }).toString(),
        });
        signal.throwIfAborted();
        if (response.redirected || response.status !== 200) {
          await response.body?.cancel().catch(() => {});
          throw unavailable();
        }
        // Apple documents an empty 200, including repeated revocation. Never
        // accept a redirected/other 2xx response or an error hidden in a body.
        const reader = response.body?.getReader();
        if (reader) {
          const cancel = () => {
            void reader.cancel().catch(() => {});
          };
          signal.addEventListener("abort", cancel, { once: true });
          try {
            let finished = false;
            for (let chunks = 0; chunks < 4; chunks++) {
              const next = await reader.read();
              signal.throwIfAborted();
              if (next.done) {
                finished = true;
                break;
              }
              if (next.value.byteLength) throw unavailable();
            }
            if (!finished) throw unavailable();
          } finally {
            signal.removeEventListener("abort", cancel);
            await reader.cancel().catch(() => {});
            reader.releaseLock();
          }
        }
        signal.throwIfAborted();
      } catch {
        // Provider responses, tokens, keys and raw crypto errors are never logged or surfaced.
        throw unavailable();
      }
    },
  });
}
