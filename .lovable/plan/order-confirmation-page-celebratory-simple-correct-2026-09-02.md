# Order confirmation page: celebratory, simple, correct

## What's wrong today

Two separate problems are tangled together on this page.

**1. The page is an internal operations console, not a buyer receipt.** It renders every field the system tracks — fee schedule label, payment-authorization state, payout policy, dispute form, raw status-event log — to both buyer and seller, in one flat stack of identical boxes. Nothing celebrates the purchase.

**2. Your test order was never actually confirmed.** Verified in the database: the order from your screenshot (PV-0CFA92E94B) sat at `awaiting_payment` with `stripe_payment_status = checkout_open`, then expired and is now `cancelled`. No Stripe webhook event was recorded for any of today's checkout attempts (the most recent recorded `checkout.session.completed` is from yesterday). So the page was telling the truth — it just told it in the worst possible way, and the underlying reason is that the confirmation signal never arrived. Both parts get fixed.

## Part 1 — Confirm the payment on return from checkout

Today the order only flips to paid when Stripe's webhook arrives. When the webhook is delayed or not delivered to the environment you're testing on, the buyer lands on a page that says "awaiting payment" after they just paid.

Add a return-path confirmation: when the buyer arrives at `/orders/:id?checkout=success`, the page calls a new authenticated server function that retrieves the Stripe Checkout Session for that order and, if Stripe reports the payment succeeded, runs the same existing `finalize_stripe_order_payment` routine the webhook uses. Idempotent, so webhook-then-return or return-then-webhook both settle to one paid order. While Stripe still reports the session as open, the page shows a short "Confirming your payment…" state rather than "awaiting payment".

The webhook stays exactly as it is — this is a second, buyer-facing path to the same result.

## Part 2 — Rebuild the buyer view as a receipt

The page becomes role-aware. The buyer sees a confirmation; the seller keeps a fulfillment view; operators keep the admin console (unchanged, at its own route).

**Buyer, paid order:**

```text
        ✓  ORDER CONFIRMED
        PV-0CFA92E94B

  [item photo]  Tim Burton's ... Souvenir Cup
                Multicolor · 25th anniversary release
                $75.00

  ── Arriving ──────────────────────────
  Estimated Sep 8 – Sep 12
  test, test, TE 83301
  Tracking appears here once the seller ships

  ── What you paid ─────────────────────
  Item                            $75.00
  Buyer protection & shipping      $12.58
  Total                            $87.58
                    Paid with card •••• 4242

  ── What happens next ─────────────────
  1 Seller ships the exact photographed item
  2 Tracking is emailed to you
  3 You confirm delivery

  [ View my purchases ]   Need help with this order?
```

Removed from the buyer view entirely: fee-schedule label, "payment authorization", payout/seller-proceeds box, the dispute form, and the raw status-event log. Fees collapse into one "Buyer protection & shipping" line (the breakdown stays available under a small "Fee details" disclosure for transparency).

**Dispute moves out.** The dispute form only renders from the buying history for a shipped/delivered order, behind a "Need help with this order?" link — not on the confirmation.

**Order history box** becomes a plain progress tracker (Confirmed → Shipped → Delivered) with dates, not a duplicate event dump. Internal status strings like "checkout not enabled" disappear from buyer-facing labels; that language belongs only to operator screens.

**Not-yet-paid / cancelled states** get honest, calm single-message screens ("This reservation expired — the item is back on the market") instead of the operations grid.

**Celebration** stays restrained and on-brand: dark teal panel, large confirmation lockup, cream/orange accent, one subtle entrance animation that respects `prefers-reduced-motion`. No confetti.

## Technical notes

- `src/routes/_authenticated/orders.$orderId.tsx` splits into a buyer confirmation/receipt view and a seller fulfillment view; shared rows extracted to small components.
- New server function in `src/lib/stripe-marketplace.functions.ts` (auth-required, verifies the caller is the order's buyer) that retrieves the session and calls the existing `finalize_stripe_order_payment` RPC via the admin client. No schema changes, no new tables, no new privileged SQL functions.
- `src/lib/market.functions.ts` `getOrder` extended with the fields the receipt needs (card brand/last4 if recorded, shipping ETA from the stored shipping-rate snapshot, product image).
- Buyer-facing copy in `src/lib/market-labels.ts` gains a separate buyer label map; existing operator labels stay untouched.
- `OrderOperations` keeps the seller/shipment and dispute UI, but the dispute block is gated to shipped-or-later and rendered from the purchase-history path.
- Payment-confirmation and payout claims stay accurate: nothing says "escrow" or "funds held".

## Still blocked (unchanged)

Live Stripe remains in test mode; automatic tax is off until a Stripe head-office address is registered. Product photography and legal review of policies remain launch blockers.
