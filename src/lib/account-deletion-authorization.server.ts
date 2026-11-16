import { DeletionStepError, type DeletionJob } from "./account-deletion-worker.ts";
import type { PrivateRecordErasureDatabase } from "./account-deletion-private-records.server.ts";
import {
  createAppleTokenVaultCrypto,
  type AppleTokenEnvelope,
  type AppleVaultKeyring,
} from "./apple-token-vault-crypto.server.ts";
import {
  createAppleTokenRevoker,
  type AppleRevocationConfig,
} from "./account-deletion-apple.server.ts";

const uuid = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
const object = (v: unknown): v is Record<string, unknown> =>
  !!v && typeof v === "object" && !Array.isArray(v);
type Apple = { vault: AppleVaultKeyring; clients: readonly AppleRevocationConfig[] };

/** One provider credential per phase invocation. Configured tokens are never
 * downgraded to legacy/manual on a provider failure, unknown client or key loss.
 * No scheduler, Auth removal or whole-job completion is activated here. */
export function createAccountDeletionAuthorizationWork(
  db: PrivateRecordErasureDatabase,
  supplied?: Apple,
  fetcher: typeof fetch = fetch,
  clock = Date.now,
) {
  const vault = supplied ? createAppleTokenVaultCrypto(supplied.vault) : undefined;
  const clients = new Map<string, ReturnType<typeof createAppleTokenRevoker>>();
  if (supplied) {
    if (
      !Array.isArray(supplied.clients) ||
      supplied.clients.length < 1 ||
      supplied.clients.length > 8
    )
      throw new DeletionStepError("authorization_unavailable");
    for (const config of supplied.clients) {
      const revoke = createAppleTokenRevoker(config, fetcher, clock);
      if (clients.has(config.clientId)) throw new DeletionStepError("authorization_unavailable");
      clients.set(config.clientId, revoke);
    }
  }
  function scope(supplied: DeletionJob, phase: "authorization" | "identity" | "verification") {
    const job = Object.freeze({ ...supplied });
    if (
      job.phase !== phase ||
      ![job.id, job.user_id, job.lease_token].every((v) => typeof v === "string" && uuid.test(v))
    )
      throw Error();
    return job;
  }
  async function call(
    name: string,
    job: DeletionJob,
    signal: AbortSignal,
    extra: Record<string, unknown> = {},
  ) {
    signal.throwIfAborted();
    const r = await db
      .rpc(name, { _id: job.id, _user: job.user_id, _lease: job.lease_token, ...extra })
      .abortSignal(signal)
      .retry(false);
    signal.throwIfAborted();
    if (!r || r.error !== null || r.data === undefined) throw Error();
    return r.data;
  }
  return Object.freeze({
    async step(suppliedJob: DeletionJob, caller: AbortSignal): Promise<{ done: boolean }> {
      try {
        const job = scope(suppliedJob, "authorization"),
          signal = AbortSignal.any([caller, AbortSignal.timeout(40000)]);
        const prepared = await call("prepare_account_deletion_authorization", job, signal);
        if (
          !object(prepared) ||
          Object.keys(prepared).length !== 2 ||
          typeof prepared.done !== "boolean"
        )
          throw Error();
        if (prepared.done) {
          if (prepared.credential !== null) throw Error();
          return { done: true };
        }
        const credential = prepared.credential;
        if (
          !object(credential) ||
          Object.keys(credential).length !== 2 ||
          typeof credential.id !== "string" ||
          !uuid.test(credential.id) ||
          !object(credential.envelope) ||
          credential.envelope.userId !== job.user_id ||
          !vault
        )
          throw Error();
        const envelope = Object.freeze({ ...credential.envelope }) as AppleTokenEnvelope;
        const proof = await vault.open(envelope, signal);
        const revoke = clients.get(proof.clientId);
        if (!revoke) throw Error();
        const args = { _credential: credential.id, _envelope: envelope };
        if ((await call("check_account_deletion_apple_authorization", job, signal, args)) !== true)
          throw Error();
        await revoke.revoke(
          { clientId: proof.clientId, kind: "refresh_token", value: proof.refreshToken },
          signal,
        );
        signal.throwIfAborted();
        if (
          (await call("acknowledge_account_deletion_apple_authorization", job, signal, args)) !==
          true
        )
          throw Error();
        return { done: false };
      } catch {
        throw new DeletionStepError("authorization_unavailable");
      }
    },
    async finalize(
      suppliedJob: DeletionJob,
      caller: AbortSignal,
    ): Promise<{ done: boolean; changed: number }> {
      try {
        const job = scope(suppliedJob, "identity"),
          signal = AbortSignal.any([caller, AbortSignal.timeout(15000)]);
        const r = await call("finalize_account_deletion_authorizations", job, signal);
        if (
          !object(r) ||
          Object.keys(r).length !== 2 ||
          typeof r.done !== "boolean" ||
          !Number.isSafeInteger(r.changed) ||
          (r.changed as number) < 0 ||
          (r.changed as number) > 100
        )
          throw Error();
        return { done: r.done, changed: r.changed as number };
      } catch {
        throw new DeletionStepError("identity_unavailable");
      }
    },
    async verify(suppliedJob: DeletionJob, caller: AbortSignal): Promise<true> {
      try {
        const job = scope(suppliedJob, "verification"),
          signal = AbortSignal.any([caller, AbortSignal.timeout(15000)]);
        if ((await call("verify_account_deletion_authorizations", job, signal)) !== true)
          throw Error();
        return true;
      } catch {
        throw new DeletionStepError("verification_failed");
      }
    },
  });
}
