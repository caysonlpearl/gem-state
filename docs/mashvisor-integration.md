# Mashvisor homes for sale

Mashvisor MLS homes for sale join Homes browse (`category=other-real-estate`,
Buy or no tab) with a "Listing data from Mashvisor" credit. Their pages
(`/listings/mashvisor-<id>`) show the provider's facts and a link to find the
original listing; no Bluebird buy, offer, or message actions. Nothing is
stored as a Bluebird listing, saved-search alert, or storefront item.

Rentals are not included: Mashvisor's rental endpoint returns past rentals
(comps), not live listings.

## Budget (free plan: 30 requests/month)
- Only `MASHVISOR_CITIES` in `src/lib/mashvisor-listings.server.ts` are fetched,
  one call per city, cached 7 days. No city = Boise.
- `reserve_mashvisor_search` caps calls at 2/day and 20 per 31 days; when the
  cap is hit, the last cached copy is shown (kept up to 14 days past expiry).
- Listing pages never call the API; they read the cache.

Secret: `MASHVISOR_API_KEY` (server only). Tests: `tests/mashvisor.test.mjs`.
