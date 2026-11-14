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

New logical paths in member listing/evidence media and import photo arrays use
the member-folder guard. Request, suggestion and order media use their explicit
author relationships, as corrected below. Existing member-folder references can
retain unrelated edits, be removed or be replaced with an active account's path. A claim cannot
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

### Reference scope correction — November 14, 2026

Schema/source review showed that a UUID folder alone is not an Auth ownership
contract across every media table. The original generic reference trigger was
too broad. `20261114050000_account_deletion_photo_reference_scope.sql` corrects it
before production installation: member listing/evidence keeps its existing
folder contract; sourcing-request photos check the buyer, suggestion photos check
the submitting member, and order evidence checks its actual uploader. Request
and suggestion author reads lock their parent while the write is checked.
Changing just the parent/uploader cannot escape a pending author's barrier.
Known member-prefixed references are checked as an additional restriction, not
as proof that every UUID namespace names an account.

Member writes require the normal `READ COMMITTED` transaction isolation. The
post-lock check refuses snapshot-retaining transaction levels instead of reading
an older permission state. Real PostgreSQL tests reject both `REPEATABLE READ`
and `SERIALIZABLE` writes and prove that a child reference waits for a concurrent
parent-author reassignment, then checks the committed author before inserting.

Catalog product/model guards are removed: catalog storage includes product
namespaces and public delivery paths, with separate product/business ownership.
Existing administrator and database authorization still applies. A pending
account must not acquire ownership of catalog media merely through a coincident
identifier. Product images, model files and model posters must all be included
in the eventual shared-media inventory and ownership plan before any erasure.

This correction does not authorize catalog or financial erasure.

Deploy the original write-barrier migration and this correction in one atomic
installation when neither is installed, journaling both exact sources. Neither
has been installed on production by this source batch. The tests now include
parent/uploader columns, legacy reference keys, parent-only retargeting and
catalog UUID/public-path namespaces, in addition to the actual upload/receipt and
photo-runner SQL. Real PostgreSQL still checks request/write ordering with two
connections. The cleanup worker remains disabled.

## Private media reference inventory — November 14, 2026

The next source batch adds a durable, service-only inventory of database media
references. `scan_account_deletion_media_inventory` reads one source page (50
entries by default, at most 100) and commits its observations and cursor together.
The target comes from the matching processing job, user, inventory phase and live
lease. The operator control is locked for the short transaction, access coverage
must be complete, and an expired lease at the final check rolls back the page.

The 28 sources include profile/business avatars, listing/evidence references,
authored catalog/models/posters, suggestions, requests, order evidence, sent
message attachments, resumes, identity-document references, sightings, dealer
inventory media, seller import arrays, upload tickets, claim old/new paths,
migration journals, private photo receipts and Storage metadata. Configuring a
dealer feed does not make its operator the business/media owner. Business and
financial associations remain labeled shared/unreviewed. Unknown legacy model,
suggestion or sighting buckets remain unresolved rather than being guessed.

Only allowlisted file metadata is persisted. Message bodies, applicant notes,
document bytes, financial credentials, arbitrary upload payload fields, provider
URLs and signed access tokens are excluded. Trusted URLs are normalized against
the owning GemList project and Bluebird catalog proxy; foreign URLs are recorded
as external without their contents. Literal object names are not URL-decoded.
Old observations remain after references disappear, receipts change, or a rescan
restarts its cursors. Rescans also find Storage metadata for previously observed
paths and include archived versions and delete markers without claiming that
Storage metadata is a provider erasure API.

`createAccountDeletionReferenceInventory` returns a bounded pass report, never a
deletion-phase `done` result. `passDone` means only that this database scan pass
reached its end. It does not prove a stable reference closure, physical provider
coverage, exclusive ownership, retention decisions or completed deletion. The
future full inventory adapter still needs rescans/reconciliation, configured
provider/version inventories, shared-reference authorization, late-writer/copy
handling and an explicit verification/purge path. Private inventory survives an
Auth cascade and prevents a job's minimal completion receipt while it remains.

This migration is not installed on production and activates no worker, provider
call, account erasure or scheduler. The earlier photo-barrier migrations remain
an independent deployment prerequisite. Synthetic SQL tests exercise every source,
pagination/rescans, physical-key history, privacy exclusions, pending upload and
copy metadata, access controls, lease rollback and premature completion. The real
two-connection PostgreSQL gate also checks concurrent page retry and operator
pause ordering. No production member, message, file or account is used as a test.

## Storage metadata write ordering — November 14, 2026

The existing session boundary already covers `storage.objects` and
`storage.buckets`. Its stable session predicate alone does not serialize an
authorized, uncommitted metadata write with a concurrent deletion request. A
two-connection PostgreSQL reproduction demonstrated a record becoming visible
only after the request committed, too late for an intervening inventory read.

The next additive migration strengthens only the authenticated INSERT/UPDATE
check on `storage.objects`. A volatile, account-derived writer helper takes the
same shared advisory lock as the member-photo pipeline, then rechecks the current
session. Request/job insertion takes the matching exclusive lock. An earlier
accepted metadata write must finish before the request, or a later write waits
and is rejected after the request commits. Retained repeatable-read/serializable
snapshots are rejected. No folder prefix is treated as proof of file ownership;
existing permissive bucket/folder rules and the restrictive read/delete session
predicate remain in force.

The boundary installer retains this stronger check when recreating a missing
Storage policy. Its existing policy fingerprint registry and worker coverage
contract detect policy drift without changing the worker API. Installation
requires a disabled worker, the prior member-photo write barrier, complete access
coverage, and the reviewed existing installer body hash; unexpected source changes
abort rather than being overwritten.

This is metadata ordering, not cancellation or proof of physical erasure for an
HTTP upload/copy already accepted by a provider. Provider reconciliation, signed
upload expiry/late-copy handling, retained versions and final media verification
remain required. The migration is not installed on production and enables no
worker or deletion. Synthetic tests cover active/other/pending/revoked accounts,
retained snapshots, denied guest access, policy drift/repair, installation refusal,
and both write/request orders in real PostgreSQL. No live file is a test fixture.

## Resumable Storage provider inventory — November 14, 2026

The next source batch connects the database reference scanner to the installed
Supabase SDK's version-aware Storage listing API. It requests an exact literal
object key, archived versions and delete markers, with no folder delimiter.
Targets combine historical resolved references and current owned/member-prefixed
Storage metadata. Those are discovery associations, never authority to erase a
shared or business file. Current metadata also fills gaps in historical snapshots.

Each step reads one bounded reference page and, once that pass ends, prepares at
most 50 new targets and fetches at most one provider page. The private target pins
the owning GemList origin/bucket fingerprint, generation, page and cursor. A live
job/lease/control/coverage check runs before and after the HTTP request; the page
commit locks and rechecks that context. It saves version observations, a replay
receipt and cursor progress atomically. Lost acknowledgements resume the next
page; identical retries cannot rewind it, conflicting retries and cursor cycles
are rejected, and reference rescans invalidate older in-flight targets. Private
scan/page records survive Auth deletion and must be purged before the final
minimal completion receipt, along with the other inventory records.

Before accepting an ending page, SQL compares its accumulated provider results
with every current Storage metadata version for that exact key. A provider which
omits a known archived version cannot silently finish. Such a mismatch requires
reference/provider reconciliation. Legacy unknown version/size/marker fields are
retained as unknown, without being treated as ownership or erasure proof.

The transport uses a private, nonpersistent SDK client, exact endpoint checks,
disabled redirects/caching, a 15-second deadline and a one-MiB response bound.
It validates a server-key configuration rather than accepting an anonymous/member
key; the provider still verifies the actual credential. It stores only object
IDs, literal keys, versions, sizes and archive/marker metadata. It drops arbitrary
metadata fields and returns coded errors without signed URLs or private content.
Literal object keys are passed unchanged in a JSON body, including percent signs
and URL-like filename characters; public URL normalization and upload validation
are not relaxed.

This is provider metadata discovery, not a check of underlying blob bytes,
orphan cleanup, cache purge or physical erasure. `step().passDone` covers only the
reference/Supabase inventory component and is deliberately not a deletion-phase
`done` result. R2 originals/thumbnails, stable reconciliation, shared ownership,
retention, actual provider removal and final verification remain open work.
The version-list API is experimental in the installed SDK; real-project behavior
must be verified before activation. The migration requires the existing Storage
boundary and a disabled worker. It is not installed on production and activates
no worker, provider request or real deletion by itself.

Tests use the real SDK with intercepted HTTP and actual synthetic SQL. They cover
archived versions/markers, response bounds/cancellation, private metadata
exclusion, wrong scopes, missing known versions, rescan/pause, lost acknowledgement,
conflicting replay, cycles and bounded preparation. Two real PostgreSQL connections
also serialize a concurrent provider-page replay into one durable receipt. No
production account, object or provider credential is used as a fixture.

## Resumable R2 hash-copy inventory — November 14, 2026

`createAccountDeletionMediaInventory` now sequences database-reference discovery,
Supabase version listing and private R2 discovery. Each step performs at most one
bounded provider page and returns a stage/pass result, never the worker's phase
`done` contract. It is not attached to the account-request route or a scheduler.

`account-deletion-r2-inventory.server.ts` uses signed, read-only `ListObjectsV2`
requests for `original/v1/<literal-path-sha256>/` and, for listing photos only,
`thumbnail/v1/<literal-path-sha256>/`. It discovers older content-hash keys even
when the current photo receipt only mentions the newest copy. Evidence remains
in its separate physical bucket. It never downloads photos or exports owner
names, signed URLs or arbitrary metadata. Store fingerprints match the existing
private erasure transport; neither a path prefix nor this inventory authorizes
erasure.

Claimed/transferred photos may reuse a physical key created under an older
logical path. Tasks therefore pin the physical path hash separately from the
logical reference and include canonical prefixes, receipt aliases and older
task prefixes. Each known verified key is reconciled by its matching physical
prefix task. Shared references stay intact; an alias is not an instruction to
erase the other member's copy. The eventual ownership/removal adapter must
resolve those shared keys explicitly before binding erasure.

The transport copies configuration/targets, checks live authority before and
after HTTP, uses no automatic retries, limits pages to 100 objects (default 50),
bounds streamed XML to 1 MiB and applies a 15-second deadline. It rejects DTDs,
entity declarations, malformed XML, wrong bucket/prefix echoes, count mismatches, unexpected
folders, invalid hashes/sizes/ETags and nonprogressing pages. Opaque continuation
tokens are encoded as query parameters and never interpreted as object paths.
The provider contract is documented by [Cloudflare's R2 S3 compatibility list](https://developers.cloudflare.com/r2/api/s3/api/)
and [Amazon's ListObjectsV2 reference](https://docs.aws.amazon.com/AmazonS3/latest/API/API_ListObjectsV2.html).

`20261114090000_account_deletion_r2_inventory.sql` adds service-read-only store
pins, tasks, immutable page receipts and per-scan object metadata. Only private
RPCs advance a current inventory job. They validate its lease/generation and
coverage, serialize concurrent checkpoints, reject changed replays/cursor cycles
and require increasing keys across pages. Ending pages must include known verified
photo-receipt keys; a mismatch rolls back the page for reconciliation. Pending
upload tickets do not by themselves assert that bytes exist. Rescans preserve
older observations. These records survive Auth deletion and must be explicitly
purged before the existing minimal completion receipt can be finalized.

Before activation, the database owner must independently verify the deployment's
R2 account and both physical bucket names, then pin the two non-secret fingerprints
in `account_deletion_r2_stores`. The fingerprint is SHA-256 of the UTF-8 string
`JSON.stringify(["photo-erasure-v1", accountId, physicalBucket])`. No credentials
belong in that table. It starts empty; member and worker roles cannot alter it,
and runtime configuration cannot silently select another store. A changed pin
requires explicit review/reconciliation of existing tasks rather than retargeting.

This source batch remains undeployed and processing remains disabled. A completed
list pass does not prove stable inventory closure, multipart/upload cancellation,
provider history coverage, ownership/shared-business decisions, cache removal,
retention compliance, object erasure or final verification. Those remain required
before the full deletion processor is operational. Tests use synthetic SQL and
intercepted signed HTTP; two real PostgreSQL connections also verify concurrent
R2 replay produces only one receipt/object observation. No live account, file or
provider credential was used.

## Bounded private shopping-data erasure — November 14, 2026

`20261114100000_account_deletion_shopping_erasure.sql` and the private
`createAccountDeletionShoppingErasure` adapter implement actual row removal for
`shopping_events`, `shopping_choices`, `shopping_favorites`,
`shopping_experiments`, `shopping_ad_outbox` and `shopping_privacy`.
They are not connected to a request route or scheduler, and the migration never
enables the deletion worker. This source batch remains undeployed.

Each call requires the matching records-phase job, user, unexpired lease, enabled
worker and complete access boundaries. It deletes at most 100 rows from one
reviewed table in a short transaction, locks the job against concurrent workers,
and returns only a source/count/pass receipt. Choice children precede their
privacy parent. Unknown incoming foreign-key relationships require review rather
than triggering an unbounded/unreviewed cascade. Lost acknowledgements resume
from remaining rows; no private content, member IDs or raw database errors are
returned in progress receipts. Contradictory subject/user ownership stops the
batch instead of erasing another member's rows.

Six insert/update guards prevent late member collection or export writes from
restoring the erased data. They reuse the request/job insertion lock and check
the live account/deletion state, including for service-role writes. Guest and
other-member activity remains independent. Existing status-only export
suppression and false/false privacy choices remain permitted so deletion-request
suppression still works. The guard/shared-writer function definitions and enabled
trigger definitions are checked against a private pinned contract before/after cleanup; missing,
disabled or changed guards refuse progress. Worker/member roles cannot change
that contract. Normal table permissions are not expanded.

A false/false privacy write holds an Auth key-share lock until commit. Auth
removal therefore waits for an earlier decline write, and a later write cannot
recreate privacy state after the identity has gone. A completed records pass
can still be followed by such an earlier-in-flight decline. The full identity
adapter **must call this component again after Auth removal**, using the identity
phase and current lease, before advancing to verification. The independent
verification RPC requires an absent identity and checks that all six sources
remain empty; it never repairs a failed result. `passDone` is only this component's
pass result, never permission to advance the whole records/identity phase.

This does not remove financial records, consent evidence, public authored
content, general analytics, conversations, native retry receipts, other account
tables, provider credentials, media or shared business assets. Their respective
cleanup/retention adapters and the complete processor still remain necessary.
Synthetic tests verify target-only removal, bounded choice cascades, preserved
financial fixtures, permission loss, changed guards, unknown relationships,
account isolation and late opt-outs. Real PostgreSQL connections verify
request/write ordering, operator pause, concurrent cleanup and identity/decline
ordering. No production account or member data was used or deleted.

## Durable photo-write planning preparation — November 14, 2026

`20261114110000_private_photo_write_intents.sql` prepares an immutable private
ledger for physical R2 writes. `plan_private_photo_writes` records up to three
bounded original/thumbnail descriptors for one literal logical path in a single
transaction. It checks live member-write authority and independently pinned store
fingerprints before returning success. Exact retries keep one intent; changed
byte counts, scopes, paths or unapproved destinations fail without a partial
batch. Reusing a previously recorded intent does not grant new permission after
an account becomes unavailable.

These are planned files, not verified receipts. Planning never signs an upload
URL, downloads/transfers bytes or makes an object visible. It preserves pending
hashes and sizes through Auth removal and lost acknowledgements. Ordinary
member/worker roles cannot mutate or delete the ledger directly. Literal filename
characters are retained without URL interpretation or normalization. The R2
factory now copies its configuration and adds a non-secret destination
fingerprint, consistent with the inventory/erasure transports, so caller changes
cannot silently retarget a planned operation.

The reviewed R2 candidate function is upgraded only if its previous source matches
the expected definition. Its discovery includes unattached member-prefix plans
and plans linked through private inventory references. It refuses a changed
physical store until reconciliation. A missing provider object is still a planned
write to handle, not a completed erasure. Known verified-receipt reconciliation
continues separately. A completion guard refuses remaining member-prefix/linked
intent evidence; this does not replace full legacy/shared ownership verification.

This is the schema-first preparation batch. Existing upload/copy paths have
**not yet been connected** to this ledger. The next runtime batch must require
planning before every R2 PUT and before returning native upload links, after the
schema and independently verified store pins have been installed. Deploying those
runtime hooks before their database prerequisites would reject uploads. Old
writers and already accepted operations must be drained/reconciled before the
complete deletion processor can be enabled. Recording a plan is not evidence
that all deployed writers use this protocol.

The ledger has no Auth cascade or automatic expiry. Its removal/anonymization
must be bound to verified media cleanup and shared-reference decisions before
the final receipt is allowed. No such cleanup RPC or scheduler is enabled by this
migration. The entire batch remains undeployed; real uploads, provider credentials,
production data and worker switches were not used/changed during tests. Tests
exercise real SQL, exact replay, rollback, missing stores, changed stores,
unavailable accounts, unfinished uploads, legacy references, Auth removal and
permissions. Real PostgreSQL additionally orders concurrent intents and deletion
requests using the existing account locks.
