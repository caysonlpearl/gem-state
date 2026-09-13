# ParkVault privileged-surface inventory (Phase 8)

Generated from live database introspection. Update this file whenever a
privileged function, view, or storage policy is added or changed.

## Finding-count reconciliation

| Checkpoint | Reported findings | Composition |
| --- | --- | --- |
| Phase 6.5 close | 31 | 1 RLS-enabled/no-policy table, 3 SECURITY DEFINER views, 27 authenticated-only definer functions |
| Phase 7 close | 50 | 1 RLS-enabled/no-policy table, 3 definer views, 46 authenticated-only definer functions |
| Phase 8 | 53 | 1 RLS-enabled/no-policy table, 6 definer views, 46 authenticated-only definer functions |

The 31 → 50 increase is entirely Phase 7 trust-operations functions (+19
definer functions): external payment and payout recording, order state
advancement, purchase/shipment/delivery evidence, revised-maximum approval,
verified-sale confirmation, dispute handling, reviews, notification reads and
their supporting predicates. No table lost a policy and no function was opened
to anonymous callers.

The 50 → 53 increase is the three anonymous market-depth views added in
Phase 8 (`variant_ask_depth_public`, `variant_bid_depth_public`,
`variant_verified_sales_public`). They project price, currency, quantity,
condition and sale date only — never a member id, note, address, evidence
reference or storage path — and exclude demonstration rows.

## Current posture (verified by query, 2026-09-03)

- SECURITY DEFINER functions in `public`: 105
- Executable by `anon`: **7**. All seven are identity-free public aggregates
  or storefront reads (e.g. `sourcing_options`, `member_performance`,
  `public_shopper_profile`, `shopper_public_reviews`) — reviewed individually
  and confirmed to return only non-PII fields (ratings, counts, public
  profile text), never a member id, address, evidence reference or private
  column. This number grows as public storefront/browse surfaces are added;
  each addition should be reviewed the same way, not treated as a default-0
  target.
- Tables in `public` without RLS enabled: **0** (62 RLS-enabled tables)
- Views in `public`: 8, all identity-free projections (catalog/market
  aggregates, depth views, and the seller/shopper public storefront views).
- RLS-enabled tables with no policy: 1 — `rate_limit_events`. Intentional: it
  is written and read only by the definer function `enforce_rate_limit`, so no
  client role may read or write it. Deny-by-default is the desired behaviour.

The function/view/table counts above are the ones worth re-running
periodically; the Phase 6.5/7/8 checkpoint table below is left as historical
context and is no longer being kept in lockstep with every change.

## Rationale for SECURITY DEFINER

Every definer function exists for one of four reasons, all of which require
privileges the calling member does not hold:

1. **Atomic multi-table transitions** (`buy_now`, `sell_now`,
   `start_sourcing_purchase`, `accept_shopper_quote`): lock rows, write orders,
   matches and append-only events in one transaction. Members cannot write
   those tables directly.
2. **Append-only audit integrity** (order/ask/bid/match/sourcing event writes,
   `admin_*` operations): members and even staff cannot insert or amend audit
   rows by hand.
3. **Role predicates** (`has_role`, `is_staff`): must read `user_roles`
   without recursive RLS. Kept executable by `authenticated` so policies can
   call them; they return booleans only.
4. **Scheduled maintenance** (`capture_price_snapshots`,
   `expire_shopper_availability`, reservation release): granted to
   `service_role` only, never to `authenticated` or `anon`.

Authorization inside each function is derived from `auth.uid()` plus a role
check where applicable; ownership, self-match prevention, status, currency and
funding gates are re-validated server-side and fee/price snapshots are frozen
in the same transaction.

## Known blockers (not security findings)

This section previously said live checkout, card authorization and automated
payouts were not implemented, and that policy text needed legal review before
launch. Both are now false and were actively misleading anyone using this
file as launch-readiness evidence — checkout runs through real Stripe
PaymentIntents/Checkout Sessions confirmed server-side via a verified
webhook, refunds call the Stripe refund API, seller/shopper payouts transfer
to real Stripe Connect accounts, and the policy pages no longer carry a
pending-review banner. Update this section again the next time either of
those actually regresses — don't let it silently drift stale a second time.

Current known gaps, as of 2026-09-03:

- No automatic trigger sends a payout after a completed order — an admin
  manually initiates each Stripe transfer from the order console.
- No delivery-confirmation reminder if a buyer never confirms receipt.
