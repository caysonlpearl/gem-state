import { DeletionStepError, type DeletionJob } from "./account-deletion-worker.ts";
import type { PrivateRecordErasureDatabase } from "./account-deletion-private-records.server.ts";
import { createAccountDeletionShoppingErasure } from "./account-deletion-shopping.server.ts";
import { createAccountDeletionConversationErasure } from "./account-deletion-conversations.server.ts";
import { createAccountDeletionInquiryErasure } from "./account-deletion-inquiries.server.ts";
import { createAccountDeletionApplicationErasure } from "./account-deletion-applications.server.ts";
import { createAccountDeletionListingErasure } from "./account-deletion-listings.server.ts";
import { createAccountDeletionSourcingErasure } from "./account-deletion-sourcing.server.ts";
import { createAccountDeletionSubmissionErasure } from "./account-deletion-submissions.server.ts";
import { createAccountDeletionSightingErasure } from "./account-deletion-sightings.server.ts";
import { createAccountDeletionBusinessClaimErasure } from "./account-deletion-business-claims.server.ts";
import { createAccountDeletionCatalogErasure } from "./account-deletion-catalog.server.ts";
import { createAccountDeletionActivityErasure } from "./account-deletion-activity.server.ts";
import { createAccountDeletionLedgerActorErasure } from "./account-deletion-ledger-actors.server.ts";
import { createAccountDeletionPrivateRecordErasure } from "./account-deletion-private-records.server.ts";
import { createAccountDeletionProfileErasure } from "./account-deletion-profiles.server.ts";
import { createAccountDeletionConsentErasure } from "./account-deletion-consents.server.ts";
import { createAccountDeletionAuthDependencyInspection } from "./account-deletion-auth-dependencies.server.ts";

type Database = PrivateRecordErasureDatabase;
const uuid = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;

/** Fixed application-row sequence, not a configurable list that can omit a
 * required component. Provider bytes, authorization, financial retention and
 * identity still have their own mandatory work. This never removes Auth or
 * enables a worker. A dependency inspection is not deletion authorization. */
export function createAccountDeletionRecordsWork(db: Database) {
  const components = [
    createAccountDeletionShoppingErasure(db),
    createAccountDeletionConversationErasure(db),
    createAccountDeletionInquiryErasure(db),
    createAccountDeletionApplicationErasure(db),
    createAccountDeletionListingErasure(db),
    createAccountDeletionSourcingErasure(db),
    createAccountDeletionSubmissionErasure(db),
    createAccountDeletionSightingErasure(db),
    createAccountDeletionBusinessClaimErasure(db),
    createAccountDeletionCatalogErasure(db),
    createAccountDeletionActivityErasure(db),
    createAccountDeletionLedgerActorErasure(db),
    createAccountDeletionPrivateRecordErasure(db),
    createAccountDeletionProfileErasure(db),
    createAccountDeletionConsentErasure(db),
  ];
  const dependencies = createAccountDeletionAuthDependencyInspection(db);
  function scope(supplied: DeletionJob, phase: "records" | "verification") {
    const job = Object.freeze({
      id: supplied.id,
      user_id: supplied.user_id,
      lease_token: supplied.lease_token,
      phase: supplied.phase,
      lease_until: supplied.lease_until,
    });
    if (
      job.phase !== phase ||
      ![job.id, job.user_id, job.lease_token].every((v) => typeof v === "string" && uuid.test(v))
    )
      throw Error();
    return job;
  }
  return Object.freeze({
    async step(supplied: DeletionJob, caller: AbortSignal): Promise<{ done: boolean }> {
      try {
        const job = scope(supplied, "records");
        const signal = AbortSignal.any([caller, AbortSignal.timeout(40000)]);
        signal.throwIfAborted();
        for (const component of components) {
          const progress = await component.step(job, signal);
          signal.throwIfAborted();
          const changed = "deleted" in progress ? progress.deleted : progress.changed;
          // One nonempty chunk per invocation, even when that component just
          // finished. Revisit from the start after lease renewal or lost replies.
          if (changed > 0) return { done: false };
          if (progress.passDone !== true) throw Error();
        }
        const report = await dependencies.inspect(job, signal);
        signal.throwIfAborted();
        let requestMarkers = 0;
        for (const reference of report.relationships) {
          // Auth-managed sessions/identities belong to the later identity work.
          if (reference.schema === "auth") continue;
          if (reference.schema !== "public" || !reference.validated) throw Error();
          // Keep the original request marker until Auth removal. Never erase
          // the marker to manufacture an empty inspection or restore access.
          if (
            reference.table === "mobile_account_deletions" &&
            reference.column === "user_id" &&
            reference.constraint === "mobile_account_deletions_user_id_fkey" &&
            reference.onDelete === "cascade" &&
            !reference.deferrable &&
            !reference.initiallyDeferred &&
            reference.rowsAtLeast === 1 &&
            !reference.capped
          ) {
            requestMarkers++;
            continue;
          }
          if (reference.rowsAtLeast !== 0 || reference.capped) throw Error();
        }
        if (requestMarkers !== 1) throw Error();
        return { done: true };
      } catch {
        throw new DeletionStepError("records_unavailable");
      }
    },
    /** Application-row verification only. Whole-job verification must also
     * independently prove provider cleanup, revocation and identity removal. */
    async verify(supplied: DeletionJob, caller: AbortSignal): Promise<true> {
      try {
        const job = scope(supplied, "verification");
        const signal = AbortSignal.any([caller, AbortSignal.timeout(40000)]);
        signal.throwIfAborted();
        for (const component of components) {
          if ((await component.verify(job, signal)) !== true) throw Error();
          signal.throwIfAborted();
        }
        return true;
      } catch {
        throw new DeletionStepError("verification_failed");
      }
    },
  });
}
