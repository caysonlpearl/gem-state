# Authored submission cleanup

This source-only batch adds bounded removal of private catalog suggestions,
suggestion-photo references and held seller-listing requests. It is stacked on
the named-variation/approval repair and is not a production installation or a
complete account-deletion implementation. The worker remains disabled.

## Ownership and order

Run after conversation, inquiry and application cleanup, and before owned
listing/catalog cleanup. A held request's converted listing and a suggestion's
created/merged catalog references otherwise prevent those later components
from finishing. The component composes the application boundary directly;
it deliberately does not call the later listing/catalog cleanup scopes.

Ownership comes from the stored suggestion author and held-request seller,
not the caller or an assumed relationship between those accounts. Delete the
requesting seller's held forms first. Preserve another member's suggestion
unchanged. When removing a suggestion that another seller's held form still
references, retire that link with `suggestion_id = null` and `unavailable_at`.
Preserve the entire other seller's note, price, parcel dimensions, photo paths,
status and converted-listing reference. Retired forms cannot be edited or
converted. Ordinary parent deletion also retires these links instead of
cascading through another seller's private payload.

The real approval function authors the resulting catalog product under the
reviewing administrator. Removing a member's private submission does not
establish ownership of that separate catalog contribution. Such products and
their public media remain subject to the later shared-content/retention review.
An owned converted Ask is removed by the separate listing component.

## Media evidence and bounded changes

Every non-null held-request photo path must match its exact source, row and
array position in the current durable media-inventory generation. The captured
schema permits at most eight evidence and eight public paths per request.
Process no more than six held requests per pass, capping those checks at 96.
Delete complete request rows rather than modifying photo arrays.

Drain suggestion media before deleting the suggestion. Do not infer a storage
bucket from an ambiguous bare path. A trusted, self-identifying URL can resolve
through the existing reviewed resolver; unresolved references hold the job.
Older observations survive removal for later provider ownership and byte-erasure
work. This component removes database references only and makes no storage,
listing-provider or other network calls.

Passes change at most 100 physical source rows. A pass retires links, removes
media, or removes one suggestion root; it does not combine an unbounded cascade
with a root deletion. Existing touch/conversion hooks and media-writer guards
are checked and preserved.

## Retention and concurrent writes

Moderator references on other members' submissions require explicit retention
handling. Converted listings with financial, report, dealer/import or other
reviewed retained dependencies also hold. Created/merged products with retained
orders, bids, verified sales, quotes, matches or sourcing dependencies hold.
These are deliberate pending states; the batch does not invent retention periods
or silently discard evidence.

Lock actual linked products and variants before deciding retention, and actual
converted listings before removing request references. Incoming FK references
serialize with these decisions. A transaction that committed first is checked
after the wait; a later independent transaction can still use an active staff
catalog product that remains in place.

Source writers lock their actual parent and check both author and seller against
account deletion. Authorship/held ownership cannot be reassigned. New photos,
edits and conversion writes cannot restore private content after deletion is
requested. Auth references use restrictive keys so removing Auth cannot bypass
this component. Narrow FK link retirement is allowed without rewriting payloads.

## Execution and verification

Only the service role can invoke the bounded purge and independent verifier.
They require a matching live job/lease, background identity and current reviewed
schema/function boundaries. Client roles cannot invoke helpers or reseal the
private contract. The verifier is read-only, requires Auth to be absent through
the inherited scope, and checks remaining authored/reviewer/seller references.
The job-completion guard checks the old account identity even when a completion
update attempts to clear it. No whole-records-phase, Auth-removal or provider-byte
authority is granted.

The server adapter freezes the supplied job, rejects malformed results, uses a
15-second deadline, suppresses sensitive error details and disables automatic RPC
retries after an ambiguous response. A subsequent explicit leased pass discovers
remaining work without replaying an already accepted mutation.

## Evidence and limits

The committed prerequisite fixture
`tests/fixtures/catalog-admin-variation-schema-20261115.json` contains captured
source columns, constraints, policies, hooks and real approval functions from the
metadata-only production inspection on November 15. The new fixture replaces
the early generic photo fixture's synthetic label and NO ACTION keys with those
captured source definitions. The migration refuses unexpected columns,
relationships or hooks before changing them and snapshots runtime policies,
indexes, rules and function definitions. No production member payload is copied.

Focused tests cover more than 200 media references, bounded physical writes,
ambiguous delivery acknowledgments, current media discovery, distinct author and
seller ownership, ordinary approval/conversion, moderation/financial holds,
pending writes, privileged execution, schema/policy changes and stale leases.
The required real PostgreSQL test observes actual lock waits for writes before
and after a deletion request, lease expiry during cleanup, and financial
references before and after the cleanup decision. Supporting financial and
business payloads in this fixture are synthetic; these are not live payment,
provider-erasure or physical-phone checks.

Full composition still needs other authored records, shared/public assets,
explicit financial/moderation/consent/audit retention, provider erasure, identity
revocation and an independent end-to-end verifier before activation. This batch
does not authorize production deletion or represent the app-launch goal as done.
