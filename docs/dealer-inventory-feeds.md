# Automatic dealership inventory feeds

The production `bluebird-inventory.timer` on the existing DigitalOcean server checks every 15 minutes (and once, one minute after timer activation). It invokes the compiled production inventory endpoint in-process; no HTTP listener is exposed. Each source's schedule determines whether it is due. `hourly` sources run on the first sweep at least 60 minutes after their last success. Failed sources remain eligible for retry; paused sources never run. A ten-minute source lease prevents overlapping scheduled workers from fetching and reconciling the same snapshot. See `infra/inventory/README.md` for deployment and credentials. The old Supabase `dealer-inventory-sweep` job is disabled: Motive returns a browser-check page to the website's hosting network, while the DigitalOcean worker receives XML. Unrelated Supabase jobs remain active.

Apply `20261110180000_automated_dealer_inventory.sql` before deploying the updated scheduler. The migration adds service-role-only lease functions and preserves existing media row identities across imports. Invalid inventory hides any already-linked public listing; unpriced authorized-feed visibility is governed by the price-or-photos rule below. Feed publication uses the separately recorded dealer authorization described below.

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

### M.A.S.S. Motors Fairview / Overfuel

Overfuel delivers `bluebird_mass_motors_fairview_used_car.csv` to its isolated
SFTP account every four hours. The separate SFTP worker checks for new deliveries
every five minutes and imports each received file once. The source is bound to
Overfuel dealer ID `1920` with mapping profile
`{"__provider":"overfuel","__dealer_id":"1920"}`. The initial file contains
110 vehicles and 1,736 photo URLs; the minimum snapshot is 90 rows and the
missing-vehicle grace remains two distinct successful deliveries.

The standard Overfuel header names map directly to inventory fields. Stock
numbers identify records; modern VINs are validated. Legitimate pre-1981 short
serial numbers are preserved privately and are not represented as standard
17-character VINs. Zero/blank prices remain invalid private records rather
than dropping out of the snapshot. Dealer `Cost` is discarded before database
storage; only the existing public field whitelist is exposed. Condition,
certification, MSRP, original vehicle URL and ordered photos are retained.

Scott Brown, General Manager, is the user-confirmed account owner. Use standard
onboarding and associate this source with the Fairview profile; no password,
email verification, agreement acceptance or invitation is manufactured.

### Shared publication rules

Twin Falls Subaru has given written permission to publish its inventory. Its approved source is registered in the service-only `dealer_feed_publications` table with the operator, permission reference and public dealership contact information. The safe `read_published_dealer_inventory` RPC exposes a whitelist of vehicle and dealership fields; private feed URLs, raw records and permission references remain private.

Authorized feed vehicles appear directly in browse, the homepage vehicle source, their own detail pages, and `/dealers/twin-falls-subaru`. They use stable `dealerfeed-<record UUID>` IDs, the dealership's phone and original vehicle pages, and the existing partner save/report/photo paths. No member listings are created. Direct dealer inventory replaces older same-dealer aggregator cars to avoid duplicates and outdated prices.

Current inventory appears publicly when it has a positive advertised price or at least one safe public photo. Vehicles without an advertised price display “Contact For Price”, with no payment estimate or zero-dollar structured offer. Vehicles with neither remain private. Sold, removed, invalid, moderator-removed and expired inventory is excluded. Missing vehicles retain the source's two-snapshot grace. Source pauses or revoked publication permission hide the feed. Inventory older than 72 hours is hidden until refreshed. Temporary fetch errors retain the latest valid snapshot within that window. New arrivals and price/photo changes become visible with the next successful import, without another publication step.

Written listing permission and dealer account agreements are separate records. The existing ready/account-agreement and moderation checks still apply when operators manually link inventory to member listings.

## Standard dealership account onboarding

Before publishing a new dealer feed, use **Dealership management → Add or complete a dealership account** (`/admin/dealers`). Confirm the dealership contact and login email, official name/logo, sales phone, public email, website and street address. Create or reuse the dealer's own account, assign its authorized feed and verify the storefront and inbox. This is a required onboarding step for every dealership; newly enabled feed publications must reference a dealer account.

`20261110220000_dealer_accounts_and_messages.sql` adds operator-only account onboarding, feed ownership and dealership conversations. `onboardDealer` prepares an unverified account without setting a password or granting platform administrator access, then creates its business profile and owner membership. Existing accounts are reused without overwriting their personal profile. Listing permission remains separate from legal agreement acceptance; onboarding never invents agreement acceptance or email verification. Invitation emails are not sent automatically. The owner can request an email sign-in link at `/auth`; they must open the link from their own mailbox. Check the configured authentication email delivery before handing off access. Approved dealerships accept private buyer messages before their first sign-in; the existing account owns those conversations and they appear when its representative activates access. Email alerts wait for a verified recipient.

Twin Falls Subaru's public contact uses its 208-701-1944 sales phone and 1725 Parkview Dr, Twin Falls, ID 83301 address. Its public email is intentionally blank at the owner's request; an activated dealership owner can add one in Dealer setup. Rob Bunn (rob@twinfallscars.com) is the confirmed private account owner. No activation or invitation has been sent. Buyer messages are saved to that account before activation; public contact email remains blank. The official logo and dealership website are on the profile. All records remain in the existing feed tables and are associated through the source's dealer ID. The owner sees all assigned records in Account → Listings, while sold/unavailable records and records with neither a price nor photos remain excluded from public inventory. The import schedule stays `every 8 hours`.

Vehicle and general dealership inquiries create normal private Bluebird conversations with the dealer account owner as the recipient. Buyers cannot supply or redirect that recipient. Existing participant privacy, blocks and rate limits remain in effect; repeated inquiries about a vehicle reuse the conversation. The account owner's notification preferences control email alerts. In-app messages are saved even if notification delivery fails. The admin onboarding screen checks the configured Resend sending domain without sending an email; a verified domain alone is not proof of inbox delivery. The admin directory includes a read-only dealer account preview (inventory, inbox state and business profile) without creating a dealer session or sending invitations. Inventory storefronts paginate in groups of 24 and show only supplied price/MSRP comparisons.

For future feeds: first record written publication permission, then complete the dealership account and feed association, check contact/brand details, confirm inbox routing, verify feed quality/photos and only then enable publication. Never send shared passwords or make a dealer a platform administrator. Additional dealership staff should receive scoped membership in the existing dealer membership tools.

## Verification

`npm run test:inventory` checks parsing, dealer identity, unpriced vehicles, malformed XML, partial-snapshot rejection, retry/lease behavior, snapshot atomicity and media identity in a real local PostgreSQL engine. Run TypeScript and the production build for server/UI changes. `npm run test:seo:ssr` also exercises the compiled inventory cron endpoint with entirely synthetic network traffic, including authentication, complete imports, HTML/truncated responses, and redacted errors. Production verification must include a completed run from the deployed scheduler, matching row/photo counts, and a replay with no duplicate records.

## Discovery row selection

Feed refreshes update availability and pricing without changing a vehicle's posting age. Vehicle cards use the original first-seen date, and unknown posting dates are not presented as freshly posted. Pet listings use the source creation date when supplied.

Homepage and category preview rows prefer Idaho, then balance the available sellers within each eligible location tier. Unseen matching cards are preferred within each seller. A known seller with only one matching card can reappear in a later row when its omission would lose local seller variety; fully exhausted rows retain their existing empty/fallback behavior. Repeated sellers fill a row when there are fewer alternatives. Native account identifiers are reduced to opaque grouping tokens before the public-card projection; known dealer, employer, business and rescue identities group syndicated records without treating an entire data provider as one seller. Explicit category/location/price filters still apply, and unknown prices never qualify for the affordable row.

Seller variety is reserved before cache limits. The versioned snapshot refresh migrates the saved card pool automatically after deployment, using existing cached provider data. Public page loads do not acquire new provider inventory for this selection rule.

Mixed pet previews retain species variety: Idaho animals lead within the available species, with nearby rescues supplying missing types. These adjustments retain at least one matching Idaho listing when one is available and do not reduce the selected seller variety.

Listings without an identifiable owner share a per-category exposure budget so every anonymous vehicle does not get a new fairness bonus. Their ownership is still treated as unknown; private-only rows can fill normally.
