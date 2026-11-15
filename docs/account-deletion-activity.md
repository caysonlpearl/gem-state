# Linked activity cleanup

This source-only component removes directly account-linked `analytics_events`
and `rate_limit_events` after sourcing cleanup. It does not activate the worker,
remove Auth, infer guest ownership, decide financial/audit retention, or finish
the full deletion process. It is stacked on sourcing PR #273 and expects the
independent date repair from main PR #274 to be installed first.

## Ownership and bounded removal

Ownership comes only from the stored `user_id`. Each leased call removes at most
100 physical rows from one source, including their entire payload. Another
member's events and guest events remain independent even when their browser
identifier matches. This does not establish that all historical anonymous
payloads are unidentifiable; those cannot be reassigned to people by guesswork.

Source ownership is immutable. The existing active-member history/retention
operation can still clear the analytics owner, browser identifier and visit key
without changing the rest of the event. An anonymous row cannot be reassociated
with an account. Rate-event ownership cannot change.

Before collection or updates, the guard checks every actual subject and the
authenticated actor using the existing account/deletion ordering lock. Service
collectors have the same restrictions. An authenticated pending member cannot
bypass the check by submitting a null owner. Genuine guest collection remains
available under the existing analytics permissions and policies.

The Auth relationships become `RESTRICT`, so removing Auth cannot silently
strand linked analytics or cascade through throttle history. Independent
verification requires the exact verification-phase lease, no linked rows and
Auth absence through the inherited scope. It is read-only. Completion checks the
old account identity even if the caller tries to clear the new job identity.

## Existing history and maintenance

The captured history-clear and scheduled-retention functions keep their existing
operations, periods and ACLs. Their analytics candidates exclude pending or
removed members through a private predicate. That preserves ownership for actual
row erasure instead of turning pending-account rows into detached records.
History clearing still completes its other existing operations for a pending
member. This component does not authorize renewed collection or delivery.

The predicate is an early filter, not the concurrency boundary. If deletion is
queued after candidate selection, the writer guard waits on the existing subject
lock, sees the committed request and rejects the unlink. That maintenance
statement rolls back; its next pass skips the pending member and processes active
members normally. Earlier active-member retirement can commit before a later
deletion request. No uncertain browser association restores an old account link.

These are temporary coordination states, not a permanent retention exception.
The complete processor still must remove pending-account records and finish
provider/identity handling before reporting deletion complete.

## Installation and runtime checks

Installation requires a disabled worker, intact private/sourcing boundaries and
complete account/session guards. It checks the actual columns, defaults, keys,
incoming relationships, existing hooks, table permissions/read policies and
captured callback bodies/configuration and permissions. Unexpected prior completion callbacks cannot be adopted by
refreshing the private contract.

A private runtime contract covers source shape, RLS/policies, ACLs, indexes,
rules, inheritance, writer/completion guards and relevant function definitions.
Unknown children, changed hooks, widened function permissions, paused controls or
expired/mismatched leases refuse cleanup. New owner indexes support scoped work.
The function rechecks its lease and contracts after deletion so expiry during a
row wait rolls the physical change back.

Only the service role can invoke purge and independent verification. The adapter
freezes the supplied identity/lease fields, validates receipts, uses a 15-second
deadline, disables automatic SDK retries and returns sanitized errors. A later
explicit pass discovers remaining work after an acknowledgment is lost.

## Evidence and limits

The source definitions and three real callbacks were captured from production
metadata on November 15 at 14:10 UTC after the date repair. No member content was
read or deleted. Tests reconstruct those relations/callbacks, including their
captured owner/permissions, inside disposable databases. Supporting maintenance
tables use existing source definitions/date columns with synthetic content; this
does not establish full consent/financial retention behavior.

Focused tests exercise physical target-only removal, 203 rows per source,
active history clearing/throttling, pending collection and unlink rejection,
continued maintenance, Auth restriction, read-only verification, drift/refusal,
service-only execution and the real SDK's lost-acknowledgment path.

The required real PostgreSQL gate observes lock waits for collection before
deletion, maintenance before/after deletion, two cleanup workers sharing one
lease, and expiry during a row wait with rollback. The fixture reconstructs the
captured `postgres` callback owner inside the disposable native cluster; it does
not weaken the production permission preflight to fit a test-only owner name.

Local validation passed: seven focused tests, the real PostgreSQL concurrency
gate, TypeScript, targeted lint, production build, formatting and diff checks.
The full regression suite passed 1,802 tests with 16 skipped and no failures.
Hosted checks and installation are separate evidence; this batch is uninstalled.

Remaining launch work includes explicit financial/moderation/consent/audit and
shared-asset handling, provider erasure, authorization/identity composition and
the independent full-flow rehearsal before activation. Native device delivery,
beta, owner enrollment and store release remain separate requirements.
