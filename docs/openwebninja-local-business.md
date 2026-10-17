# OpenWeb Ninja Local Business Data

The home feeds and the Services directory use separate OpenWeb Ninja secrets:

- `OPENWEBNINJA_API_KEY` is reserved for the Zillow and real-estate feeds.
- `OPENWEBNINJA_LOCAL_BUSINESS_API_KEY` is the Local Business Data account key.

The Local Business Data key must be configured as a server-only deployment
secret. It is never read by browser code and has no fallback to the home-feed
key. Apply `supabase/migrations/20261017120000_split_local_business_api_budget.sql`
before enabling the scheduled service refresh.

The Local Business Data free plan is measured in businesses returned. Bluebird
reserves at most 14 businesses per day and 450 over a rolling 31-day window,
leaving 50 credits below the provider's 500-business allowance. A successful
response settles the reservation to the number of businesses actually returned;
failed or uncertain requests retain their reservation as a safety measure. The
raw response is kept in the service-role-only reservation table so unmatched
businesses are not discarded.

Directory browsing and detail pages are cache-only. The scheduled internal
service-ratings job performs provider calls, while its existing homes work
continues to use `OPENWEBNINJA_API_KEY` and its own provider budget.
