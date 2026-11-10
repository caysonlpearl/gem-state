# Automatic dealership inventory feeds

The production `bluebird-inventory.timer` on the existing DigitalOcean server checks every 15 minutes (and once, one minute after timer activation). It invokes the compiled production inventory endpoint in-process; no HTTP listener is exposed. Each source's schedule determines whether it is due. `hourly` sources run on the first sweep at least 60 minutes after their last success. Failed sources remain eligible for retry; paused sources never run. A ten-minute source lease prevents overlapping scheduled workers from fetching and reconciling the same snapshot. See `infra/inventory/README.md` for deployment and credentials. The old Supabase `dealer-inventory-sweep` job is disabled: Motive returns a browser-check page to the website's hosting network, while the DigitalOcean worker receives XML. Unrelated Supabase jobs remain active.

Apply `20261110180000_automated_dealer_inventory.sql` before deploying the updated scheduler. The migration adds service-role-only lease functions and preserves existing media row identities across imports. Invalid/unpriced inventory also hides any already-linked public listing. Feed publication uses the separately recorded dealer authorization described below.

## Twin Falls Subaru / Motive

The authorized Motive feed is configured in the private `dealer_inventory_sources` table. Never commit its keyed URL, include it in public listing metadata, or put it in client-visible environment variables.

- Source type: `file_url`; format: `xml`; schedule: `every 8 hours` (about three imports per day, on the first due 15-minute sweep).
- Mapping profile: `{"__provider":"motive","__dealer_id":"2592"}`.
- Identify requests with the `BluebirdMarketplace/1.0` inventory-client User-Agent. Motive can return HTTP 200 with a browser-check HTML page depending on the requesting network/client; an HTTP success alone does not prove receipt of XML. Browser-check responses must never reach reconciliation. Website-hosted manual fetches can still encounter this provider restriction; use the DigitalOcean worker for a scheduled or immediate full sync.
- Minimum snapshot size: 200 vehicles, set against the initial verified snapshot of 256. A smaller snapshot requires operator review before lowering the minimum.
- Missing vehicles become stale and linked listings are hidden after two successful complete snapshots. An explicit sold/removed status hides a linked listing immediately. Fetch, XML, validation and minimum-size failures retain existing inventory.
- Motive's IDs, stock numbers, ZIP codes, mileage, color, body style and numbered photo fields map into the existing inventory model. Both numbered images and the comma-separated image summary are deduplicated in source order.
- Zero/blank advertised prices remain `null`, with inventory status `invalid` for private review. They stay present in reconciliation, so an unpriced car is not mistaken for a missing one. No MSRP or invented price is substituted.
- Current raw records preserve descriptions, condition, certification, dealer contact fields and source vehicle URLs. Sync history stores counts/checksums rather than duplicate full XML payloads.

## Authorized feed publication

Twin Falls Subaru has given written permission to publish its inventory. Its approved source is registered in the service-only `dealer_feed_publications` table with the operator, permission reference and public dealership contact information. The safe `read_published_dealer_inventory` RPC exposes a whitelist of vehicle and dealership fields; private feed URLs, raw records and permission references remain private.

Authorized feed vehicles appear directly in browse, the homepage vehicle source, their own detail pages, and `/dealers/twin-falls-subaru`. They use stable `dealerfeed-<record UUID>` IDs, the dealership's phone and original vehicle pages, and the existing partner save/report/photo paths. No member listings are created. Direct dealer inventory replaces older same-dealer aggregator cars to avoid duplicates and outdated prices.

Only priced current inventory appears publicly. Sold, removed, invalid, moderator-removed and expired inventory is excluded. Missing vehicles retain the source's two-snapshot grace. Source pauses or revoked publication permission hide the feed. Inventory older than 72 hours is hidden until refreshed. Temporary fetch errors retain the latest valid snapshot within that window. New arrivals and price/photo changes become visible with the next successful import, without another publication step.

Written listing permission and dealer account agreements are separate records. The existing ready/account-agreement and moderation checks still apply when operators manually link inventory to member listings.

## Verification

`npm run test:inventory` checks parsing, dealer identity, unpriced vehicles, malformed XML, partial-snapshot rejection, retry/lease behavior, snapshot atomicity and media identity in a real local PostgreSQL engine. Run TypeScript and the production build for server/UI changes. `npm run test:seo:ssr` also exercises the compiled inventory cron endpoint with entirely synthetic network traffic, including authentication, complete imports, HTML/truncated responses, and redacted errors. Production verification must include a completed run from the deployed scheduler, matching row/photo counts, and a replay with no duplicate records.
