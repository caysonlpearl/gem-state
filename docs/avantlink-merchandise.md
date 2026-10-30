# AvantLink merchandise feed

Bluebird uses AvantLink ProductSearch for eligible Guns.com merchandise. The
affiliate ID is 400633, website ID 448337, merchant ID 16393, and datafeed ID
6417, verified in the affiliate portal and an actual apparel API response.
ProductSearch does not require the reporting authentication key. No key needs
to be added to the browser or deployment for this integration.

## Inventory and display

`avantlink-contract.ts` accepts Guns.com firearms, ammunition, suppressors,
suppressor accessories, gun parts, magazines, optics and related gear. Requests
are pinned to the merchant/feed and an approved department/category; department
scopes include all returned subcategories. Each row is validated again before
caching and at read time. Unknown departments and spoofed merchant/link data
remain excluded. Firearms and related accessories map into Firearms; apparel
retains its clothing category. Suppressors use the existing Parts accessory filter.

Approved records retain their original fields server-side, excluding the
executable widget script. The normal listing card/detail route presents real
descriptions, brand, SKU, categories, returned options, retail/sale prices,
photos, saves, view counts, sharing, and moderation. Image-size variants of
the same photo are deduplicated. The feed does not promise additional gallery
photos; the original large image is used when provided. Missing condition,
stock status, size, or shipping terms are never invented.

Retailer links retain Bluebird's website ID and use `rel="sponsored nofollow
noopener noreferrer"`. Prices are checked at refresh time and current price,
options, availability, delivery and returns must be confirmed with the retailer.
Affiliate disclosure is at the bottom of the detail page.

The live merchandise payload has no dealer/item location, state, or shipping
eligibility fields. Online offers are labelled "Online retailer"; they never
claim to be Idaho/Utah inventory. Any physical location/radius filter excludes
these products. Homepage online rows are separate from local/farther-away rows.

## Cache, refresh, and budget

Apply `20261029120000_add_avantlink_merchandise.sql` to Bluebird production
(`udxxfuticbxwiehoepeg`). All three new tables and the reservation function
are restricted to the service role. Existing member-save, moderation, and
view-count ID constraints add the new prefix while retaining existing sources.

Browse/detail reads use only the shared cache; visiting a page never calls
AvantLink. Inventory older than seven days is excluded. The existing protected
half-hour `POST /api/internal/service-ratings` schedule advances one eligible
category page per run, with a 24-hour successful-refresh interval per category.
An atomic DB lease prevents simultaneous refreshes of the same page. The
shared limits are 200 requests per rolling day and 60 per rolling hour; pages
request 250 records, up to 10,000 records per scope. Incomplete pages and failed
requests receive a 31-minute cooldown so one slow scope cannot monopolize the
half-hour scheduler. Requests allow 55 seconds for the provider to respond. A cap or failed refresh
preserves the previous good inventory and records the incomplete state.
The published provider ProductSearch limits are 3,600/hour and 15,000/day;
Bluebird's smaller refresh budget is sufficient for the configured scopes.

The initial backfill can be run with Node 22:

```sh
node --experimental-strip-types --env-file=/path/to/server.env scripts/refresh-avantlink-merchandise.mjs
```

The script verifies the production project hostname, shares the same database
reservation guard as the scheduler, and prints counts only. It does not change
native classifieds. Inspect `avantlink_merchandise_scopes` for per-category
completion/cursors/errors before calling a refresh complete.

Official module documentation:
- https://www.avantlink.com/api.php?help=1&module=ProductSearch
- https://www.avantlink.com/api.php?help=1&module=ProductTaxonomy
