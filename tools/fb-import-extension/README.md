# Bluebird Listing Import 1.5.0

This is a manually operated Chrome extension. It reads public listing data in the browser session the operator is already using; it does not run scheduled imports or publish automatically.

## Update

In Chrome's Extensions page, reload the installed unpacked extension from this folder, then reload the Bluebird admin import page. The admin page requires version 1.5 or later for profile Refresh. Updating the website does not update an unpacked Chrome extension.

Refresh scans profiles for new listings and re-reads existing URLs through the two-window pool. Scrolling that merely stops producing cards is not proof of completion. Unknown totals, missing pages, challenges or unreadable details report an incomplete scan; unseen existing rows stay unchanged. Re-run Refresh to retry. Pending edits are preserved, never overwritten by another scan.

Review loads exact-count pages with a visible Show next 50 control; selection covers the whole queue, not just visible rows. Staging and application use one-row requests, so large selections do not run as one long server request. Committed rows are safe to retry, failed rows stay selected. Application never generates/replaces a claim link. Use the explicit Prepare claim control only when a new link is actually needed; replacement intentionally invalidates the previous token.

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

Actual asking prices, conditions, machine locations, descriptions/specifications and up to eight gallery photos are collected. Price-on-request and rental-only listings are counted and skipped rather than creating false $0 sale ads. Profile Refresh reconciles cumulative counts across catalog pages. Absence can queue removal only after proven complete discovery and zero unreadable details; readable existing detail pages remain seen even if omitted from the grid.

## Verification

Run the importer tests from the repository root:

```
node --experimental-strip-types --test tests/import-reader-concurrency.test.mjs tests/dealer-site-import.test.mjs tests/import-readers.test.mjs tests/ksl-import.test.mjs tests/seller-claims.test.mjs tests/facebook-import-photos.test.mjs tests/facebook-import-categories.test.mjs
```

Dealer fixtures were captured from the public catalog and representative detail pages on October 20, 2026. They cover 68 visible inventory records across eight sections; they are test snapshots, not a claim about current stock or a live extension run.

Source subcategories are carried into the admin review form and saved as category-specific listing details. KSL Industrial classifications take precedence over words such as Tractor or Semi Truck in the subcategory. Version 1.4.3 or newer is required to extract these fields.

Completed scans retain a recovery copy on the source page. Delivery waits for the admin form to acknowledge receipt; keep the source page open until the batch is staged.

Version 1.4.4 keeps recognized KSL source categories authoritative. When the source category is ambiguous, only the title is used for fallback inference; incidental description/specification words cannot imply Auto Parts. Ambiguous items stay in General for review. Diesel Depot's validated detail URL can resolve its shortened `Bottom` category when the URL explicitly identifies a semi-trailer. Explicit truck-parts categories still take precedence. These changes affect newly read imports; they do not reclassify existing Bluebird listings or change Motors/homepage grouping.
