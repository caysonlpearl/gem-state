# Seller order page: a clear sale view, not an operations dump

## What's wrong today

The seller sees the same generic operations stack the buyer used to see. Confirmed in the code:

- The status banner uses operator wording from the shared label map — `awaiting_payment` renders as "Awaiting payment (checkout not enabled)", which is stale, internal language.
- A "Payment" ledger box always renders (`showPaymentLedger` defaults to true), so before settlement it just says "Payment has not been confirmed yet." twice over.
- "Purchase evidence" renders for every seller, but its copy is written for park-sourced shopping ("Upload the purchase receipt… actual amount on the receipt"). For a normal seller listing their own item, a receipt and a purchase amount are meaningless — that form only belongs to sourcing orders (`origin` starting with `sourcing_`).
- "Shipping and delivery" renders even when there is nothing to do yet: no shipment, no payment, but it still shows the buyer's address and empty controls.
- "Dispute" renders unconditionally (`showDispute` defaults to true), inviting the seller to open a dispute on an unpaid order.

## The new seller view

Same restrained aesthetic as the buyer receipt, staged by what the seller can actually do right now.

**Before payment settles (awaiting payment / reserved):**

```text
        ITEM RESERVED
        PV-354A1BE52B

  [photo]  Tim Burton's ... Souvenir Cup
           Multicolor · 25th anniversary release

  The buyer is completing checkout. Nothing to do yet —
  if their reservation expires the item returns to the market.

  ── Your sale ─────────────────────────
  Item                          $75.00
  Seller fee                    -$7.50
  Shipping                       $9.95
  Your payout                   $67.50

  [ Selling dashboard ]
```

No payment ledger, no evidence form, no address, no shipping controls, no dispute box.

**After payment settles (paid / captured / ready to ship):**

```text
        SOLD — SHIP THIS ITEM
        PV-354A1BE52B

  [photo]  item name · variation

  ── Ship to ───────────────────────────
  Name, address                Ship by Sep 5
  Buyer's payment is confirmed.

  ── Record your shipment ──────────────
  carrier / tracking / service   [ Record shipment ]

  ── Your payout ───────────────────────
  $67.50 · released after delivery and the review window
```

Once shipped: tracking, status, delivery timeline, and "Need help with this order?" revealing the dispute form. Disputes never appear before shipment.

**Cancelled / expired / refunded:** one calm message ("This reservation expired — your listing is active again"), no operations grid.

## Rules applied

- Seller-facing status wording gets its own honest labels ("Reserved — buyer is checking out", "Sold — ready to ship", "Shipped", "Delivered", "Completed"). Operator label maps stay untouched for admin screens.
- The purchase-evidence form renders only for `sourcing_*` orders, where a shopper really did buy the item in a park. For ordinary seller listings it disappears entirely.
- Shipping/address block renders only once payment is confirmed — the seller has no reason to see the buyer's address before that.
- Payment ledger stays off the seller view; payout is stated as a single plain line, with existing accurate "released after delivery" wording (no escrow claims).

## Technical notes

- `src/routes/_authenticated/orders.$orderId.tsx`: the seller branch splits into staged views (pending / active sale / closed) mirroring the buyer split, reusing the product-photo header pattern from `BuyerOrderReceipt`.
- New `src/components/orders/SellerOrderPanel.tsx` for the seller header + sale-breakdown block.
- `OrderOperations` gains gating so the evidence form is sourcing-only and the shipping section is payment-gated; `showDispute` is passed false until the order is shipped or later. No changes to its mutations or server functions.
- `src/lib/market-labels.ts` gains a seller-facing label map alongside the existing operator map.
- Presentation only: no schema changes, no new SQL functions, no changes to payment or payout logic.
