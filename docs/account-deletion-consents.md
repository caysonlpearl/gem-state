# Account and consent cleanup

This component follows the composed shopping/activity boundaries in PR #276.
It removes `shopping_accounts`, `shopping_consents` and `mobile_ad_consents` in
bounded calls. The migration is source only: deletion stays disabled, and no
production member, provider object or Auth identity is removed by this batch.

## Permission behavior

The captured signup, account settings, privacy and mobile onboarding callbacks
retain their business behavior and permissions. Signup still records exactly
the required terms acceptance and the separate optional shopping-alert choice.
Native advertising remains a separate record, and website acceptance does not
replace app onboarding. The test fixture now reconstructs the signup callback's
captured service-role permission as well as the other three callbacks.

Ownership cannot change. Consent evidence is append-only. A canonical account
subject can identify its own historical null-FK record; contradictory user and
subject references refuse cleanup. Guest records are not assigned by cookies,
browser characteristics or a shared device.

Pending deletion allows the real alert unsubscribe, privacy decline, delivery
block and forward-only history cutoff. These cannot replace terms, rotate an
existing unsubscribe token, clear an existing suppression or enable collection.
Native advertising may be declined. Each negative write holds the actual Auth
key through commit and cannot recreate account records after Auth is gone.

All three direct Auth FKs become `RESTRICT`. A late decline can require another
records pass before identity removal. A canonical subject with a null FK can
also require a bounded identity-phase pass after removal. Independent
verification requires absent Auth and no remaining records. An earlier
`pass_done` receipt is never whole-workflow completion.

## Terms evidence and retained records

Fourteen explicitly named financial, checkout, claim and audit sources are
checked using owner columns and Auth relationships captured November 15 at
15:01 UTC. The projection includes editorial audit ownership without an Auth
FK. It accounts for the earlier listing component's deliberate checkout-buyer
FK change to `RESTRICT`; it must not reinstall production's original cascade.

Cleanup locks those source writers through its decision and holds if this
member still has related records and terms evidence. It does not erase or
modify those records or invent a legal retention period. Their full retention,
anonymization and necessary proof handling remain required before activation.

A narrow writer guard allows existing reservations and operational updates
with unchanged ownership to continue. For a pending member, a new retained
reference can arrive while terms proof still exists, causing cleanup to hold.
An existing retained relationship also permits operational additions for legacy
members who never accepted the newer shopping terms. Once proof and all
reviewed retained relationships are gone, a new reference cannot attach. The source table locks order
the insert and cleanup decision. Existing order and sourcing validation guards
are preserved. This is coordination for evidence retirement, not a new payment
or claim authorization path.

The existing anonymous consent expiry remains 90 days for genuine `g:` guest
subjects. It no longer treats historical canonical account subjects with a
null FK as anonymous consent. Unknown historical anonymous payloads still need
their explicit classification; this is not an indefinite retention policy.

## Bounds and verification

One call changes at most 100 physical rows from one source. Consent ledger rows
are removed before native ad choices and the account row. The service-only
adapter freezes identity/lease fields, sets a 15-second deadline, disables SDK
retries and sanitizes failures. An explicit retry discovers remaining work
after an acknowledgment is lost.

Installation requires a disabled worker and current predecessor boundaries,
exact consent columns/defaults/keys, no unknown children or source hooks,
captured function definitions/configuration/ACLs, and the reviewed retention
projection. Runtime contracts cover the consent schemas, permissions, policies,
hooks, indexes and callbacks, plus the added retention guards. The only
predecessor refreshes are the reviewed checkout writer hook and anonymous
maintenance predicate. Timestamp-default deparsing uses UTC so a local session
timezone cannot manufacture schema drift. Unknown completion hooks cannot be
adopted through those refreshes.

Fixtures use captured consent relations and callbacks with synthetic member
content. Retention fixtures reconstruct only the captured owner columns and
Auth relationships; predecessor order/sourcing fixtures keep their captured
definitions. Other financial/audit payload fields and live providers are not
reproduced, so these tests do not establish the full retention policy or full
financial workflow.

Focused tests cover bounded target-only removal, canonical historical owners,
unchanged guest/other-account records, real pending declines, rejected renewed
consent, terms holds, guest maintenance, identity-phase draining, drift/expiry
refusal, independent read-only verification and actual SDK acknowledgment loss.
The required real PostgreSQL gate observes both ordering directions, concurrent
workers, late declines versus Auth removal, retained-reference races and lease
expiry with rollback. The captured payment finalizer also settles and replays
for both pending buyer and seller deletion, including a legacy buyer without
new shopping terms, without reviving the target's notices or learning. No Stripe
request is made. Hosted results and production installation are reported
separately.

Remaining launch work includes financial/moderation/claim/audit retention,
historical anonymous payloads and shared assets, actual provider erasure,
authorization/identity composition, and the independent full-flow rehearsal.
Device push, native advertising permissions, beta and owner/store release
checkpoints remain required as well.

Local validation passed: eight focused consent tests, both earlier shared
permission integration tests, seven tests across the real PostgreSQL consent
and settlement gates, TypeScript, targeted lint, production build, formatting
and diff checks. The full regression suite passed 1,812 tests with 17 skipped
and no failures. Hosted checks and production installation remain separate.
