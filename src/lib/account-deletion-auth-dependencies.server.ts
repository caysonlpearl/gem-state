import { DeletionStepError, type DeletionJob } from "./account-deletion-worker.ts";

type Database = {
  rpc(
    name: string,
    args: Record<string, unknown>,
  ): {
    abortSignal(signal: AbortSignal): {
      retry(enabled: boolean): PromiseLike<{ data: unknown; error: unknown }>;
    };
  };
};
export type AuthDependency = Readonly<{
  schema: string;
  table: string;
  constraint: string;
  column: string;
  onDelete: "no_action" | "restrict" | "cascade" | "set_null" | "set_default";
  validated: boolean;
  deferrable: boolean;
  initiallyDeferred: boolean;
  rowsAtLeast: number;
  capped: boolean;
}>;
const uuid = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
const object = (v: unknown): v is Record<string, unknown> =>
  v !== null && typeof v === "object" && !Array.isArray(v);
const identifier = (v: unknown): v is string =>
  typeof v === "string" &&
  v.length > 0 &&
  new TextEncoder().encode(v).length <= 63 &&
  !v.includes("\0");
const fields = [
  "schema",
  "table",
  "constraint",
  "column",
  "on_delete",
  "validated",
  "deferrable",
  "initially_deferred",
  "rows_at_least",
  "capped",
];
const actions = ["no_action", "restrict", "cascade", "set_null", "set_default"];
const failed = () => new DeletionStepError("records_unavailable");

/** Pre-identity diagnostics only. Direct Auth foreign keys are not all account
 * data, retention decisions, erasure proof or permission to remove Auth. Never
 * use a zero/capped count or a previous fingerprint as deletion authorization. */
export function createAccountDeletionAuthDependencyInspection(db: Database) {
  return Object.freeze({
    async inspect(supplied: DeletionJob, caller: AbortSignal, limit = 100) {
      try {
        const job = Object.freeze({
          id: supplied.id,
          user_id: supplied.user_id,
          lease_token: supplied.lease_token,
          phase: supplied.phase,
        });
        if (
          ![job.id, job.user_id, job.lease_token].every(
            (id) => typeof id === "string" && uuid.test(id),
          ) ||
          !["records", "identity"].includes(job.phase) ||
          !Number.isSafeInteger(limit) ||
          limit < 1 ||
          limit > 100
        )
          throw failed();
        const signal = AbortSignal.any([caller, AbortSignal.timeout(10000)]);
        signal.throwIfAborted();
        const result = await db
          .rpc("inspect_account_deletion_auth_dependencies", {
            _id: job.id,
            _user: job.user_id,
            _lease: job.lease_token,
            _limit: limit,
          })
          .abortSignal(signal)
          .retry(false);
        signal.throwIfAborted();
        const value = result?.data;
        if (
          !result ||
          result.error !== null ||
          !object(value) ||
          Object.keys(value).length !== 3 ||
          value["scope"] !== "direct_auth_foreign_keys" ||
          typeof value["schema_fingerprint"] !== "string" ||
          !/^[a-f0-9]{32}$/.test(value["schema_fingerprint"]) ||
          !Array.isArray(value["relationships"]) ||
          value["relationships"].length > 256
        )
          throw failed();
        const seen = new Set<string>();
        const relationships = value["relationships"].map((r: unknown): AuthDependency => {
          if (
            !object(r) ||
            Object.keys(r).length !== fields.length ||
            !fields.every((k) => Object.hasOwn(r, k)) ||
            ![r["schema"], r["table"], r["constraint"], r["column"]].every(identifier) ||
            !actions.includes(r["on_delete"] as string) ||
            ![r["validated"], r["deferrable"], r["initially_deferred"], r["capped"]].every(
              (v) => typeof v === "boolean",
            ) ||
            (r["initially_deferred"] && !r["deferrable"]) ||
            !Number.isSafeInteger(r["rows_at_least"]) ||
            (r["rows_at_least"] as number) < 0 ||
            (r["rows_at_least"] as number) > limit + 1 ||
            r["capped"] !== (r["rows_at_least"] as number) > limit
          )
            throw failed();
          const key = JSON.stringify([r["schema"], r["table"], r["constraint"]]);
          if (seen.has(key)) throw failed();
          seen.add(key);
          return Object.freeze({
            schema: r["schema"] as string,
            table: r["table"] as string,
            constraint: r["constraint"] as string,
            column: r["column"] as string,
            onDelete: r["on_delete"] as AuthDependency["onDelete"],
            validated: r["validated"] as boolean,
            deferrable: r["deferrable"] as boolean,
            initiallyDeferred: r["initially_deferred"] as boolean,
            rowsAtLeast: r["rows_at_least"] as number,
            capped: r["capped"] as boolean,
          });
        });
        return Object.freeze({
          scope: "direct_auth_foreign_keys" as const,
          schemaFingerprint: value["schema_fingerprint"],
          relationships: Object.freeze(relationships),
        });
      } catch {
        // No provider diagnostics, member identifiers or row content escape.
        throw failed();
      }
    },
  });
}
