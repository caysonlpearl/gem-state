# Photo storage migration preflight

Current status (November 2): the four-format pilot is verified and the owner
approved the remaining copy within 24 hours and a shared 1.5 GB photo-download
ceiling. The primary review is now copying through the manual continuation
control. Completion requires the saved run and receipt checks; it is not yet
claimed. Reads and uploads remain Supabase, and no source deletion has occurred.
The owner chose to keep Supabase Free. Both private R2 Standard buckets and
their restricted server credential are configured in the deployment secret store.
Earlier preparation observations below retain their original scope and date.

The application adapter is prepared with both production mode flags unset.
The default remains Supabase, including native uploads. The admin seller-import
page provides a manual, read-only connection and thumbnail capability check.

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
