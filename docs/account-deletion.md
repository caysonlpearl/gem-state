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
private website/app access through the session boundaries recorded below. The web deletion-request page uses the same route.

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

Shared server authentication verifies JWT claims, then checks the current Auth
identity, matching live session and deletion state in one indexed database RPC
before running domain handlers. Private native
reads and writes use the same pending-account check. Account deletion status and
owned device removal remain available for confirmation/sign-out. Shopping
collection, recommendations, advertising exports and shopping email/push delivery
recheck deletion state, including explicitly requested saved-search delivery.
Guest browsing and other accounts retain their previous behavior. No permission
check is cached between requests.

This is **not operational erasure yet**. Both migrations were installed and
verified on production on November 13 as recorded below; the worker remains disabled. The real inventory, provider,
media/record erasure, Auth removal and independent verification adapters remain
to be connected. No real account or media was deleted by the local SQL and worker
tests. The production session and database verification is recorded below;
physical-device and authenticated HTTP journeys remain required. This source work does not activate full
erasure.

Tests exercise actual migration SQL in isolated Postgres, queue replay/rollback,
legacy requests, lease expiry, stale workers, delayed retries, phase order,
missing adapters, retained targets after Auth deletion, final identity absence,
minimal receipts, permission withdrawal/account isolation, real website middleware
and private native dispatch. Phone and email eligibility tests cover pending
requests even when older consent or notifications still exist. Full release
regressions passed for this batch; later changes require their own release checks.

The real PostgreSQL concurrency gate also passes locally with two simultaneous
connections: a locked older job is skipped, simultaneous claims select distinct
jobs, and a reclaimed lease rejects the old worker's checkpoint and retry. The
cluster is temporary, uses an owner-only Unix socket with TCP disabled, and is
stopped and removed after the test. CI runs this gate explicitly; the ordinary
suite does not require a locally running database.

## Database and session boundary layer

The second migration adds a service-only session-state RPC and an authenticated
self-check for RLS. A still-signed token must match a live, unexpired session for
the same existing member; pending deletion, deleted identities, banned identities
and removed sessions cannot access private data. Public anonymous catalog access
and existing privileged server work retain their previous authorization.

Restrictive policies cover current RLS-enabled public tables and Storage objects
and buckets. Guards also wrap current authenticated-callable application
security-definer RPCs, preserving signatures, defaults, permissions, result types,
volatility and other attributes. The guard sits outside an original PL/pgSQL
exception handler so that handler cannot swallow a denied session. The original
function definition stays in a private rollback ledger, never in public output.

A new request checks boundary coverage before becoming visible and atomically
removes that member's Auth sessions after queuing and permission withdrawal.
Status and owned-device sign-out routes can still handle a pending request while
the Auth identity exists. This is session revocation and access blocking, not
identity/content/media deletion.

The production preflight found 164 authenticated-callable application
security-definer RPCs, all SQL or PL/pgSQL, and RLS enabled on Storage objects and
buckets. There were zero deletion requests and no deletion-job table at that
observation. Read-only metadata inspection does not prove the new migration is
installed.

The coverage RPC detects new/redefined member RPCs (including helper-name
overloads), missing or modified policies, disabled row security and helper grant
drift. Relevant later SQL migrations must call
`protect_account_access_boundaries()` and require zero coverage gaps before
release. Changes to already protected definitions/policies require review; do not
blindly bless a different policy. The erasure worker must require this preflight
before any destructive cleanup and independent final verification.

Isolated Postgres tests exercise member isolation, public anonymous access,
private REST/RPC/storage denial, missing/expired sessions, pending and removed
identities, preserved function defaults, original exception handlers, idempotent
protection and coverage drift. The real PostgreSQL gate also exercises function
wrapping, session removal and denial from a second live connection.

## Production installation — November 13, 2026

Both migrations were committed atomically on GemList at 20:31:55 UTC and independently
verified at 20:32:36 UTC. Stored migration source hashes matched the reviewed files.
Coverage reported zero unguarded functions, zero unguarded tables and zero helper
privilege gaps: 164 member-callable application functions and 176 restrictive
policies were registered. The four private job/control/rollback-ledger tables had
RLS enabled, no anonymous/member SELECT privilege, and service access.

An existing active identity/session passed both the service RPC and the self-check;
a nonexistent session returned unavailable. The two database checks together took
3.69 ms in this one observation, not an API latency percentile or load guarantee.
There were zero pending requests and zero jobs; the worker was disabled. No real
account, content, media or production notification was erased or created by these
verification checks. The database point observation was 292,662,419 bytes, 18
connections and zero other active queries. No provider refresh, schedule or paid
capacity was added.

The first installation attempt was rejected because the original wrapper treated a
terminal newline as a missing semicolon. A follow-up query verified complete rollback
with no new tables, functions, policies or migration-history rows. PR #214 corrected
whitespace trimming; the observed formatting failed in the new regression fixture
before the fix and passed after it. Original blocks with and without their optional terminal semicolon
are covered, including CR/LF/tab/space endings. A rollback-only
rehearsal then compiled all current production guards and asserted zero coverage
gaps before the successful installation. No compiler validation was disabled.

The final combined source tree `3091a3384d219c7ac57f767af3dbeb087a736402` passed
1,342 automated tests across the ordinary suite and the explicit real-PostgreSQL
gate, website types/build/four SSR suites, all nine mobile browser suites, and the
unsigned iPhone simulator build. The latter is compilation, not physical-device
or APNs proof. Database proofs, exact source hashes, rejected-attempt/rollback
records and release checks are under `output/account-deletion-20261113/`.

These installed safeguards still do not erase an account. Real inventory,
Apple/provider revocation, media/record cleanup, identity removal and independent
final verification adapters remain required before enabling the erasure worker.
The account batch uses API release marker `2026-11-13-deletion-queue`; publication
must be verified separately from database installation or a pending deploy request.

## Server queue connection — November 13, 2026

`account-deletion-queue.server.ts` connects the processor to the installed
service-only claim, checkpoint and retry RPCs. It accepts an explicitly supplied
privileged server client and has no startup side effects. Every RPC has a
15-second cancellation deadline. The adapter validates claimed targets, phases,
leases and response types; a stale lease stays unsuccessful rather than being
treated as a completed write. Provider/SQL failure details never enter stored
error codes. Phase adapters receive only an immutable job contract, excluding
arbitrary fields returned with a queue row.

The processor requires all six cleanup functions before starting any phase. It
checks the database's three access-boundary counters immediately before work and
again before saving progress, including during final verification. All counters
must be numeric zero with the expected response shape. Failed, cancelled,
missing or newly introduced coverage checks prevent progress. A cleanup adapter
must still independently bound and settle every operation, honor cancellation,
preserve replay-safe receipts and verify its own cleanup result; the queue does
not provide those domain implementations.

Tests connect the actual TypeScript adapter and processor to the actual migration
SQL in a disposable database under service-role permissions. They exercise the
disabled-worker default, retry delay, stale leases, every phase, refusal to finish
while an Auth identity exists, target-free completion receipts and another
member's preservation. A new member-callable function introduced during cleanup
prevents the checkpoint and blocks later work until coverage is repaired.
Malformed responses, private provider errors, missing future adapters, cancelled
checks and attempted target mutation also fail closed. Only synthetic identities
are removed in these local tests.

This batch adds no migration, scheduler, worker activation or production erasure.
The real cleanup adapters and independent final verifier remain outstanding.

## Private photo content erasure transport — November 13, 2026

`account-deletion-photo.server.ts` is a background-only R2 transport. It is not
connected to an account request route, a worker scheduler or the ordinary photo
client. Constructing it starts no work. Each target pins its configured store,
logical path, original/thumbnail variant, expected size and checksum. Scope is
copied before asynchronous calls. A required authorization callback must return
literal `true` before provider access, immediately before a replacement and
before reporting success; cancellation and every provider request are bounded.
Invalid scope, authorization loss, changed objects and ambiguous failures produce
only the existing `media_unavailable` code, without signed URLs or provider text.

The transport replaces the original bytes and metadata with a verified empty,
noncacheable object at the same canonical key. The replacement is conditional on
the inspected strong ETag; an absent object is fenced only after the planned
bucket is independently reachable, with a create-only condition. A race cannot
be resolved by an unconditional overwrite. Existing create-only upload tickets
cannot restore content while the empty fence remains. A lost response is
reconciled on the next attempt by reading that fence, without repeating a
successful replacement. This uses R2's documented atomic conditional PUT behavior:
https://developers.cloudflare.com/r2/api/s3/conditional-operations/.

A separate `verify` method performs fresh, authorized reads only. It never
repairs a missing fence, silently erases restored content or trusts a prior
successful call. Both methods require an actual zero-byte object, the expected
marker/type/cache policy and the absence of original custom metadata, encoding
and disposition. Ordinary photo upload/sign/read APIs gain no erasure method.

**This is content erasure, not object absence or completed account deletion.**
Empty markers retain opaque path/content hashes in object keys; do not call those
keys anonymous or claim that no record remains. An accurate retention policy and
marker lifecycle are required before activation. This port neither removes
Supabase originals, legacy copies, CDN/browser caches nor database photo receipts.
The eventual private inventory must include every copy and unfinished upload,
claim transfer or migration; provider-specific cleanup and independent final
checks remain required.

The callback is a mandatory interface, not an implemented ownership verifier.
Before binding it to production, a private database adapter must check the current
job/phase/lease, authoritative ownership, shared references, the pinned inventory
and durable writer suppression. Rechecking references alone is insufficient if
another writer can still attach or restore content after that check. A configured
import operator is not automatically the business owner. All six processor phase
adapters and independent verification must be connected before enabling work.

Synthetic provider tests cover original/thumbnail/evidence keys, immutable late
uploads, changed objects, conditional races, lost responses, retries, incorrect
buckets/permissions, strict authorization, cancellation, scrubbed metadata,
read-only verification and private-error suppression. These tests use an
in-memory provider; they do not establish live R2 behavior. No real object or
account was erased, no new migration was installed and the worker remains disabled.

## Live lease and operator control — November 14, 2026

`20261113130000_account_deletion_live_lease.sql` adds a service-only check that
matches the job, target account, phase and lease token against the database's
current processing row. The server's clock must show an unexpired lease and the
operator control must remain enabled. A client-supplied future expiry cannot
authorize a stale or reassigned job. The queue requires an actual boolean result;
missing RPCs, malformed responses, errors and cancellation cannot authorize work.

The processor requires this guard before starting a phase and again before
checkpointing it, including final verification after Auth removal. The SQL claim
and checkpoint functions also take a short shared lock on the enabled control
row. They wait for a pending operator disable transaction and refuse new claims
or checkpoints once that disable commits. These locks cover only database
operations, never an external provider request. Retry bookkeeping remains possible
without granting permission to perform cleanup.

This guard proves only current job authority and the operator setting. It does
not prove media ownership, inventory completeness, shared-reference safety or
writer suppression. It cannot cancel a provider operation already accepted before
the switch changed. Domain adapters must check authority around each bounded
operation and implement their own durable barriers. The photo transport is still
unbound; this read guard alone is not sufficient to authorize production erasure.

Disposable SQL/processor tests cover replaced targets and tokens, server-side
expiry, operator disable during work, final-verification suppression, private RPC
permissions and malformed/cancelled guards. The separate real PostgreSQL gate
uses independent connections to prove that claims and checkpoints wait for an
uncommitted disable and refuse progress after it commits.

This migration must precede use of the updated queue adapter. It enables no
worker and starts no scheduler or cleanup. The six real cleanup adapters and
independent verifier remain required. No real account or object was erased.

### Production installation — November 14, 2026

PR #224 passed 1,379 unique automated tests, the website and mobile browser
regressions and the unsigned iPhone build. Merged main `fe573f7` has the same tree
as the tested merge. Production preflight on GemList confirmed both previous
worker function bodies matched the reviewed baseline, all three access-boundary
counters were zero, processing was disabled and there were no requests or jobs.

The installation committed at 03:46:32 UTC. Its transaction required the disabled
control and unchanged baseline functions, checked the exact migration source
hash, installed the migration and journaled that original source atomically.
A separate read at 03:47:06 UTC confirmed the source and all three function-body
hashes, denied guest/member execution, allowed service execution and rejected an
unclaimed lease. Coverage remained zero, processing remained disabled and both
request/job counts remained zero. These are point observations, not proof of
operational cleanup or a completed deletion. Installation and release records
are under `output/account-deletion-live-lease-20261114/`.

## Member photo write barrier — November 14, 2026

`20261114040000_account_deletion_photo_writes.sql` prevents new durable member
photo writes after a deletion request, including service-role writes. Private
upload tickets, verification receipts, claim manifests and background migration
items check the active Auth account, request ledger and unfinished deletion job.
Budget reservations with an identified member receive the same check. A missing,
removed or banned member cannot register a new canonical member-prefixed photo.

Request/job inserts take an exclusive per-account transaction lock; photo writes
take its shared counterpart and check current state after waiting. A write that
commits first remains available to inventory. A later write waits for the request
and is refused after it commits. No lock spans provider HTTP. The real PostgreSQL
gate tests both orders with separate connections, along with operator-control and
job-lease races.

New logical paths in listing/evidence/catalog/request/order media and import
photo arrays also use this guard. Existing shared references can retain unrelated
edits, be removed or be replaced with an active account's path. A claim cannot
evade the barrier by changing its pending claimant. Failed migration bookkeeping
can settle an earlier lease; a new copy lease or receipt cannot revive it. All
new helper/trigger functions deny direct member, guest and service execution;
existing authorized table/RPC writes execute the checks through their triggers.

**This is a database write barrier, not complete media quiescence or ownership
proof.** Legacy paths without a canonical member UUID retain their existing
behavior and require explicit inventory/ownership review. The barrier does not
revoke signed upload URLs, stop an HTTP operation already accepted, fence Storage
versions or remove CDN/browser copies. Private inventory must preserve and cover
unfinished tickets/claims/migrations before removing row references. Retained
business/shared media needs its own ownership transition; a UUID prefix alone
does not authorize erasure. Avatar/logo URLs and conversation attachments still
need their own provider/retention handling. The R2 eraser remains unbound, the six
cleanup adapters remain outstanding and processing remains disabled.

Synthetic tests run the actual upload/receipt and current photo-runner migrations;
the surrounding media-reference and claim relations are disposable fixtures. No
production migration, account erasure or object change is performed by this
source batch.
