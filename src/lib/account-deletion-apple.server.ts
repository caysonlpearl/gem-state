import { DeletionStepError } from "./account-deletion-worker.ts";
import {
  createAppleClientSecretSigner,
  type AppleClientConfig,
} from "./apple-client-secret.server.ts";
export type AppleRevocationConfig = AppleClientConfig;
export type AppleRevocationToken = Readonly<{
  clientId: string;
  kind: "refresh_token" | "access_token";
  value: string;
}>;
const unavailable = () => new DeletionStepError("authorization_unavailable");
const endpoint = "https://appleid.apple.com/auth/revoke";
/** Private transport only. Ownership and durable outcomes belong to the coordinator. */
export function createAppleTokenRevoker(
  supplied: AppleRevocationConfig,
  fetcher: typeof fetch = fetch,
  clock = Date.now,
) {
  const signer = createAppleClientSecretSigner(supplied, clock);
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
          token.clientId !== signer.clientId ||
          !["refresh_token", "access_token"].includes(token.kind) ||
          typeof token.value !== "string" ||
          !token.value.length ||
          token.value.length > 8192 ||
          Array.from(token.value).some((c) => c.charCodeAt(0) < 33 || c.charCodeAt(0) > 126)
        )
          throw unavailable();
        const signal = AbortSignal.any([callerSignal, AbortSignal.timeout(15000)]);
        signal.throwIfAborted();
        const secret = await signer.secret(signal);
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
            client_id: signer.clientId,
            client_secret: secret,
            token: token.value,
            token_type_hint: token.kind,
          }).toString(),
        });
        signal.throwIfAborted();
        if (response.redirected || response.status !== 200) {
          void response.body?.cancel().catch(() => {});
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
            void reader.cancel().catch(() => {});
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
