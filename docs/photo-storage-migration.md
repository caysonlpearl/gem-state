# Photo storage migration preflight

Status: R2 Standard activation is owner-approved and the active empty overview
was verified on November 1, 2026 (Boise). The owner chose to keep Supabase Free.
No bucket, credential, photo transfer, cutover or deletion has been performed.
This document and the local preflight tool do not change application behavior.

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
notice names November 15 as the end of its grace period. Resolve that gap with
Supabase or an explicitly approved alternative before transferring/cutting over.
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
2. Obtain approval for the named private buckets, bucket-scoped access and
   bounded photo copy. Creating credentials and copying private evidence are
   distinct from the already-approved R2 subscription activation.
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
