# Community-report deletion

This source-only component removes owned community sightings and positive
responses before owned catalog cleanup. It follows private submissions and
inherits their account/job/lease boundaries. It does not activate the worker,
erase provider bytes, remove Auth or complete the full deletion workflow.

## Preserve authorship and shared responses

A sighting has a private reporter/evidence reference and public descriptive
content. Its confirmations and flags belong to separate members. Their original
Auth and parent keys could cascade through this material.

Reporter and response-owner Auth keys now restrict deletion. Response parents
become nullable with a checked `unavailable_at` marker. Before removing an owned
report, retire surviving members' response links in bounded batches, preserving
their identifiers, ownership, kind and creation time. Remove the original report
only after all links have been retired and its current media evidence has been
discovered. Ordinary parent deletion also retires surviving responses.

When the requesting account owns a positive response on a retained report,
remove that response and recalculate the actual remaining confirmation count.
Lock the parent before the child, matching the real `respond_to_sighting`
function. A retained report's note, location, price, flag count and moderation
state remain unchanged. An attached response and count repair are two physical
row changes; retired responses without a parent require only one. Each call
accepts a limit of 2–100 and changes no more than that many source rows.

Do not restore a hidden report, reduce flag counts or treat removal as permission
to reverse moderation. Owned flags, hidden/flagged reports, verified reports,
trusted evidence types and verifier references on other members' reports hold
for explicit retention handling. This is a pending state, not a permanent
retention policy. Those retained sources still need their complete handling.

## Stop late writes and incomplete erasure

Source writers check the actual reporter and responder against deletion and
lock the actual report before creating responses. Ownership cannot be reassigned.
Retired response payloads are read-only. The cleanup context permits only
narrow link retirement, owned removal and truthful positive-count repair.

Evidence must match its exact sighting reference in the current durable
inventory generation. An ambiguous bare key remains unresolved; the component
does not invent a storage bucket. Removing a reference preserves its durable
observation for later provider ownership and byte-erasure handling.

The migration requires a disabled worker and unchanged reviewed prerequisites.
Both this installer and its private-submission predecessor check the existing
private completion boundary before adding and recording their reviewed callback.
An unexpected pre-existing job callback is rejected rather than adopted into the
updated contract.
It checks captured columns, incoming/outgoing constraints, hooks and the actual
member report/respond functions and public view before changing sources. Its
runtime contract checks source columns, constraints, policies, indexes, hooks,
rules, inheritance, the public view and relevant function definitions. New
callbacks or schema/view drift stop erasure until reviewed.

Only the service role receives purge/verification access. Background identity,
the exact live lease and prior component completion are mandatory. The adapter
freezes the job, enforces a 15-second deadline, validates result shape and
suppresses sensitive errors. Automatic RPC retries are disabled after an
ambiguous response. The independent verifier is read-only and requires Auth
absence through the inherited scope. The completion trigger checks the old user
identity when a completion update attempts to clear it.

## Evidence and remaining scope

The committed fixture contains the actual two source schemas, enums, public
view and report/respond functions captured by a metadata-only production query
at `2026-11-15T11:44:07.525422+00:00`. The actual rate-limit function was captured
separately at `2026-11-15T11:54:55.811395+00:00`. Supporting location/park/resort
labels, identities, payloads and the rate-event table are synthetic. This fixture
does not establish the rate-event table's deletion/retention behavior, complete
payment workflows or any provider-object erasure.

Focused tests exercise more than 200 surviving responses, exact payload
preservation, the real member report/respond path, count repair, flags,
moderation/verification holds, ambiguous/missing media evidence, pending writers,
Auth shortcut rejection, role isolation, view/policy/lease changes, ordinary
parent removal and independent verification. The required real PostgreSQL gate
observes real lock waits: response before account withdrawal, withdrawal before
a late response, ordinary response before cleanup, cleanup before an ordinary
response, and expiry during a parent-lock wait with rollback. Normal member
responses continue after compatible cleanup without losing counts.

Remaining launch work includes sourcing requests/quotes/events, financial and
moderation retention, shared/static assets, remaining analytics and audit/consent
records, provider erasure, revocation/identity composition and a full end-to-end
rehearsal. Source-only drafts remain unmerged and uninstalled until the complete
flow is reviewable. Native delivery, device beta and store release remain separate
requirements of the approved launch plan.
