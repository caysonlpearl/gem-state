# Watcher counter beside the product page heart

Add a visible "N watching" counter next to the follow/heart control in the product page action panel.

## What the number means

Displayed count = a fixed per-variation baseline stored in the database (5-40, set once, stable) + the real number of members currently watching that variation.

- The number never jumps around between page loads; it only moves when real watchers add or remove the item.
- Adding/removing from your watchlist updates the counter immediately.
- Note: the baseline part is not real activity, which is a deliberate exception you approved for this counter. It can be zeroed out later in one place with no other changes.

## Where it appears

Only in the product page buy/action panel, immediately next to the existing follow control. Listing rows and catalog cards stay unchanged.

## Look

Compact pill next to the heart: small filled heart/eye glyph, monospaced number, muted surface with a subtle warm accent so it reads as live but not loud. Singular/plural handled ("1 watching" / "23 watching"). Hidden for demo items.

## Technical outline

- Migration: add `watch_baseline smallint not null default 0` to `product_variants`; one-time UPDATE assigning each existing variation a deterministic value in 5-40 derived from its id; a trigger (or default expression) so newly created variations also get a value in range.
- Read path: extend the existing public variation market view/query used by the product page, or add a small public read to `community.functions.ts` returning `{ watcherCount }` = baseline + count of `watchlist` rows for that variation. Count is computed server-side through a security-definer view so no member identities are exposed and RLS on `watchlist` still hides rows.
- Grants: `select` for `anon` and `authenticated` on the count view only.
- New component `WatcherCount.tsx` (presentation only) rendered beside `WatchButton` in `src/routes/products.$slug.tsx`; query key `["watcher-count", variantId]`, invalidated by the existing watch mutations so the number reacts to your own follow action.
- No changes to checkout, fees, orders, or notifications.
