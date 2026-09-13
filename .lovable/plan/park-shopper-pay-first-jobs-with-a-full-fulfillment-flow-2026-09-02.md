# Park Shopper: pay-first jobs with a full fulfillment flow

Today a shopper request creates an order with no payment, the shopper gets no job queue, and there is no purchase/ship/deliver path. This makes Park Shopper work like the seller side: buyer pays first, then the job appears for the shopper, who shops, confirms, ships, and gets paid.

## The new flow

1. **Buyer checks out first.** Selecting a shopper no longer creates a live job. It creates a reserved order and sends the buyer to Stripe checkout, exactly like buying a listing: delivery rates are quoted against the shopper's ship-from address, and the buyer pays item cost + buyer fee + shipping. The buyer's approved maximum stays a ceiling, not the charge.
2. **Job appears only after payment.** On payment confirmation the order becomes a live shopping job, the shopper gets a notification, and it shows under "Shopping jobs" on the Park Shopper page. Nothing reaches the shopper before money is confirmed.
3. **Shopper works the job.** Buttons in sequence: "I'm shopping for this" → "I bought it" (enter actual paid price + receipt photo) → shipping panel (buyer's address and label/tracking, visible only after payment) → "Shipped".
4. **Price differences.** If the actual in-park price is above what the buyer was charged but within their approved maximum, the buyer is asked to pay the difference before the item ships. Above the maximum, the job stops for operator review. If the item cost less, the difference is refunded.
5. **Item unavailable.** The shopper marks it unavailable; the order cancels and the buyer's full charge (item, fees, shipping) is refunded automatically.
6. **Buyer closes the loop.** Same as a seller purchase: track shipment, confirm it arrived, leave the shopper a review, open a dispute from purchase history if needed.

## Fees

- Buyer fee is unchanged from today's launch schedule (3.5%, $1.99 minimum).
- The item's purchase cost is reimbursed to the shopper in full.
- ParkVault keeps **10% of the shopper's flat service fee**; the shopper is paid the remaining 90% plus the item cost.
- The fee split is snapshotted onto the order at checkout so it can never drift, and payouts remain manual and capped at the snapshotted shopper payout — no funds route to the shopper automatically.

## Shopper requirements

A shopper does not appear as a sourcing option until they have saved shipping details (ship-from address and defaults), the same gate sellers pass. Existing shoppers see a clear prompt on the Park Shopper page and are hidden from product pages until it is complete.

## Shopper dashboard

The Park Shopper page gains a jobs dashboard mirroring the seller dashboard: tabs for Active jobs, Shopping now, Purchased, Shipped, Completed, and Cancelled, each row with a product thumbnail, buyer max, your fee, payout, and deadline; plus payout summary tiles (pending payout, paid out, completed jobs) that count only paid, non-abandoned jobs.

## Technical outline

Database migration:
- New `start_sourcing_purchase` behaviour: create the order in a reserved, unpaid state (no assignment activation, no shopper notification), with fee snapshot using buyer fee + 10% of the shopper flat fee and `payout_cents` = item cost + 90% of flat fee.
- `reserve_sourcing_order_for_stripe` / release counterpart mirroring the exact-ask reservation functions, so abandoned shopper checkouts free the shopper's capacity slot.
- Extend `finalize_stripe_order_payment` to activate the sourcing assignment, insert the shopper notification, and move status to `shopper_assigned` on payment.
- New shopper action functions: `shopper_start_shopping`, `shopper_confirm_purchase` (actual price + receipt evidence, computes over/under against buyer max), `shopper_mark_unavailable` (cancel + flag refund), reusing the existing `record_shipment`, `confirm_delivery`, `submit_order_review`, and dispute functions.
- Only require shopper coverage plus a completed shipping profile in `sourcing_options`.
- All new functions: SECURITY DEFINER, fixed `search_path`, `auth.uid()` identity, role checks, audit events, rate limits, anon execution revoked; inventory added to `docs/security-inventory.md`.

Server functions and UI:
- `stripe-marketplace.functions.ts`: sourcing shipping quotes + `startSourcingCheckout` and a top-up checkout for price differences; automatic refund path on unavailable/overpay via Stripe refund.
- `shopper.functions.ts`: job list with thumbnails and signed receipt URLs, shopper action mutations, payout summary.
- `SourcingOptionsPanel.tsx`: address + delivery rate step, then redirect to Stripe instead of instantly creating a request.
- New `src/components/shopper/ShopperJobsDashboard.tsx` and a shopper order panel mirroring `SellerOrderPanel`, wired into `/shopper` and `/orders/$orderId`.
- Buyer order page: sourcing orders use the standard paid receipt, shipment tracking, delivery confirmation, and review card instead of the current "no payment taken" screen.

Unchanged: no negotiation or messaging, no custom sourcing requests or shopper quotes, honest disclosures, no fabricated activity.
