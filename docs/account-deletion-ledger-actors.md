# Accounting authorship during account deletion

This batch is source only. It depends on the business-claim deletion batch and
does not enable the worker, delete an Auth account, or complete account deletion.

Payment and payout records contain `recorded_by` account identifiers without an
Auth foreign key. The migration makes those two fields nullable and retires them
in leased batches of at most 100 rows from one table per call. Amounts, dates,
provider references, notes, orders and payout recipients remain intact.

The existing trusted-operation guard and client access policies remain in force.
The new writer hook uses the shared account lock: existing writes commit before
withdrawal, and a valid later settlement records no withdrawn or missing author.
Other errors remain errors. The captured payment finalizer is exercised in tests,
including incorrect totals and repeated callbacks; this migration does not
replace that finalizer.

The service-only adapter disables automatic RPC retries, freezes job scope and
returns only bounded progress. A lost response can be retried against remaining
rows. Independent verification requires the verification phase and removal of
Auth, through the predecessor's existing lease and account checks.

Profile erasure and completion also check payout `payee_id`, which has no Auth
foreign key. This batch preserves that identity and keeps completion blocked;
financial-party handling and any retention exceptions still need implementation
and review. Keeping notes here is not a conclusion that every note may be kept
indefinitely. This batch establishes no blanket financial retention period.

Before installation, inspect the owning production project's current metadata,
confirm the worker is disabled and review the full migration composition. The
migration checks captured columns, relationships, policies and the existing
writer hook before changes, then pins the resulting access and schema contract.
The captured fixture did not include table ACLs; tests state their synthetic ACLs
explicitly. Live installation and full account deletion are not verified by these
fixture tests.

Validation:

- `node --experimental-strip-types --test tests/account-deletion-ledger-actors.test.mjs`
- `BLUEBIRD_DELETION_PG=1 node --experimental-strip-types --test tests/account-deletion-ledger-actors-concurrency.test.mjs`
- The shared CI database gate also runs the prerequisite business-claim concurrency test.
