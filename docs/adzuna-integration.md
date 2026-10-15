# Adzuna job search

Adzuna results appear in a separate section on the Jobs browse/landing page.
Existing Bluebird listings and filters remain independent. External results have
keyword/location search, 20 results per page, up to five pages, and an Adzuna
attribution link on every card. Application buttons use the provider redirect URL.
No external jobs are inserted into marketplace products, sold, or enrolled in
Bluebird saved-search alerts. Description snippets are rendered as text. Salaries
are omitted rather than presenting provider estimates as employer-posted pay.

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
