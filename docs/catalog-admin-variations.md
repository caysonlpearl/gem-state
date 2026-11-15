# Named catalog variations and approval compatibility

This source-only repair was found while composing account deletion for member
suggestions and held listing requests. It does not implement submission erasure
or enable the deletion worker.

## Verified problem

The November 15 production metadata shows `variation_key` is a stored generated
column derived from size, color and edition. Both captured `admin_create_product`
and `admin_save_variant` still explicitly insert that column; the editor also
updates it. Disposable tests reproduce PostgreSQL error `428C9` and rollback of
the original routines, rather than treating a fixture failure as successful
approval. Omitting the explicit column alone is insufficient: two named options
with no structured attributes would both generate `~|~|~` and conflict.

## Resulting behavior

Structured size/color/edition keys keep their existing formula. Only a variant
with all three attributes null and a nonblank `sku_label` gets a normalized
`label:` key. Percent characters are escaped before pipes, so label keys contain
no pipe and cannot collide with structured keys, which always contain two or
more pipes. No size, color or edition is invented from a freeform label. Variant
ids, product ids, child references, prices and attributes are preserved.

Both admin writers leave key computation to the database. Named options retain
input order; a blank list still creates Standard. Creation permits up to 40
labels, matching the existing website limit, with a 120-character label limit
matching the editor. Case/space duplicates are rejected and the entire call
rolls back. Existing structured-attribute uniqueness remains enforced.

When approval is based on a member suggestion, the creation routine locks the
actual suggestion, checks its submitter and any held seller against deletion,
then creates derivatives. A winning deletion request therefore stops approval;
an approval that wins first commits before deletion can inventory it. A second
approval of an already approved suggestion is rejected before creating another
catalog page. Ordinary member/admin session checks and permissions remain in
place. This does not replace the remaining submission writer/erasure work or
prove every moderation path is deletion-aware.

## Installation, capacity and rollback

`20261115070000_catalog_admin_named_variations.sql` is stacked on the source-only
catalog cleanup batch. It requires the worker disabled, current prior contracts,
the captured original generated expression and both exact original writer
bodies/configurations. It checks oversized legacy label keys before changes.
After the reviewed generated expression/index rebuild, it repins only that
known catalog change and reinstalls the normal account boundary proof for the
two writers. It does not expose a general contract refresh.

The read-only production observation at `2026-11-15T10:49:01.278548+00:00` found
502 variant rows, 466,944 bytes total, and 502 named rows with null structured
attributes. No member identifiers or content were read in that aggregate query.
Revalidate capacity before installation. A disposable PostgreSQL rehearsal uses
504 synthetic rows and checks all variant fields/ids and resulting keys.

PostgreSQL 17 supports `ALTER COLUMN ... SET EXPRESSION AS`; it rewrites existing
generated values and removes column statistics, so the migration analyzes the
table afterward. This requires an exclusive table lock and is not a shopper
request workload. The migration limits lock acquisition to five seconds and
statement execution to thirty seconds. The observed production version was
17.6. See the [PostgreSQL 17 ALTER TABLE documentation](https://www.postgresql.org/docs/17/sql-altertable.html).

Failure rolls back the transaction. After named options exist, do not blindly
restore the old formula: multiple label-only options would collide. Existing
website/app code can continue using the unchanged RPC signatures and stable
variant ids while retaining the repaired database formula; prefer a compatible
forward correction if a later problem is found.

## Evidence boundary

Tests use captured product/variant, submission, approval/conversion, notice and
editor code against synthetic supporting resort/brand/import/audit payloads,
role assignments and identities. They cover creation/editing, default/ordered
options, punctuation/Unicode, duplicate and oversized input, unchanged references,
real held-listing conversion, pending authors/sellers/admins, permissions, and
request/approval ordering with independent PostgreSQL connections. No production
function, record, payment, provider object, account enrollment or app submission
was changed. The full privacy, retention, provider-media and launch goal remains
unfinished.
