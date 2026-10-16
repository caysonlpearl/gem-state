# Mashvisor homes for sale

Mashvisor MLS homes for sale join Homes browse (`category=other-real-estate`,
Buy or no tab) with a "Listing data from Mashvisor" credit. Their pages
(`/listings/mashvisor-<id>`) show the provider's facts and a link to find the
original listing; no Bluebird buy, offer, or message actions. Nothing is
stored as a Bluebird listing, saved-search alert, or storefront item.

Rentals are not included: Mashvisor's rental endpoint returns past rentals
(comps), not live listings.

## Budget

- Only `MASHVISOR_CITIES` in `src/lib/mashvisor-listings.server.ts` are fetched,
  one call per city, cached 14 days. No city = Boise.
- `reserve_mashvisor_search` caps calls at 2/day and 20 per 31 days; when the
  cap is hit, the last cached copy is shown (kept up to 14 days past expiry).
  The 20-call guard leaves a buffer under the 30-call allowance for detail
  lookups and reduces risk from repeated refreshes.
- Listing pages make one cached property-info call the first time a detail page
  is opened. Photos and available property facts are cached with that response;
  no separate photo/history calls are made.

Secret: `MASHVISOR_API_KEY` (server only). Tests: `tests/mashvisor.test.mjs`.

The current Mashvisor pricing page describes the Free plan as 30 sample
requests one-time, while the account setup was reported as allowing 30 each
month. Keep the application guard at 20 per rolling 31 days until the account
dashboard confirms which allowance applies; this guard is rolling-monthly, not
a lifetime-credit counter.
