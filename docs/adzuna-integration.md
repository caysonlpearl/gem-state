# Adzuna job search

Adzuna jobs join the normal Bluebird Jobs results, job landing rows, homepage
job rows, and unscoped marketplace browse. They use ListingCard / ListingRow,
including the normal Jobs artwork when the provider has no photo. Every external
card retains Adzuna attribution and opens the provider application URL. No
external inventory is added to a seller's or dealership's storefront.

The shared keyword/location search requests up to 50 recent provider jobs and
merges that bounded snapshot with native inventory before sorting and paging.
Counts reflect the loaded, eligible snapshot, not all jobs advertised upstream.
Category and supported employment filters are sent upstream and checked locally.
Filters the provider cannot substantiate (photos, pay, education, experience)
exclude external results. Unknown pay reads “See pay details”; unknown employment
is omitted. No salaries, photos, cities, or dates are invented. Locations are
normalized from the provider hierarchy to city plus US state abbreviation;
county-only and otherwise unresolved locations are excluded. Cache version 2
prevents earlier display-name-only payloads from leaking into the new cards.

No external jobs are inserted into marketplace products, sold, saved to watchlists,
or enrolled in Bluebird saved-search alerts. Description snippets render as text.

## Setup

1. Set `ADZUNA_APP_ID` and `ADZUNA_APP_KEY` in the web host's server secrets.
   Never use `VITE_` prefixes or commit actual credentials.
2. Apply `supabase/migrations/20261015210000_adzuna_search_cache.sql` to the existing
   Bluebird Supabase project. This adds only two tables and one function.
3. Deploy the app. Lovable secrets require publishing to reach production.
4. Verify a search and application link, then repeat the search and confirm no
   additional row appears in `adzuna_api_requests`.

The existing server-only Supabase service key accesses the cache. RLS is enabled
on both tables; anon/authenticated roles cannot read them or execute reservations.
The reservation function serializes budget checks across server instances and
prevents duplicate in-flight queries for 30 seconds. Failed upstream calls also
consume budget, since Adzuna may count them. Search responses cache for six hours.
The integration fails closed if its cache/budget database is unavailable.

Conservative sliding limits: 20 requests/minute, 200/day, 900/week, 2400/31 days.
These leave room below Adzuna's published defaults; other consumers of the same
key are not included in the integration's accounting. The account's actual limits
may differ. No automatic provider retries. Provider errors/URLs are never logged.

Official references:

- https://developer.adzuna.com/overview
- https://developer.adzuna.com/docs/search
- https://developer.adzuna.com/docs/terms_of_service

Run `node --experimental-strip-types --test tests/adzuna.test.mjs`, TypeScript,
and the production build before deployment. Test the database reservation and
permissions in a rolled-back transaction before activating live searches.
