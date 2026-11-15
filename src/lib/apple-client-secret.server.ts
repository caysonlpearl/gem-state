import { DeletionStepError } from "./account-deletion-worker.ts";

export type AppleClientConfig = Readonly<{
  teamId: string;
  keyId: string;
  clientId: string;
  privateKeyPem: string;
}>;
const unavailable = () => new DeletionStepError("authorization_unavailable");
function base64url(bytes: Uint8Array) {
  return btoa(Array.from(bytes, (b) => String.fromCharCode(b)).join(""))
    .replace(/=/g, "")
    .replace(/\+/g, "-")
    .replace(/\//g, "_");
}
function part(value: unknown) {
  return base64url(new TextEncoder().encode(JSON.stringify(value)));
}
/** Private Apple transport credential. Never return its secret from a route. */
export function createAppleClientSecretSigner(supplied: AppleClientConfig, clock = Date.now) {
  let config: AppleClientConfig;
  try {
    config = Object.freeze({
      teamId: supplied.teamId,
      keyId: supplied.keyId,
      clientId: supplied.clientId,
      privateKeyPem: supplied.privateKeyPem,
    });
    if (
      ![config.teamId, config.keyId, config.clientId, config.privateKeyPem].every(
        (v) => typeof v === "string",
      ) ||
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
  function signingKey() {
    key ??= (async () => {
      const pem = config.privateKeyPem.replace(
        /-----BEGIN PRIVATE KEY-----|-----END PRIVATE KEY-----|\s/g,
        "",
      );
      return crypto.subtle.importKey(
        "pkcs8",
        Uint8Array.from(atob(pem), (c) => c.charCodeAt(0)),
        { name: "ECDSA", namedCurve: "P-256" },
        false,
        ["sign"],
      );
    })();
    return key;
  }
  return Object.freeze({
    clientId: config.clientId,
    async secret(signal: AbortSignal): Promise<string> {
      try {
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
            aud: "https://appleid.apple.com",
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
        return unsigned + "." + base64url(signature);
      } catch {
        throw unavailable();
      }
    },
  });
}
