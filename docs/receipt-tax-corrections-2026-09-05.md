# Receipt tax corrections

- Stripe live Tax fallback changed from electronically supplied services to General - Tangible Goods (`txcd_99999999`); saved setting verified in Dashboard. Idaho registration unchanged. Automatic filing not enabled.
- Additional receipt-balance checkout now creates an order-scoped Stripe customer with the original order delivery address. Card billing collection cannot replace that shipping tax location.
- Taxed receipt decreases require a server-created Stripe Tax calculation, tied to the original paid checkout, payment, tax snapshot, delivery address and original tax date. Missing, stale or inconsistent calculations fail closed.
- The database atomically applies reduced merchandise, platform fee and tax, includes the tax difference in the buyer refund, and pays the shopper only actual merchandise plus their service earnings.
- Exact receipt retries are idempotent. Stripe refund metadata supports recovery after idempotency-key expiry; pending or mismatched refunds are not marked complete. Large partial receipt refunds no longer incorrectly mark the entire order refunded.

## Verification

Five focused Node tests passed. Database assertions ran in an isolated, rolled-back schema: a 200-cent merchandise decrease plus 12-cent tax decrease produced a 212-cent refund; the 799-cent platform fee remained separate, shopper payout was 4,800 cents, and repeated receipt/refund finalization did not duplicate records. Direct receipt confirmation without a verified tax quote was rejected.

Type checking and production build passed. These are code, mocked Stripe and database tests, not a real-money tax transaction. Existing completed payment/payout tests were not repeated.

## Reporting boundary

ParkVault stores the exact tax adjustment and Stripe calculation ID in its order fee snapshot. Historical calculations outside Stripe's supported tax-date window require review rather than guessed tax.

### September 6: actual sandbox Stripe accounting check

The focused sandbox test found a reporting mismatch in the existing Refund API route. On a $71.47 payment ($50 merchandise, $7.99 platform fee, $10 tax-exempt shipping, $3.48 tax), a $2 merchandise reduction recalculates tax to $3.36. The correct buyer refund is $2.12. Stripe refunded that cash amount successfully but its automatic proportional tax reversal recorded only $0.10 tax, not $0.12. The original shipping address remained Idaho despite California card billing, confirming the saved-shipping approach in Stripe. This was a direct Stripe fixture, not another application end-to-end sale/payout test.

Stripe rejected direct Tax API access to its Checkout-managed tax transaction (`standalone_tax_api_transaction_managed_by_stripe`); do not add a separate reversal that could double-count the refund.

A second, invoice-backed sandbox checkout tested a merchandise-line credit note. Its $2.12 total contained exactly $2 merchandise and $0.12 tax. Stripe Tax Transactions recorded exactly one corresponding $0.12 credit-note tax reversal. Evidence and identifiers are in `tests/evidence/2026-09-06-receipt-tax-stripe.json`.

### Approved application integration

The user approved the 0.4% post-payment invoice cost (capped at $2 per invoice). New Park Shopper sourcing checkouts now request an itemized invoice; seller checkouts, tips and balance checkouts do not enable this added feature. Stable component tags and Stripe price IDs map merchandise and platform fees to their original invoice lines. Refund quotes preview a credit note against those original lines rather than creating a new tax calculation. Credit-note creation issues the buyer refund and tax reversal together; no separate Refund API call is made. Receipt retries find the same credit note by metadata and verify its exact amounts and succeeded refund, including recovery from a lost creation response.

Old untaxed orders retain the existing metadata-idempotent refund path. Old taxed non-invoice orders fail closed with an administrator-reconciliation message instead of silently producing a mismatched Stripe tax report. Existing orders cannot acquire itemized invoice support retroactively. No automatic tax filing or Stripe key-mode change is part of this update.

The revised focused tests cover exact tax allocation, both merchandise and fee reductions, original line identity despite reordered results, legacy and wrong-mode failures, previous adjustments, pending refunds, mismatched amounts, and lost-response recovery. Production publication is verified separately after build and push.

Primary references: https://docs.stripe.com/api/credit_notes/create ; https://docs.stripe.com/tax/reports ; https://stripe.com/pricing . These sandbox results do not constitute a real-money test or verification of every jurisdiction, mixed rate, or rounding edge case.
