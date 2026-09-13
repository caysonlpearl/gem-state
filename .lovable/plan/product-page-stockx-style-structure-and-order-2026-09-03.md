# Product page: StockX-style structure and order

Rebuild the `/products/$slug` page so the buy box is simple, used listings and Park Shopper sourcing sit immediately beside/below it, and everything else follows in a clean, predictable order — on both mobile and desktop. Presentation only: no changes to market logic, fees, checkout, or sourcing rules.

## Section order (top to bottom)

1. Breadcrumb (desktop only)
2. Gallery
3. Title block: product name, variation subtitle, condition/resort chips
4. Variation selector — a single compact control row (like StockX's "Size" row)
5. **Buy box** (simplified): current lowest Ask price, one primary "Buy Now" button, and a thin footer row with Last sale · Highest bid · "Market data" link that opens the existing drawer. Secondary actions (Place bid, Watch) sit as small links under the button, not as competing buttons.
6. **Used listings** — the seller listing grid, labelled "Shop used listings", as a compact horizontal row on mobile, grid on desktop
7. **Park Shopper sourcing** — "Have a shopper get this in park", directly adjacent to used listings (side by side on desktop, stacked right after it on mobile)
8. "Sell this item" / "Offer to source this" entry pills
9. Collapsible trust/policy accordions: Pilot transaction details, Cancellation & refunds, Non-affiliation
10. Product details table (style/SKU, category, release type, release date, retail reference, availability) + description with Read more
11. Price history + historical data (existing honest empty states preserved)
12. In-park sightings
13. Catalog facts and reference sources
14. **Trust badge cards** — three dark cards near the page bottom, in ParkVault's own honest wording (no StockX copy): "Buyer protection" (what the pilot actually guarantees, linking to the refund policy), "Condition stated by seller" (no ParkVault authentication is claimed), and "Start selling" / "Become a Park Shopper" with links to the existing pages
15. "Suggest a product" footer line


## Layout

Desktop (`lg+`): two columns. Left column = sticky gallery. Right column = title, variation, buy box, then used listings and sourcing as a two-up row. Sections 8–14 run full width below the fold in the order above.

Mobile: single column in the same order, plus a sticky bottom bar showing "Buy now for $X" with the Buy Now button (matching the screenshots), hidden once the page's own buy box is on screen. Used listings become a horizontally scrollable row; sourcing shoppers a compact stacked list.

## Technical notes

- `src/routes/products.$slug.tsx` is restructured into small local sections; the current duplicated mobile/desktop title, details and evidence blocks collapse into one set rendered once.
- `MarketPanel` is split visually: a lean `BuyBox` presentation wrapping its existing buy/bid mutations, with the ask/bid forms moved into a disclosure so the default state is one price + one button. No changes to `market.functions.ts`.
- `ActiveSellerListings` and `SourcingOptionsPanel` get a compact variant prop for the side-by-side placement; their data and copy rules stay as they are.
- Existing accordions reuse `<details>` with consistent styling; a shared `Accordion` local component keeps them uniform and keyboard accessible.
- Sticky mobile bar uses an `IntersectionObserver` on the buy box, `pb` padding to avoid content clipping, and respects `prefers-reduced-motion`.
- No StockX copy, icons, or imagery is reproduced — structure and ordering only. Honest empty states, demo labelling, and pilot disclosures are preserved verbatim.
