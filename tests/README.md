# Transaction regression checks

Database concurrency tests use a private `parkvault_qa_20260905` schema, with
synthetic identities and Stripe identifiers. The deployed function definitions
are copied with only table/function schema references redirected to the private
tables. No Stripe calls or public orders are created by these checks.

These exercise PostgreSQL reservation/ledger behavior, not the full browser-to-
Stripe chain. Sandbox payout and checkout evidence must be recorded separately.

The QA tables copy column constraints and indexes, but not public triggers or
foreign keys. Tests therefore do not substitute for production-schema or Stripe
end-to-end tests.

Run the mocked Stripe transfer regression suite with `npm run test:payments`.

To reproduce the database tests through an authorized database connection:

1. Run `setup-transaction-qa.sql`, then `concurrency-helpers.sql`.
2. In two concurrent connections run `SELECT parkvault_qa_20260905.try_offer(1,20)`
   and `SELECT parkvault_qa_20260905.try_offer(2,20)`. Exactly one must succeed;
   the other must reject the unavailable listing after waiting on its lock.
3. In two concurrent connections run `SELECT parkvault_qa_20260905.try_balance(1,20)`
   and `SELECT parkvault_qa_20260905.try_balance(2,20)`. Both must return the same
   checkout ID and attempt. Check elapsed times to prove actual overlap.
4. Run `assert-balance-retries.sql` and `assert-balance-tax.sql`.
5. Read `parkvault_qa_20260905.results` and preserve results before cleanup.

The schema name is intentionally fixed: setup refuses to overwrite an existing
run. Only an operator may remove that exact disposable QA schema before rerunning.
Recorded September 5 results are in `evidence/2026-09-05-transaction-checks.json`.

Outstanding verification: real Stripe concurrent Checkout Session creation and
fault injection across the browser/server/Stripe boundary, production tax
configuration, bank payout timing, and the remaining launch audit items.
