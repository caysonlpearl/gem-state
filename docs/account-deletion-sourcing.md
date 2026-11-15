# Sourcing request, quote and history cleanup

This source-only component follows private submissions and community reports and
precedes owned catalog cleanup. It adds bounded cleanup for `sourcing_requests`,
`request_media`, `shopper_quotes` and `sourcing_events`. It does not activate the
deletion worker, erase provider bytes, remove Auth or finish the full deletion
workflow. The independent reference-media permission fix in main PR #272 is
already live; this larger batch remains uninstalled.

## Ownership and surviving members

Request ownership is the stored buyer, quote ownership the stored shopper, and
history authorship the stored actor. These are independent identities. Ownership
cannot be reassigned, and history cannot be moved to an unrelated request/quote.

Remove the requesting member's ordinary authored event text first. Before
removing their quote, retire surviving actors' quote links without deleting their
notes. Remove the quote and recompute the actual remaining submitted-quote count
on its retained request. Before removing an owned request, retire other shoppers'
quotes and other actors' request-history links. Their original amounts, notes,
status, identity and creation time remain. Quotes keep the existing touch hook,
so their update time reflects retirement. Separate availability timestamps record
retired request and quote links.

Retired payloads are read-only. The account's quote history uses the actual null
request identifier to show an unavailable state and remove the stale Withdraw
action. A hidden related row by itself is not proof the request was removed;
RLS can hide joins. Existing quotes with a request still have their normal action.
No new query or provider request is needed for this display.

Private reference media drains only after each exact current-generation inventory
observation matches its source row, known `request-media` bucket and path. The
durable observation survives removal for later provider ownership/byte handling.
An owned request is removed only after its children have been removed or retired.
Unknown incoming children or callbacks stop installation/cleanup instead of
introducing an unbounded cascade.

## Retention and physical work limits

Accepted or matched quotes, accepted/matched requests, unknown lifecycle states
and unreviewed history event types hold for explicit retention handling.
Unattributed history also holds so its parent is not erased before ownership and
retention are established. An order whose immutable fee snapshot references a
quote also holds it, even without a current matched-order pointer. Sourcing
assignments remain financial order
records handled by the later financial component. None of these pending states
is a permanent retention policy or permission to keep personal data indefinitely.

The ordinary event allowlist is request creation/cancellation and quote
submission/withdrawal. Financial acceptance and unrecognized event types cannot
be erased through this component. Conflicting live request parents are held for
ownership review. Quote and event links can retire in separate bounded passes;
the temporary state where only one link is null is supported. Both actual
parents are checked for retention. A retired quote's remaining history can refer
to only one nonnull request, discovered with a two-parent ceiling, and that
request is locked before the quote. Concurrent deletion jobs can finish through
this intermediate state while preserving a third actor's original note.

A pass changes at most 100 physical source rows and accepts a limit of 2–100.
Deleting a quote can also repair its parent's count; a media pass reserves one
row for the media counter. Other counters can remain unchanged even when stale:
the cleanup context permits only truthful changes to the counter being repaired.
Link retirement and root removal occur in separate bounded passes. This avoids
counting a root deletion while silently cascading through hundreds of children.

## Normal actions and concurrency

Preserve the captured member functions, pricing calculation and order snapshot
behavior. Acceptance and withdrawal now lock the actual request before the quote,
matching submission and cleanup. Missing/retired parents are checked explicitly;
acceptance uses an exact buyer comparison rather than a nullable inequality.
The accepted request is closed before competing quotes are declined. The actual
active buyer may narrowly decline an existing submitted quote during cancellation
or acceptance even if that losing shopper has requested deletion. This changes
only lifecycle/touch fields and cannot rewrite the quote's content or accept a
pending shopper into a new order. Acceptance restores the previous trusted
operation setting on success; transaction failure rolls its local changes back.

Source writers check the actual parent/subjects, including before taking parent
locks while holding a child. A late writer fails on the queued deletion rather
than waiting on a parent held by its cleaner. Member RPCs retain account/session
guards; modified client RPCs are deliberately unwrapped before the real boundary
installer rewraps and registers fresh proof. Merely resealing a changed marked
body would leave stale account-boundary proof. The private media lookup keeps its
guard, checks viewer/requester deletion state and remains service-only.

## Execution and evidence

Installation requires a disabled worker and all inherited contracts current,
including the existing completion boundary before adding its new callback. Source
columns, defaults, generated flags, incoming/outgoing keys and actual hooks/member
functions are checked. Runtime contracts cover source schema, policies, indexes,
rules, inheritance, relevant function definitions and ACLs. Completion checks the
old member identity when a caller tries to clear it.

Only the service role can invoke bounded purge and independent verification.
They require the exact live background lease and preceding source completion.
The verifier is read-only and requires Auth absence through the inherited scope.
The adapter freezes the supplied job, validates narrow result shapes, sanitizes
errors and uses a 15-second deadline with automatic SDK retries disabled. A later
explicit pass discovers remaining work after a lost acknowledgment.

The fixture contains actual source metadata/member functions captured on
November 15 at 11:44 UTC and supplemental reader/settings/pricing functions at
12:16 UTC. Order columns/defaults come from the earlier captured payment fixture.
Members, roles, location labels, settings, fee-selection data/helper and rate-event
payloads are synthetic. The real fee calculator and acceptance function run in
that fixture; this does not establish full fee eligibility, provider payment,
financial retention or rate-event erasure behavior. No production member content
or provider object was read for these tests.

Focused tests cover actual create/quote/accept/cancel/withdraw flows, more than
200 media references, surviving quotes and other-actor links, bounded physical
writes/counter repair, residual financial evidence, pending owners and losing
quotes, lost acknowledgments, independent verification, role/ACL/schema/lease
changes and unexpected completion callbacks. The required real PostgreSQL gate
observes actual lock waits for writes before/after withdrawal, a pending shopper's
rejected acceptance, new quotes/ordinary withdrawal during count repair and lease
expiry with rollback. Actual row rendering checks unavailable/active/pending
actions and escaped content.

Local validation passed: 21 focused assertions, the real PostgreSQL concurrency
gate, and the full regression suite (1,795 passed, 15 skipped, no failures).
TypeScript, targeted lint, production build and formatting checks also passed.
Synthetic before/after renders with the actual row components and production CSS
were inspected at 390px and 1280px: retired actions are absent and long names stay
inside the updated rows. These checks do not establish a live member journey or
production installation.

Remaining deletion work includes explicit financial/moderation/consent/audit
retention, other analytics and shared/static assets, provider erasure,
revocation/identity composition and an independent full-flow rehearsal before
activation. Device delivery, beta, owner enrollment and store release remain
separate requirements of the approved launch plan.
