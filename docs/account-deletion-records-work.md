# Connecting application-record cleanup

`createAccountDeletionRecordsWork` binds the 15 existing application-row cleanup
adapters in a fixed sequence. Call its `step` only for a leased records-phase job.
It stops after one nonempty component batch, including the last batch of that
component, so each invocation changes at most 100 application records. Later
invocations revisit the sequence and operate on remaining rows; there is no
in-memory cursor that can disappear after a crash or omit an earlier component.

After a completely empty pass, it performs the existing bounded Auth dependency
inspection. Any remaining application foreign-key rows, unvalidated constraints
or unsupported schemas stop advancement. The original deletion request marker
must still have its single reviewed cascading relationship. Auth-managed session
and identity rows belong to the later identity phase. Counts and fingerprints
from this diagnostic never authorize removing Auth.

The profile and consent components retain their financial and audit barriers.
This sequence supplies no retention decision, erases no required financial party,
and does not skip an unhandled audit record. A successful step permits the durable
queue to move to the identity stage; it does not complete account deletion.

The separate `verify` checks all 15 components after Auth removal without repairing
residual data. It covers application records only. Whole-job verification must
also independently prove provider-byte cleanup, authorization revocation and
identity removal. The other phases, their complete binding and any necessary
post-identity cleanup remain required before production activation.

Queue operations and shopping erasure now explicitly disable SDK automatic
retries. A lost reply after a claim must not reserve a second account, and a lost
cleanup response must not silently execute several batches. The durable queue
owns retry scheduling. RPC errors remain fixed codes without private diagnostics.

Tests use the real Supabase SDK with SQL-backed disposable transports, never
production accounts or provider email. They exercise ordinary records, a lost
committed reply, a lost claim, financial and unknown-audit holds, pre/post-Auth
verification, and takeover of an expired lease on real PostgreSQL. The fixture's
explicit Auth removal tests application verification, not the unimplemented
production identity adapter.

This is source only. It adds no scheduler or member-facing endpoint, enables no
worker and performs no production deletion. It depends on the ledger-authorship
and preceding deletion batches. The full migration and source composition still
requires owning-project preflight and complete workflow rehearsal.
