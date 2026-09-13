# Seller dashboard cleanup

Rebuild the Seller Center dashboard so it reads like eBay/Mercari/StockX seller hubs: clear listing states, real sales only, and payout numbers that mean something.

## What's actually going on (verified in your data)

Your account has 6 listings and 15 seller orders:

- Listings: 1 awaiting approval (Headless Horseman bag), 3 sold/matched (Pain & Panic clip, 25th Anniversary Cup, Popcorn pin pack), 2 cancelled (older Popcorn pin listings). Today they are all dumped in one flat list, so sold and cancelled ones look "generic".
- The 25th Anniversary Cup appears 8 times because 8 checkout sessions were started against that one listing and 7 were cancelled/abandoned. Only the most recent attempt is live. These are abandoned checkouts, not 8 sales.
- 3 of your orders are Park Shopper sourcing orders (Headless Horseman bag x2, glow ear headband). They are already excluded from the sales list but nothing on the page tells you where they went.
- Payout boxes: you have exactly one payout record, $40.50 pending. "Completed purchases" counts only orders that reached the `completed` status, which is 0 — hence the confusing zeros.

## What changes

### Listings section — tabbed by state

Tabs with counts, defaulting to Active:

- **Active** — live and approved, with price, photo count, highest offer, Edit / Take down.
- **Awaiting approval** — submitted listings and missing-product submissions still in review.
- **Sold** — matched listings, each linking to the sale it produced.
- **Removed** — cancelled or expired, with Relist.

One listing row style everywhere, showing thumbnail, product, variation, price and the state-appropriate actions only.

### Sales section — real sales only

- Show one row per sale that actually reached payment or beyond (paid, shipped, delivered, completed, disputed, refunded), newest first, with sale price, your payout, and the buyer-safe status wording already used on the order page.
- Group in-progress checkouts separately as a small "Reserved — buyer is checking out" strip that shows only the current live reservation per listing.
- Cancelled/abandoned checkout attempts stop appearing on the dashboard entirely. They stay in the database and remain visible on the listing's own history.

### Park Shopper section

Sourcing orders where you are the fulfilling shopper get their own labelled block with a link to Park Shopper, so they never look like storefront listings.

### Payout summary — three honest numbers

Replace "Pending payout / Completed purchases / Paid out" with:

- **Awaiting payout** — payouts recorded as pending or processing.
- **Paid out** — payouts released to you.
- **Items sold** — count of sales that reached payment or later (not just `completed`).

Each with a one-line explanation of when money moves. No projected or hypothetical amounts.

### Top metrics row

Active listings · Awaiting approval · Sales to ship · Awaiting payout.

## Technical notes

- Frontend rework in `src/routes/_authenticated/selling.tsx` plus small presentational components; no schema changes.
- `getSellerDashboardSummary` in `src/lib/seller.functions.ts` gains a sold-count derived from paid-or-later statuses instead of `status = 'completed'`, and returns per-sale rows already filtered server-side.
- Listing/sale grouping and status filtering happen in one place so the sections cannot disagree.
- Reuse `sellerStatusLabels` from `src/lib/market-labels.ts`; no operator/internal vocabulary in seller-facing copy.
- Keeps the existing thumbnails/photo counts, offers panel and reviews panel intact.
