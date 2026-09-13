# Launch priority fixes

## Implemented

- Verify the original Checkout Session and all captured payment funding before
  any seller or shopper transfer, including payouts spanning receipt adjustments.
  Reject mixed test/live mode, wrong order adjustments, disputes, uncaptured
  payments, and insufficient net funding after refunds.
- Reserve one active tip per order before creating Stripe Checkout. Freeze the
  request and reuse its idempotency key. Bind the paid session before transfer;
  refund unexpected duplicate sessions. Reconcile transfers on retries.
- Require stored payout readiness when creating shopper orders or beginning
  shopping. Verify the Connect account in the current Stripe mode before
  opening paid checkout and before starting a shopping job.
- Add a private shopper shipping form using the existing shipping fields.
  Does not approve seller status or change identity, bio, or payout account.
- Apply live-only public sales filtering, preserving the sandbox sale and all
  underlying financial and audit records. Readback: one nonlive sale retained,
  zero public live sales; no historical snapshot referenced the sandbox sale.

## Verification

- Nine payout helper tests passed (six relevant existing regressions plus three
  new test groups). No new Stripe transaction was created for these checks.
- Tip reservation/retry/frozen parameters, duplicate session rejection, the
  unique active-tip constraint, paid-work gate, and shopper address saving passed
  in a transaction that was rolled back. Test fixture updates were not committed.
- TypeScript and production build passed.
- Three tip/readiness/shipping migrations and the sandbox-sales migration applied.
- Post-transfer refund passed through the authenticated admin UI, independently
  checked in Stripe Test dashboard and the database. Existing order PV-420CCF8344
  was refunded $56.94 (re_3UCO7qEb2KTmmJmL0bdAw7dI), after fully reversing its
  $40.50 transfer (tr_3UCO7qEb2KTmmJmL0FaswpWg). App order is refunded, payout
  reversed, dispute resolved_buyer, and payment/refund evidence both succeeded.
  No new sale, transfer, or real charge was created for this regression.
- Live Stripe Tax locations showed Idaho collecting, Enable Tax / Start collecting /
  Configure Tax complete. Filing not set up. No settings or registrations changed;
  filing responsibility was requested from the owner. This is configuration
  evidence, not confirmation of legal registration coverage or a live taxed sale.
- Tax mode now handles standard and restricted keys explicitly, rejecting missing
  or unknown keys. Three dedicated tests passed.
- Private order history distinguishes test sales from public market history.
- New Shipping setup form verified on https://getparkvault.com/shopper after
  signing into the authorized admin/shopper account. Existing private shipping
  data loaded with method and handling time; no address change was made in UI.

## Remaining verification

- Owner's tax filing decision and confirmation of applicable registration coverage.
- Taxed production checkout / receipt-balance behavior has not been exercised with
  a real payment; current application payment testing remains sandbox-only.
- New tip concurrency was checked at the database level, not with two paid
  Stripe sessions; no duplicate charge was deliberately created.
- No inbox/email or catalog-rights work; Lovable security findings remain deferred.
