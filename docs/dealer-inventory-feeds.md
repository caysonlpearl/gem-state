# Automatic dealership inventory feeds

The production `dealer-inventory-sweep` job calls the authenticated internal inventory endpoint every 15 minutes. Each source's schedule determines whether it is due. `hourly` sources run on the first sweep at least 60 minutes after their last success. Failed sources remain eligible for retry; paused sources never run. A ten-minute source lease prevents overlapping scheduled workers from fetching and reconciling the same snapshot.

Apply `20261110180000_automated_dealer_inventory.sql` before deploying the updated scheduler. The migration adds service-role-only lease functions and preserves existing media row identities across imports. Invalid/unpriced inventory also hides any already-linked public listing. It does not publish vehicles or accept agreements for dealerships.

## Twin Falls Subaru / Motive

The authorized Motive feed is configured in the private `dealer_inventory_sources` table. Never commit its keyed URL, include it in public listing metadata, or put it in client-visible environment variables.

- Source type: `file_url`; format: `xml`; schedule: `hourly`.
- Mapping profile: `{"__provider":"motive","__dealer_id":"2592"}`.
- Identify requests with the `BluebirdMarketplace/1.0` inventory-client User-Agent. Motive can return HTTP 200 with a browser-check HTML page to unnamed clients; an HTTP success alone does not prove receipt of XML. Browser-check responses must never reach reconciliation.
- Minimum snapshot size: 200 vehicles, set against the initial verified snapshot of 256. A smaller snapshot requires operator review before lowering the minimum.
- Missing vehicles become stale and linked listings are hidden after two successful complete snapshots. An explicit sold/removed status hides a linked listing immediately. Fetch, XML, validation and minimum-size failures retain existing inventory.
- Motive's IDs, stock numbers, ZIP codes, mileage, color, body style and numbered photo fields map into the existing inventory model. Both numbered images and the comma-separated image summary are deduplicated in source order.
- Zero/blank advertised prices remain `null`, with inventory status `invalid` for private review. They stay present in reconciliation, so an unpriced car is not mistaken for a missing one. No MSRP or invented price is substituted.
- Current raw records preserve descriptions, condition, certification, dealer contact fields and source vehicle URLs. Hourly sync history stores counts/checksums rather than duplicate full XML payloads.

Imported inventory is private. A real, ready dealership storefront and the existing review/link workflow are required for public marketplace listings; feed authorization does not constitute acceptance of dealership account agreements.

## Verification

`npm run test:inventory` checks parsing, dealer identity, unpriced vehicles, malformed XML, partial-snapshot rejection, retry/lease behavior, snapshot atomicity and media identity in a real local PostgreSQL engine. Run TypeScript and the production build for server/UI changes. `npm run test:seo:ssr` also exercises the compiled inventory cron endpoint with entirely synthetic network traffic, including authentication, complete imports, HTML/truncated responses, and redacted errors. Production verification must include a completed run from the deployed scheduler, matching row/photo counts, and a replay with no duplicate records.
