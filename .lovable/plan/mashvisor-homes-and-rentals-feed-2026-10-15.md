# Mashvisor homes and rentals feed

Show Mashvisor for-sale homes and long-term rentals in the Homes page, home rows and listing pages, built the same way as the Adzuna jobs feed (live results mixed in, clearly labeled, never stored as Bluebird listings).

## What the user will see
- Homes page and home sections on the homepage include Mashvisor homes for sale and rentals for Idaho cities (and nearby states when searched).
- Cards use the existing home card: price (or monthly rent), beds, baths, square feet, city, photo when Mashvisor provides one, otherwise the normal Homes artwork.
- Every Mashvisor card shows a small "Listing data from Mashvisor" note. Its page shows the facts Mashvisor gives and a "View original listing" button. No Message seller / Buy now / Make offer on these.
- Nothing is invented: missing beds, photos, dates or prices are left out.
- Not added to any seller storefront, saved searches alerts, watchlists or sold history.

## Steps
1. Save the key securely as `MASHVISOR_API_KEY` (secure form; you paste it, it is never shown in chat or code).
2. Confirm the exact Mashvisor endpoints the key can use (for-sale listings by city/state, rental listings, single-property detail) with one test call each, and record which fields come back.
3. Add a small cache + daily budget for Mashvisor calls in the database (same approach as Adzuna) so repeated searches don't burn API credits. Results cache for 6 hours.
4. Mix results into Homes browse: only when the active filters are ones Mashvisor data can honor (city/state, price, beds, baths, sale vs. rent). Other filters hide external results.
5. Listing page support for `mashvisor-<id>` ids, with attribution and the original-listing link.
6. Tests for: id format, filter eligibility, price vs. monthly rent mapping, and no invented fields. Document setup in `docs/mashvisor-integration.md`.

## Open points to confirm during step 2
- Mashvisor's plan may limit monthly requests and may restrict showing their data publicly; I'll check their terms and set conservative limits.
- If your plan doesn't include listing photos or rentals, those parts fall back to artwork / are skipped, and I'll tell you.

## Technical details
- Files: `src/lib/mashvisor.server.ts` (fetch + cache + budget), `src/lib/mashvisor-contract.ts`, `src/lib/mashvisor-listings.server.ts` (map to `ClassifiedCard` / `ClassifiedDetail`, `canIncludeMashvisor`), hooks in `browseClassifieds` and the listing detail loader in `src/lib/classifieds.functions.ts`, attribution in `ListingCard.tsx` and `listings.$listingId.tsx`.
- Migration: `mashvisor_search_cache` + `mashvisor_api_requests` tables with RLS on, no anon/authenticated access, plus a reservation function — service role only.
- Key read only on the server inside handlers; never `VITE_`.
- Category: existing `other-real-estate` (Homes); sale vs rent kept in the existing home listing-type field.
