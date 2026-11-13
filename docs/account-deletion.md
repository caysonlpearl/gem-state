# Account deletion implementation ledger

The approved launch requires operational deletion/anonymization, including auth,
public user content, private history, device tokens and personal media, with
explained retention exceptions. Receiving a request is not completion.

## Authoritative preflight — November 12, 2026

The owning Supabase project is GemList (udxxfuticbxwiehoepeg). A read-only
query against pg_constraint verified actual foreign keys. No member data was
read or deleted. Database size at that observation was 246,074,515 bytes and
there were 25 pg_stat_activity connections; these are observations, not a
capacity/latency guarantee.

Important relationships for the processor:

- Auth sessions, identities and most account settings cascade from auth.users.
- Orders.buyer_id also cascades; hard-deleting auth first would erase orders.
- Products.created_by is SET NULL, leaving public text/images unless explicitly
  removed/anonymized.
- Seller_profiles and notifications are not in that auth-FK list and need
  explicit account-scoped cleanup.
- Shopping_privacy/favorites/experiments use text subjects and need explicit
  account-subject cleanup.
- Some audit/claim/financial relationships restrict auth deletion, including
  sourcing assignments/tips/checkouts, managed-seller claims, photo migration
  authorship, dealer feed authorization and report-event actors.
- Cloud/object storage must be inventoried before removing row references.
  Supabase Auth refuses deletion while the account owns storage objects.
  R2 originals/thumbnails are keyed through private photo receipts, not merely
  by an account-prefix listing.

## Current behavior and remaining work

The mobile request route verifies bearer ownership and the DELETE confirmation,
stores an idempotent request, removes phone tokens, disables mobile advertising,
withdraws shopping alerts, suppresses queued shopping delivery and blocks further
mobile writes. The web deletion-request page uses the same route.

Next processor work must:

1. Claim a durable request with a lease and retries; preserve a minimal completion
   receipt after auth removal, without retaining a plaintext email in worker logs.
2. Immediately revoke sessions/access and optional first-party/advertising work;
   exclude deletion-pending members from web and native optional delivery.
3. Build a per-account deletion/media plan before erasing references; preserve
   required financial/dispute/security records under explicit retention categories.
4. Remove personal profiles, original authored public content, private history,
   saves/settings, uploads, native registrations and private mobile message-retry receipts. Clear or anonymize linked
   analytics and audit data without changing other members' content or falsely
   preserving access.
5. Revoke Apple authorization when linked, then remove auth identity. For records
   that must remain, irreversibly anonymize identity rather than labeling reversible
   deactivation as deletion.
6. Verify all cleanup steps and only then mark completion. A failed provider/media
   cleanup must remain pending/retrying, never completed.
7. Exercise ordinary, dealer, claimed-seller, multiple-device and retained-dispute
   cases with synthetic data; verify a deleted account cannot refresh/sign in and
   that public personal content/media is gone.

These steps have not yet been completed. Do not submit the app or present a
pending request as a completed deletion.

The owner deferred finishing paid developer enrollment on November 13 so app
implementation can continue first. Deletion processing, synthetic account/media
cleanup tests and shared website/app enforcement can proceed before enrollment.
Apple authorization revocation must have a tested provider adapter and must fail
closed for linked accounts until its required credentials are configured. Do not
delete real accounts to prove the processor or silently skip a failed cleanup.

Sources: Supabase's deleteUser and user-data-management documentation, checked
during this preflight. Soft deletion is irreversible in Supabase Auth, but auth
deletion alone does not remove all application personal data.

- https://supabase.com/docs/reference/javascript/auth-admin-deleteuser
- https://supabase.com/docs/guides/auth/managing-user-data

## November 13 implementation batch — queue and server access

A fresh read-only inspection of GemList verified 170 public tables, 1,816 public
columns and 245 foreign keys. This was schema metadata only, with no member
records read or deleted. Financial cascades, shared conversations, managed
sellers and both storage providers still require explicit cleanup plans.

The source now contains a private durable job queue and a six-phase orchestrator:
inventory, authorization revocation, media, records, identity and verification.
A request creates one job, withdraws first-party shopping and both web/native
advertising permissions, suppresses queued shopping delivery and removes native
registrations in the same transaction. Withdrawal records keep their source and
policy version. Existing requests are backfilled and suppressed when the
migration is applied. Repeated requests do not reset progress.

Workers claim one phase with a five-minute lease. Checkpoints and retries require
the current lease and phase; expired workers cannot overwrite a newer claim.
Successful bounded chunks can continue the same phase. Failures retain the target
and use coded errors and exponential retry delays without private provider text.
A job survives an Auth cascade/crash. Completion independently refuses a remaining
Auth identity and removes the target UUID from the minimal completion receipt.

Shared server authentication checks the current Auth identity as well as JWT
claims and rejects pending deletion before running domain handlers. Private native
reads and writes use the same pending-account check. Account deletion status and
owned device removal remain available for confirmation/sign-out. Shopping
collection, recommendations, advertising exports and shopping email/push delivery
recheck deletion state, including explicitly requested saved-search delivery.
Guest browsing and other accounts retain their previous behavior. No permission
check is cached between requests.

This is **not operational erasure yet**. The migration is not applied by editing
source, and the worker defaults to disabled. The real inventory, provider,
media/record erasure, Auth removal and independent verification adapters remain
to be connected. No real account or media was deleted by the local SQL and worker
tests. Session revocation and database-level protection for direct RPC/storage
access still require implementation before activating full deletion. These server
route checks do not prove those database/session boundaries.

Tests exercise actual migration SQL in isolated Postgres, queue replay/rollback,
legacy requests, lease expiry, stale workers, delayed retries, phase order,
missing adapters, retained targets after Auth deletion, final identity absence,
minimal receipts, permission withdrawal/account isolation, real website middleware
and private native dispatch. Phone and email eligibility tests cover pending
requests even when older consent or notifications still exist. Full release
regressions remain required before merge.

The real PostgreSQL concurrency gate also passes locally with two simultaneous
connections: a locked older job is skipped, simultaneous claims select distinct
jobs, and a reclaimed lease rejects the old worker's checkpoint and retry. The
cluster is temporary, uses an owner-only Unix socket with TCP disabled, and is
stopped and removed after the test. CI runs this gate explicitly; the ordinary
suite does not require a locally running database.
