# Bluebird Listing Import 1.4.2

This is a manually operated Chrome extension. It reads public listing data in the browser session the operator is already using; it does not run scheduled imports or publish automatically.

## Update

In Chrome's Extensions page, reload the installed unpacked extension from this folder, then reload the Bluebird admin import page. The admin page requires version 1.4 or later for Refresh. Updating the website does not update an unpacked Chrome extension.

## Supported seller pages

- Facebook Marketplace seller profiles
- KSL member listings
- Vinted member profiles
- Whatnot user shops
- Diesel Depot inventory at `https://www.diesel-depot.com/inventory/`

Open the source seller/catalog page and click the extension's toolbar icon. Review and stage the returned batch on Bluebird's admin import page. The operator must have the seller's permission; publishing and seller ownership remain separate admin steps.

Imports use two reusable reader windows. Refresh and Refresh all share a single two-window pool across all supported sources. Only one import or refresh runs at a time. If the site asks for human verification, complete it manually in the foreground window; readers pause instead of treating the challenge as a removed listing.

## Diesel Depot

The importer follows the dealer's own inventory navigation for trucks, trailers, truck bodies, construction equipment, farm equipment, attachments, truck parts, and other stock. Manufacturer showrooms and recommendations are excluded. Listings are deduplicated by source ID, preserving existing Bluebird records when titles or tracking parameters change.

Actual asking prices, conditions, machine locations, descriptions/specifications and up to eight gallery photos are collected. Price-on-request and rental-only listings are counted and skipped with a visible explanation, rather than creating false $0 sale ads. Interrupted or incomplete catalog discovery fails before a batch is delivered. Omission from a dealer catalog cannot mark previously imported stock removed; a successful explicit detail-page refresh must confirm unavailability.

## Verification

Run the importer tests from the repository root:

```
node --experimental-strip-types --test tests/import-reader-concurrency.test.mjs tests/dealer-site-import.test.mjs tests/import-readers.test.mjs tests/ksl-import.test.mjs tests/seller-claims.test.mjs tests/facebook-import-photos.test.mjs tests/facebook-import-categories.test.mjs
```

Dealer fixtures were captured from the public catalog and representative detail pages on October 20, 2026. They cover 68 visible inventory records across eight sections; they are test snapshots, not a claim about current stock or a live extension run.

Source subcategories are carried into the admin review form and saved as category-specific listing details. KSL Industrial classifications take precedence over words such as Tractor or Semi Truck in the subcategory. Version 1.4.2 or newer is required to extract these fields.
