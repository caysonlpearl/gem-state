# Photo storage migration preflight

Current status (November 2, Boise time): the approved 6,380 photo pairs finished
copying and verification. Both production modes are now `r2`: verified reads
and new uploads use the private R2 stores. The copy permit is disabled. The
owner approved this serving/upload cutover after the copy; permanent deletion
remains a separate action and has not occurred. Supabase stays Free.

The retained-source fallback cutoff is **November 4, 2026, 03:56 UTC**, or
**November 3 at 8:56 PM Boise time**. Keep source originals through that time.
Fallback signatures are clipped to the cutoff; verified R2 reads continue
normally. A rollback to source reads or renewal of source signing requires a
new retention review. Do not restart either completed copy run.

Evidence is in the private operational directory
`research/seo/2026-11-01/`, outside this checkout. The completed-copy
reconciliation records 12,760 unchanged approved source objects and matching
receipts, with zero completed-source or receipt mismatches. The subsequent
rollout tests added six mirrored QA source objects; the final R2-only upload
added no Supabase duplicates. That checkpoint recorded 12,766 retained source
objects and 12,768 receipts because the final R2-only pair had no source
counterpart. No sources were deleted. Later R2-only QA can add receipts without
adding Supabase objects. These counts are dated observations, not a deletion
manifest.

Live checks cover native small/large uploads, ordinary server-import staging,
private cancellation/discard, original galleries and 400 R2-backed native
homepage cards. The automatic large server-import handoff also passed through
the normal administrator form on November 2, Boise time. A displayed public
source photo measured 3024 by 4032 pixels (12.2 MP); both private R2 originals
matched its 1,747,398 bytes and SHA-256, and the listing receipt included a
101,177-byte JPEG preview. No Supabase copy, managed seller account or public
listing was created. The private test draft was subsequently discarded.
The earlier signed-source attempt failed and staged nothing; it does not
invalidate the later successful displayed-photo test. Evidence is recorded in
`r2-displayed-large-photo-source.json`, `r2-automatic-large-import-live.json`
and `r2-automatic-large-import-cleaned.json` in the operational directory.

The owner subsequently approved the exact private seller-claim test. One claim
completed for the separate synthetic draft, restricted to its existing verified
owner. The production function transferred both unpublished staged-photo paths
into the owner namespace. Both receipts retain the original byte sizes,
SHA-256 values, immutable R2 keys and listing-preview metadata; the claimed
photo loaded in normal private review. The token was consumed and the single
two-asset transfer completed. The draft was then discarded, with no public
listing or new account. Both retained Supabase originals remain present and no
new Supabase copies were created. This verifies the scoped existing-owner
private claim, not every claimant or authentication scenario. Evidence:
`r2-private-claim-completed-live.json`, `r2-private-claim-photo-comparison.json`,
`r2-private-claim-cleaned-live.json` and `r2-private-claim-completed-ui.png`.

After the retention cutoff, capture fresh source metadata, reconcile receipts
and current references, exclude new, changed, unverified or incomplete uploads,
and prepare the exact deletion manifest. Obtain action-time approval before
permanently deleting any source object through the Storage API. Removing files
does not erase already-consumed monthly usage; the owner declined both the
paid upgrade and the proposed support request. Do not reopen either request.

## Read-only source cleanup review

Preparation can continue before the retention cutoff. The local review tool
contains no network, credentials, storage writes or deletion operation. A
preliminary review never substitutes for the fresh post-retention snapshot or
the owner's approval of an exact removal list.

1. In the verified GemList SQL Editor, run
   `scripts/sql/photo-source-cleanup-snapshot.sql`. This is one read-only MVCC
   statement covering both source buckets, the two approved migration runs,
   receipts, native media references, both import-photo arrays, unfinished
   claim journals, unverified upload tickets and incomplete migration items.
2. Export its one `snapshot` cell to a private local JSON file. For large
   results, use **Export → Download CSV**, parse the single CSV row's `snapshot`
   JSON, and validate the project and row count. An accessibility view can
   exceed its size limit; do not rerun a completed query because observation
   or the browser's download-event observer timed out. Check the actual new
   download's timestamp and content instead.
3. Generate a new review file; the CLI refuses to overwrite an earlier review:

```sh
node scripts/storage-source-cleanup-review.mjs \
  --snapshot /private/path/cleanup-snapshot.json \
  --project udxxfuticbxwiehoepeg \
  --runs dd2be1fa-2c6d-4fad-b861-f25b3907b1f5,20a1e9c0-5bef-43c7-a172-64bf8c62cddc \
  --not-before 2026-11-04T03:56:00.000Z \
  --output /private/path/new-cleanup-review.json
```

The review binds source sizes, ETags, modification timestamps (including
PostgreSQL microseconds), image types, migration scope and receipt identity.
It excludes changed/unapproved sources, incomplete operations, missing or
conflicting receipts, and listing photos without a verified preview. Existing
native/import references are reported and retained: removing a Supabase copy
must never remove its application media row or its R2 receipt/object.

`reviewReady` additionally requires a fresh snapshot captured after retention,
fresh server-observed R2 read/upload modes with copying disabled, and fresh
matching R2 original/preview HEAD checks bound to the exact receipt keys,
sizes and SHA-256 metadata. Those checks are absent from the SQL snapshot by
design. They must come from actual server probes, never be typed as successful
by hand. A metadata match alone cannot establish that a target still exists.
The tool always returns `deletionAuthorized: false`, including when every
review gate passes. Recheck each candidate immediately before a separately
approved Storage API removal; skip anything that changed.

The administrator's storage-only page, `/admin/fb-import?storage=check`, has
**Read-only cleanup verification** for collecting those server observations.
Choose the private snapshot JSON, then select **Verify R2 copies**. The file
is parsed locally; each server request receives only up to 16 bucket/path
pairs. The authenticated administrator handler binds the source project,
reads current receipts and compares original/preview R2 HEAD responses using
eight concurrent workers. It returns no signed URLs or credentials and sets
`Cache-Control: private, no-store`. There are no source-body GETs, uploads,
copies, deletions or marketplace provider calls. Sixteen rows keep each
request below the worker's subrequest limit, including auth and database reads.

**Stop after this batch** lets the current read-only batch settle before
stopping. A mismatch, missing receipt or transport failure stops further
batches and retains completed checks. **Download checked snapshot** preserves
the original snapshot plus actual checks/runtime controls for the local CLI;
partial output cannot turn unchecked copies into verified ones. A new run
starts fresh. Preparation before retention still cannot produce a final
review-ready manifest: capture and check fresh evidence after the cutoff.

The first preliminary live snapshot at 07:09 UTC November 3 contained 12,766
source objects. The tool identified 12,760 metadata candidates totaling
2,618,335,540 bytes and excluded six newer QA source objects outside the
approved migration. It remained not review-ready: retention had not elapsed,
the snapshot preceded the cutoff, and fresh runtime/R2 object checks were not
supplied. No source photo bodies were downloaded and no objects were deleted.
Private evidence: `r2-cleanup-snapshot-20261103.json` and
`r2-cleanup-preliminary-review-20261103.json`.

### Live read-only rehearsal — November 3, 2026

PR103 merged as `af26ee743ea21fdad7a323bb8420da955393e665` after CI passed,
and the private checker was published in deployment
`c094c949-d2c0-4422-850c-468ed3a9e19e`. The normal authenticated admin UI
completed all 12,760 approved original checks and 6,380 listing-preview checks.
Every R2 HEAD response matched the expected length and SHA-256 metadata;
there were zero mismatches. The observations span 08:16:46–08:25:07 UTC
(8 minutes 21 seconds), within the review tool's 15-minute target-check window.
Runtime observations confirmed R2 reads/uploads, copying disabled and the
unchanged source-fallback cutoff. No source bodies were downloaded, copied or
deleted. Both completed copy runs remain stopped.

The checked snapshot was actually downloaded, parsed and reconciled, despite
the browser download-event observer timing out; the download was not repeated.
Evidence: `r2-cleanup-head-verification-live.json`, its screenshot,
`r2-cleanup-checked-snapshot-20261103.json` and
`r2-cleanup-checked-preliminary-review-20261103.json` in the private evidence
directory. Do not commit those private path/receipt exports.

This proves the bounded verification workflow and current matching copies.
It is not a final deletion review: the source snapshot predates retention and
is now stale, and pre-cutoff checks cannot satisfy post-retention requirements.
Capture a fresh snapshot and fresh target/control checks after the cutoff;
then obtain approval for that exact manifest. Do not change timestamps or
relax freshness rules to reuse this rehearsal as removal authorization.

An anonymous HTTP probe was rejected at Cloudflare with error1010. That is
not proof of application authentication behavior; the handler's non-admin
rejection before privileged access is covered by contract tests. No browser
security block was bypassed to manufacture a live middleware result.

The evidence files `r2-delivery-rollout-live.json`, `r2-retention-live.json`,
`r2-source-reconciliation-after-rollout-tests.json` and
`r2-stable-thumbnail-release.json` record the cutover and later cache checks.
Earlier preparation observations below retain their original scope and date;
their unset flags, active-copy instructions and pending permissions are
historical, not current operating instructions.

## Capture the inventory without downloading photos

Run this read-only query in the existing Supabase project's SQL Editor. Export
the `inventory` JSON value to a private local file outside the repository. It
includes all rows in one aggregate, avoiding the editor's result-row limit.
Do not commit object paths or export credentials.

```sql
select jsonb_build_object(
  'schemaVersion', 1,
  'capturedAt', current_timestamp,
  'projectRef', 'udxxfuticbxwiehoepeg',
  'objects', (
    select jsonb_agg(jsonb_build_object(
      'bucket', bucket_id,
      'path', name,
      'bytes', (metadata->>'size')::bigint,
      'etag', coalesce(metadata->>'eTag', metadata->>'etag'),
      'contentType', metadata->>'mimetype',
      'updatedAt', updated_at
    ) order by bucket_id, name)
    from storage.objects
    where bucket_id in ('listing-media', 'ask-evidence')
  )
) as inventory;
```

Generate a review record:

```sh
node scripts/storage-migration-plan.mjs \
  --inventory /private/path/photo-storage-inventory.json \
  --project udxxfuticbxwiehoepeg \
  --output /private/path/photo-storage-preflight.json
```

This tool reads and writes local JSON only. It has no network calls, upload,
credential, bucket-creation or deletion code. It rejects wrong projects,
unexpected buckets, duplicate rows and missing size/type metadata. It refuses
to overwrite an earlier plan. Its digest identifies the reviewed source
metadata, not verified file content.

The current capture contains 6,379 paths in each photo store. Matching paths,
ETags, sizes and content types are candidates for downloading one source buffer
and writing it to two isolated targets. ETags are not a substitute for SHA-256
verification. A copy implementation must recheck both source records, verify
downloaded bytes, upload both targets and independently verify both copies.
If paired validation fails, stop and revise the transfer budget; do not silently
double the download volume.

## Proposed implementation scope

- Keep authentication, database rows, listing IDs, gallery order, moderation,
  SEO snapshots, reports, avatars, resumes and conversation attachments in
  their current systems. Only the two bulk-photo stores are in this migration.
- Use private R2 Standard buckets `bluebird-listing-media` and
  `bluebird-ask-evidence` with bucket-scoped server credentials.
  Do not enable `r2.dev`, a public custom domain or public evidence access.
  Credentials must be entered into the deployment secret store, never browser
  source, Git, screenshots or operational logs. Credential creation requires
  owner approval at the security-sensitive access step.
- Add a shared server storage adapter with explicit Supabase-only, mirror and
  R2-read modes. Leave production in Supabase-only mode while preparing it.
  Enable an R2 read only for an object with a verified receipt; use the source
  when the copy is unavailable. Rollback remains possible while sources exist.
- Preserve stable listing-photo routes, existing authorization before signing,
  gallery and listing-card layouts. Use server-generated short-lived private
  links; R2's S3 presigned URLs require the S3 endpoint rather than a public
  custom domain. Do not proxy every original through the application server.
- Preserve small card images: R2 is an object store, not an image transformer.
  Pre-generate bounded thumbnails during controlled import/upload and copy;
  do not silently replace 640-pixel card photos with full-resolution originals
  or enable an unapproved paid image-resizing product.
- Cover native create/edit uploads, staged importer photos and claiming,
  seller transfer/copy, admin review and evidence, seller dashboard, marketplace
  images and stable SEO photo routes. Public listing authorization and private
  evidence authorization remain separate even when source bytes match.
- The `finish_seller_claim` database function currently verifies copied assets
  against `storage.objects`. Its completion gate must recognize a trusted,
  verified R2 receipt before any R2-only claim can complete. Preserve claimant,
  seller and manifest checks; do not insert pretend Storage rows or bypass
  transfer verification. Keep old-source claims working during the transition.
- Journal per-object source metadata and SHA-256, target checks, retries and
  current state. Resume from verified receipts, bound concurrency and total
  download bytes, and stop on changed source data or a budget boundary.

## Adapter controls and verified boundaries

- `BLUEBIRD_PHOTO_STORAGE_MODE`: unset/`supabase` keeps existing reads;
  `mirror` still reads Supabase; `r2` uses verified R2 receipts with retained-source
  fallback. No browser can set this flag.
- R2 reads check each original or preview's existence, length and saved SHA-256
  metadata with a two-second HEAD before signing. A reachable bucket alone is
  insufficient. Missing/mismatched objects and failed checks use the retained
  source independently of other photos. Checks share a bounded 30-second worker
  cache; a missing object can remain undetected until that cache expires. These
  metadata requests do not download originals or replace copy-time byte checks.
- `BLUEBIRD_PHOTO_UPLOAD_MODE`: unset keeps Supabase while reads are Supabase,
  and uses mirror writes while R2 reads are being validated. R2-only writes
  require both flags explicitly set to `r2`. Rollback to Supabase-only reads
  cannot preserve new R2-only uploads unless they have source copies.
- Originals remain unchanged. Private listing cards use a prepared preview up
  to 640px wide/2560px high and 512 KiB; opaque images use JPEG, transparent
  images use WebP. JPEG EXIF orientation is applied to previews. WASM decoding
  is guarded at 8 million source pixels on the deployed worker; larger images
  require a prepared preview before server imports or migration can proceed.
  Browser native uploads prepare their previews locally.
  A failed migration preview can now be prepared in the administrator's browser
  using that same native decoder, without increasing the worker's pixel guard.
  The server first reserves one full source-file download against the unchanged
  run/digest/range/expiry/byte permit, then issues a private URL lasting at most
  60 seconds and never beyond the permit expiry. Lost acknowledgements remain
  charged. At most two preview reservations are allowed per failed item; only
  `processing` failures below the existing three-copy-attempt ceiling qualify.
  Browser fetch/processing is never automatically retried. Its small preview
  stays in the current tab and is re-decoded under the worker's existing limits
  before an explicit retry. The run ordinal and source ETag must match the
  leased item; original-byte checks, target verification and normal copy-byte
  reservations still apply. Preparation does not mark anything complete, reset
  attempts, renew the approval, change serving or delete any original.
- Native uploads use authenticated, expiring tickets, immutable signed PUTs,
  byte/SHA-256 checks, and private server-only receipts. Ticket verification
  leases prevent simultaneous replay; six attempts per ticket, 256 tickets
  per user per 24 hours, and 512 MiB/user/day bound abuse. A cumulative 8 GB
  reservation ceiling includes unfinished writes. This is an application guard,
  **not a Cloudflare billing cap**. Review these controls before activation.
- Direct browser PUTs also require a narrowly scoped R2 CORS rule for the actual
  Bluebird origin. It is not configured yet; no R2 upload flag is enabled.
- The additive SQL migration preserves the live seller-claim function and
  patches only its known photo-existence predicate. It aborts on an unknown
  definition. Capture the production definition before installation.
- The copy engine validates both source metadata records and one single-part
  ETag-checked download per pair, independently SHA-verifies both isolated
  target originals and the listing preview, and records each successful target.
  Resumes revalidate saved target receipts without source egress. It has no
  public execution endpoint or deletion operation. The operator runner uses private review and item tables, an expiring server
  permit and aggregate download reservations. Its preparation does not make
  the copy or cutover complete.

Validation on November 1: 752 offline tests passed, including actual PostgreSQL
migration/authorization checks, native upload finalization, source-failure
fallback, immutable upload signatures, image decoding and resumable copies.
TypeScript and the production build passed. The compiled SSR suite exercised
10 cases without upstream provider calls. Nitro requires Photon's wasm module
import to retain the `?module` suffix; a local Node loader supplies the same
compiled module for the Cloudflare production artifact during smoke tests.
These checks do not prove a live upload, gallery cutover or existing-photo copy.

## Operator transfer review and execution

PR72 is published at `68e5350f59d924fe3beabe1a2e502b9cccb45a05`.
Its live storage-only page confirmed both private buckets connected, preview
processing ready, and zero verified photo records. The active read and upload
modes are still Supabase. Its receipt migration is installed; the backed-up
production claim function differs only at the intended existence predicate.

The prepared operator flow is on the existing authenticated admin route
`/admin/fb-import?storage=check`. Opening **Photo transfer review** loads only
private review counters. It does not load the seller queue or its photos.
Choose the metadata inventory JSON (not the preflight report) and click
**Prepare transfer review**. The server validates the deployment's Supabase
project and recomputes the exact same digest as the local CLI before storing
one private review. Preparing or refreshing it performs no photo operations.
An existing digest reuses its review; it does not reset budgets or progress.

The first live 6,379-group preparation committed successfully but returned no
confirmation to the page. Authoritative database inspection found one complete
metadata review, no active preparation, zero reserved photo bytes and zero photo
receipts. The page recovered the saved review after reload. Preparation now has
a 20-second response window; copy-control RPCs retain five seconds. Saved
reviews refresh after preparation settles, with a separate refresh control
available even when confirmation fails. A six-second delayed-acknowledgment
regression and actual SQL duplicate-review tests protect this recovery behavior.

Execution remains disabled with `BLUEBIRD_PHOTO_MIGRATION_PERMIT` unset. Only
after owner approval of the exact copy scope and review of source enforcement,
set that server-only value to a JSON object with all five reviewed fields:

- `runId`: the generated review UUID;
- `inventorySha256`: the exact reviewed 64-character inventory digest;
- `maxGroups`: the approved prefix of groups, such as a small pilot first;
- `maxSourceBytes`: the cumulative approved photo-body download allowance;
- `expiresAt`: an ISO timestamp ending that approval window.

These are controls, not approval supplied by this document. Do not activate a
permit during preparation. Do not enter it as a browser/public environment value.
The migration does not create any permit or switch storage modes.

The server leases one group per request. Concurrent requests cannot lease a
second active group. A source-download reservation is committed immediately
before the source GET, after metadata and any existing target receipts have
been checked. The reservation is cumulative across retries and cannot be reused
within a lease. Interrupted or failed downloads remain charged; no automatic
refund invents unused headroom. Successful resumes with already verified targets
need no source reservation or download. A group is complete only after its
source-matching private receipts exist. Stale workers cannot complete a new
worker's lease. Failed groups stop the queue and require an explicit retry;
three attempts require further review.

**Run approved batch** handles at most 25 groups sequentially and stops on a
failure, busy response, approved-range boundary or user stop. **Stop after current
group**, closing the review, or leaving the page prevents further client requests;
a current server request can finish. A retry handles one failed group. No
scheduler runs copies. The runner has no source-deletion or cutover operation.

**Continue approved batches** repeats those same bounded batches while the admin
page remains open. After every 25 groups it reloads the saved review before
continuing. It stops on a failed group, active lease, unavailable acknowledgement,
changed/expired permit, user stop or page exit. It cannot silently widen or renew
the permit, and the retry control still attempts only one group. This is a
one-time operator action, not a recurring schedule or automatic page-load action.

Independent operations inside one leased pair overlap: source metadata checks,
receipt reads, saved-target verification and the two isolated target writes.
Both source rechecks finish before either new target write starts. Every started
operation settles before a failure is returned, so a failed pair cannot release
its lease while its other write is still in flight. The database continues to
serialize aggregate storage-byte reservations. One group at a time, batch size,
source-download reservations, retry limits and permit scope remain unchanged.

Status lookup retries at most one read-only SELECT after a transient failure,
with a three-second bound on each attempt. A missing or wrong-project review
still stops immediately. Leases, source downloads, writes and completion RPCs
are never automatically retried. A lost completion acknowledgement leaves the
saved lease/receipts for review; a status-read failure after an acknowledged
completion cannot mark an already copied pair failed. Connectivity failures
are reported separately from missing reviews or incorrect source projects.

When a lease-acquisition or completion response is lost, the runner can confirm
that exact run and lease token with a bounded read-only lookup. It continues only
from its own unexpired running lease within the unchanged permit; completion is
accepted only for that token and ordinal already marked complete. Missing,
expired, mismatched or unreadable leases stop without replaying the mutation or
performing photo operations. This does not reset or increase the three-attempt
database ceiling, source allowance, batch size or approval expiry.

The displayed reserved and confirmed-successful bytes have different meanings:
reservations bound the app's expected photo-body downloads, including uncertain
failed attempts; confirmed bytes count successful completed downloads only.
Metadata and ordinary application traffic are additional. They are not a hard
cap on Supabase's account-wide billing meter, nor a guarantee of free capacity.
Keep headroom and verify the provider's current allowance before activation.

The known inventory remains 12,758 objects / 6,379 groups with digest
`1f3e3849f6c01e494fb55b828ce71fcae8bcc86657935485e8245c68c6bb7f20`.
The current source-allowance review shows 4.982/5 GB uncached egress and
2.316/1 GB billing-period average storage. The support request addressing
November 15 versus November 17 is drafted and unsent pending owner approval.

## Transfer timing and costs

The first review showed about 2.62 GB in the two photo stores, plus only about
3 MiB of prepared homepage/SEO snapshots. The paired-download plan may reduce
source photo transfer to about 1.31 GB while retaining two separate R2 copies.
These are metadata estimates until the generated plan and byte checks agree.

The earlier Supabase meter showed 4.922 / 5 GB of uncached transfer already
used. Even the paired plan exceeds that remaining allowance. Cached and
uncached transfer have independent quotas; a new bulk download cannot be
assumed to hit the CDN cache. R2 activation does not change this source limit.

Storage enforcement also uses a billing-period average. Removing current bytes
does not erase prior usage. The current reset is November 17, while the account
notice names November 15 as the end of its grace period. Small owner-approved
batches can run while the Free-plan grace period permits normal operations;
unused monthly quota is not a technical prerequisite for such a batch. Resolve
the deadline gap before relying on continued service or a source-removal cutover.
Do not promise that deleting photos immediately clears the current restriction.

R2's approved terms include 10 GB-month, 1 million Class A and 10 million Class B
operations per month; usage beyond these allowances is billable. Before copying,
check account usage and establish operation/byte budgets and alerts. No hard
zero-dollar account cap has been verified. Avoid adding Workers or image-service
billing merely to move object storage.

## Review and rollout gates

1. Prepare and test the adapter, copy/resume tooling and checks without live
   credentials. Review the exact object manifest, planned bytes and operation
   ceilings. Resolve source allowance/grace timing.
2. Bucket creation and restricted access are already approved and complete.
   Obtain separate approval for the bounded photo copy after the source quota
   and operator execution gates are resolved. No bulk copy is currently enabled.
3. Copy a small reviewed batch, verify source and target bytes, and test listing
   cards, full galleries, unpublished/removed access, admin evidence and upload/
   claim flows. Copy the remainder only within the approved byte ceiling.
4. Switch reads with fallback and monitor. Confirm new uploads and seller claims
   use the correct store; no photo-related action may depend on a removed copy.
5. Present an exact verified deletion manifest and request separate permanent
   deletion approval. Recheck each source's metadata and references before any
   approved deletion. Do not edit `storage.objects` directly to remove files.

Sources reviewed November 1, 2026:

- [R2 pricing](https://developers.cloudflare.com/r2/pricing/)
- [R2 presigned URLs](https://developers.cloudflare.com/r2/api/s3/presigned-urls/)
- [Supabase transfer usage](https://supabase.com/docs/guides/platform/manage-your-usage/egress)
- [Supabase storage averaging](https://supabase.com/docs/guides/platform/manage-your-usage/storage-size)
- [Supabase fair-use restrictions and reset timing](https://supabase.com/docs/guides/platform/billing-faq#fair-use-policy)

Operator preparation validation: 765 repository tests passed, including actual
PostgreSQL tests for private review permissions, lease replay, stale workers,
expiry, run/digest/group limits, cumulative budgets, interrupted retries,
verified zero-download resumes and retry limits. Server orchestration tests
exercise the real copy core with offline stores. TypeScript, scoped lint and
production build passed. No live copy or billing-cap guarantee follows from
these checks; the permit remains unset and source-capacity approval is pending.

### November 2 pilot and remaining-copy approval

The owner approved the four-format pilot. Its four groups completed with no
failures: eight original R2 objects and four listing previews passed byte-length
and SHA-256 verification after 1,054,946 source-photo download bytes. Production
metadata confirms all eight Supabase sources remain unchanged. The temporary
pilot permit was disabled afterward; reads and uploads still use Supabase.

Full metadata reconciliation found all 12,758 original objects unchanged plus
the two 2,791-byte objects from the approved private posting QA. The reconciled
inventory has 6,380 pairs and digest
`af4789fed617bd931b581c19ae5fcef943ae91baec2b5781f5ed141ea709f0e3`.
The owner approved copying the remaining 6,376 pairs within a combined
1,500,000,000-byte photo-download ceiling and 24 hours, retaining source files
and both existing serving modes. Metadata and ordinary app traffic are additional.

The new full preparation failed without creating a run or leaving an active
preparation. Execution therefore reuses the unchanged 6,379-group review with
a 1,499,990,000-byte ceiling and a separate one-pair QA review with a 10,000-byte
ceiling. Their sum remains the owner's approved limit. Already verified pilot
objects are checked and skipped without another source download. The remaining
expected photo downloads total 1,308,112,824 bytes. Remaining-copy approval does
not authorize read/upload cutover or permanent source deletion. Completion still
requires authoritative run, receipt and retained-source verification.

### Cutover preparation while copying

Complete both approved reviews, reconcile all current source metadata and
receipts, and disable the copy permit. Then present the exact serving/upload
flag change and rollback path for review. Existing source files remain intact.
R2-only browser uploads also require an origin-restricted CORS rule, a real
native upload/finalization check, and private review/claim verification before
they can replace Supabase writes. Preparation or successful offline tests do
not authorize switching the production flags.


### Large server-import photos

Before R2-only uploads, seller staging uses a bounded browser-preview handoff
when the worker decoder cannot prepare an image. The server preflights all of a
row's photos before starting target writes, returns exact source SHA-256/size
metadata, and retains small previews where the response budget permits. The
admin browser receives one bounded original at a time through an admin-only,
uncacheable same-site function, verifies its hash, and prepares a small preview.
A single row-specific retry preserves original order, validates source hashes
again and re-decodes each small preview before writing unchanged originals to
both private stores. An uncertain request is never automatically replayed.

The existing 12 MiB import-photo limit, eight-photo row limit, source host list,
seller authorization, draft review and claim/copy paths remain authoritative.
Public-CDN redirects stay inside that source host list. Worker memory is bounded
by sequential original reads rather than buffering eight originals. Some photo
URLs are read again before storage; this is admin staging, never a visitor or
marketplace data-provider search. Supabase-mode imports and unchanged published
refresh rows retain their existing behavior. The extension needs no new access.

Offline checks include an actual 12.2MP JPEG, both private R2 original copies,
no draft writes before preparation, source drift, authorization, interrupted
responses, row accounting and a real isolated-browser 640x480 preview. These
checks do not prove production R2-mode import completion. Verify that path as
part of the approved cutover; current photo read/upload modes remain Supabase.


### Ending retained-source fallback before permanent deletion

`BLUEBIRD_PHOTO_SOURCE_FALLBACK_UNTIL` is an optional, absolute ISO timestamp
with an explicit timezone. It is unset by default and has no effect on current
Supabase reads/uploads. In R2 read mode, the shared signer clips fallback TTLs
to that deadline and checks the returned Supabase token's actual `exp` claim.
A response with an unknown, invalid, expired or later token is not returned.
After the deadline, no fallback signing request is started. Verified R2 links
continue normally. A malformed explicit setting disables R2 fallback rather
than silently restoring an unlimited window. The admin storage check displays
this policy. The existing store observes expiry without a new deployment.

Enable this only in the reviewed cutover after R2 verification, final uploads
and catch-up for every still-required source photo. Choose a deadline that also
covers outstanding legacy signed links: native card URLs may last 24 hours,
other galleries/evidence links up to one hour, and prepared page objects may
retain existing links. Refresh caches and verify the resulting URLs. A rollback
to source reads, a renewed cutoff, or explicit migration-source signing restarts
the retention review. Disable migration permits before deletion review.

No cutoff is configured by this source change. No files are deleted. The cutoff
controls normal R2 fallback only; exact permanent deletion remains a separately
reviewed and approved action after copy integrity, serving, uploads, private
access, claim behavior and the legacy-link retention window are verified.
