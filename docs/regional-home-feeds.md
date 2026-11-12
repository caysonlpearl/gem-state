# Regional home feeds and the 300-call plan

Each market has one API owner. Other subscriptions cannot fill that region when its quota runs out.

- Zillow: Treasure Valley.
- Real-Time Real Estate Data (Zillow endpoints): Eastern Idaho, including Pocatello and Southeast Idaho.
- Real-Time Redfin Data: North Idaho.

Search bounds do not overlap. Redfin uses the coordinate endpoint for the North Idaho rectangle; the polygon endpoint returned no homes for the same bounds during live verification. The imported city's county-based Bluebird region (or a nearby Idaho place for unknown localities) must match the owner. Property IDs are namespaced for Redfin. Canonical street/city/unit identities prevent duplicate cards and avoid repeat detail work where aliases coexist in the current cache; different units remain distinct.

## Monthly capacity

All three published Free plans include 100 requests/month with a hard limit. The database uses a conservative rolling 31-day cap of 100 per provider/account, with no artificial daily cap.

Searches run weekly. Over 31 days, budget five rounds:

- Treasure Valley: two for-sale pages plus one rental page per round: 15 searches, leaving 85 detail calls.
- Eastern Idaho: the same pagination: 15 searches, leaving 85 detail calls.
- North Idaho: one sale page and one rental page per round: 10 searches, leaving 90 detail calls.

Total: **40 search/availability calls + 260 individual detail attempts = 300 calls**. At an assumed 90% usable-detail yield, plan for **234 maintained complete homes**, not 234 guaranteed new homes every month. Monthly renewal of existing records uses the same detail allowance. The theoretical 260 assumes every lookup returns complete usable data and enough eligible homes are available; extra retries reduce capacity.

The two Zillow search APIs return up to 41 summaries per page. Those summaries are not full galleries/descriptions. Redfin allows up to 350 summaries per search. Its cache key records this requested limit so the original 40-result diagnostic cannot prevent a full-size discovery search. Each complete property record normally needs an individual detail call. The extra sale pages keep the Zillow discovery pool larger than a single 41-sale/41-rental page window.

The importer protects remaining weekly-search credits before using requests on full details. Multiple failed attempts at the same search in one week do not erase the reserve for later weeks. Database reservations remain the final atomic limit.

### Authorized backup account

The homes scheduler can use a separately activated backup account on the same provider when the primary account reaches its monthly allowance. Set server-only `OPENWEBNINJA_BACKUP_API_KEY` and explicitly list the activated subscriptions in `OPENWEBNINJA_BACKUP_HOME_PROVIDERS` (`zillow,realestate,redfin`). An absent allowlist disables the backup. The same credential cannot be counted as two accounts.

Apply `20261112030000_home_backup_account_budget.sql` and `20261112040000_fill_homes_preserve_weekly_updates.sql` before deploying backup support without a daily cap. Existing ledger entries remain `primary`; every new request records its actual account. Each account/provider combination retains the 100-per-rolling-31-days limit. There is no daily cap. The primary is preferred; remaining weekly searches are reserved once across the combined activated accounts because they update the same inventory. An atomic database reservation prevents detail calls from spending those protected credits. Neither account changes regional ownership. All accounts share saved searches, full details, address deduplication, expiry rules, and the property retry lock. Public reads still spend no requests. Remove the backup allowlist to stop future backup calls without removing imported homes.

## Freshness and publication

Prices and availability refresh weekly; regional source caches expire after eight days. Once a regional source has been seeded, legacy searches cannot resurrect its inventory after expiry. Full photos/descriptions/specifications refresh every 31 days, and expired full records are hidden until renewed. Overdue detail renewals run before new acquisitions. Public pages and SSR only read saved data, never spend provider calls.

A public home requires at least two unique photos, a description, and two numeric property facts. Cards use a saved gallery photo rather than requiring the search result to supply a thumbnail. Redfin's documented detail endpoint returns the first 30 photo URLs; Bluebird uses the supplied URLs and does not invent image paths or source facts.

Redfin rental results additionally require an explicit per-property rental status. During live verification, its `for_rent` coordinate search returned known for-sale homes at the identical sale prices with generic `ACTIVE` status. Those results are quarantined and must never become monthly rental prices merely because the request asked for rentals. North Idaho rental inventory can remain empty until the provider supplies verifiable rental results.

## Activation and rollout

1. Apply `20261112010000_use_full_home_free_allowance.sql` and `20261112020000_regional_redfin_home_budget.sql` to GemList. The second migration adds the Redfin budget and ID constraints while preserving existing permissions and other provider formats.
2. Activate the separate Redfin **Free** subscription on the existing OpenWeb Ninja account and confirm its independent 100-request counter. No paid plan is needed.
3. Set server-only `OPENWEBNINJA_REDFIN_ENABLED=true` only after that subscription is active. It defaults to false; no Redfin provider call is permitted before activation. The existing server API key is used.
4. Deploy the code. Run the authenticated homes-only maintenance sweep until the eight configured search pages are seeded, then let the scheduler fill or renew complete records. API failure and budget exhaustion cannot publish previews or extend expired full records.
5. Refresh the homepage snapshot after seeding and verify region ownership, galleries, descriptions, saved homes, view tracking, and removed/expired listings.

The budget is a plan until subscription activation, migrations, and live imports are verified. Source references:

- https://www.openwebninja.com/api/real-time-zillow-data
- https://www.openwebninja.com/api/real-time-real-estate-data
- https://www.openwebninja.com/api/real-time-redfin-data
- https://www.openwebninja.com/api/real-time-redfin-data/docs
