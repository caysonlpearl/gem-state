# Release follow-up — September 5

## Existing evidence reused

No new checkout, capture, refund, or payout transaction was created for this
follow-up. The earlier six payout regressions, sandbox seller transfer, and
database concurrency results remain recorded in tests/evidence.

## This change

- Counteroffer fee totals and response are one database transaction. Uses the
  actual calculator keys total_cents and payout_cents. Card-hold release runs
  only after the response commits. Failed releases remain cancel_pending and
  are reported, not falsely marked canceled. Operators must monitor/retry those
  pending releases; there is not yet an automatic Stripe cancellation worker.
- Review-request emails have a registered template, leased queue worker,
  bounded retries and provider idempotency. Only completed live orders with
  the matching buyer and no existing review qualify. A one-use worker token
  gates scheduled calls; browser roles cannot mint tokens or claim work.
- Public catalog-media delivery requires an approved canonical image linked
  to a published product. Only raster image MIME types are served.
- Shopper job thumbnails preserve existing absolute and root-relative URLs.

## Targeted validation

- Three new offer-response unit cases passed.
- Counteroffer database assertions passed in the existing isolated QA schema;
  fixture changes rolled back. $50 counter: $51.99 before shipping/tax,
  seller payout $45 under the currently configured fee schedule.
- Two review eligibility unit cases passed.
- Email worker token, replay rejection, role permissions and duplicate-claim
  assertions passed transactionally. No email was sent by those assertions.
- Published endpoint rejects unauthenticated POST with HTTP 401. A signed
  database dispatch processed the single existing sandbox queue entry once
  and marked it skipped. No live recipient was emailed. Five-minute retry
  scheduling is enabled; actual inbox delivery is not verified by this check.
- Production build and TypeScript checking passed for this release. Lovable
  reported the new commit ready; the new worker endpoint is live on the custom
  domain. Historical unsuccessful-build cards did not reflect publish status.
- Sales-mode migration passed a transactional dry run. Applying it requires
  the specifically requested database approval; do not infer it was applied.

## Still open

- Custom shopper quotes still use the unpaid pilot acceptance path.
- The proposed broad database-view permission restructuring was not applied.
  Existing definer projections need a narrowly reviewed replacement; do not
  turn them into invoker views blindly, since private source tables use RLS.
- Production Stripe tax configuration and the previously recorded distinct
  Stripe concurrency/after-transfer refund gaps remain unverified.
- Catalog-photo licensing and remaining security/dependency findings remain.
