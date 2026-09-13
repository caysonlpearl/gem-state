# Gem State Classifieds: full marketplace conversion

Convert the entire remixed app from ParkVault into **Gem State Classifieds**, an Idaho-first general classifieds marketplace with a strong automotive experience. Preserve the proven account, offer, checkout, payment, shipping, order, review, notification, dispute, and seller-payout flows.

The current app groups multiple sellers beneath one shared catalog product. A true classifieds experience needs one physical item per public listing. To preserve the transaction engine, each classified will use a private one-to-one adapter:

```text
Classified listing page
        │
        ├── one product record (title/category/description)
        ├── one variant record (internal compatibility layer)
        ├── one seller listing (price/owner/status/checkout)
        └── classified metadata (location + category/vehicle fields)
```

Users will only see a normal classified listing. Existing product/variant terminology will remain internal where changing it would risk the working transaction flows.

## 1. Brand and visual system

- Rename all member-facing ParkVault references to **Gem State Classifieds** and remove Disney, park, resort, StockX, canonical-product, and Park Shopper language.
- Replace the current premium dark marketplace styling with an Idaho classifieds direction inspired by the supplied Motors reference: bright neutral surfaces, charcoal text, evergreen/navy utility colors, a warm high-visibility action color, compact information-dense layouts, and strong vehicle photography.
- Create a simple Gem State wordmark/mark suitable for the header, email, and auth screens; replace all existing Disney merchandise imagery with original Idaho/automotive/general-classifieds assets.
- Rewrite titles, descriptions, social metadata, policies, contact content, glossary, sitemap, empty states, and transactional emails for the new brand.
- Retain clear payment, shipping, refund, seller-condition, and non-escrow wording without making authentication or inspection claims.

## 2. Information architecture and shared navigation

- Rebuild the shared header around Search, Cars & Trucks, Other Classifieds, Saved, Sell, and Account.
- Add an obvious **Post a listing** action on desktop and mobile.
- Rework the footer around Idaho regions, popular categories, buying/selling help, policies, and contact.
- Remove Park Shopper, sourcing, sightings, product-suggestion, catalog-provenance, and park-location links from all public and member navigation while leaving their backend structures dormant.
- Keep existing public and protected route boundaries, adding only the listing-oriented routes needed for shareable detail and editing views.

## 3. Home page

- Make search the first interaction, with category and Idaho location controls rather than a marketing-only banner.
- Lead with automotive inventory, followed by popular general-classified categories and recently posted listings.
- Use category tiles for Cars & Trucks, Motorcycles, RVs, Powersports, Auto Parts, Trailers, Furniture, Electronics, Tools, and other practical local categories.
- Replace “top products,” price history, and park merchandising sections with honest live-listing shelves; show useful empty states when no records exist.
- Do not invent vehicles, prices, sellers, activity, or locations.

## 4. Browse and search

- Turn `/browse` into a classifieds results experience with grid/list views, result count, sorting, saved/favorite actions, and compact scan-friendly cards.
- Support global filters for keyword, category, Idaho city/region, price, condition, seller type, delivery/pickup, and newest/price sorting.
- When the vehicle category is active, reveal full automotive filters: make, model, year range, mileage range, body style, transmission, drivetrain, fuel type, exterior color, title status, and VIN when provided.
- Keep filters in a desktop sidebar and a mobile filter sheet; store filter state in validated URL parameters so searches are shareable and restorable.
- Present vehicle cards with the most useful facts first: year/make/model/trim, price, mileage, location, primary photo, posting age, and saved state.

## 5. Individual listing detail

- Replace the canonical product page with a single-listing page: gallery first, title/price/location summary, vehicle specification grid when relevant, condition and description, seller profile, fulfillment options, save/share controls, and report/contact affordances.
- Keep Buy Now and Make Offer connected to the current checkout and offer flows where enabled; remove pooled “lowest listing,” variation selection, “shop used listings,” price history, sightings, and “sell yours” controls.
- Show shipping or local-pickup details truthfully based on the listing. Do not imply inspected condition, guaranteed authenticity, escrow, or unavailable messaging features.
- Add related listings based on category/location without merging sellers onto the same page.
- Use vehicle-aware structured metadata for automotive listings and generic product/offer metadata elsewhere.

## 6. Create and manage a listing

- Replace “find a shared product first” with a category-led listing form where the seller creates the actual item being sold.
- Common fields: title, description, category, condition, price, photos, Idaho location, pickup/shipping options, and parcel details when shipping applies.
- Vehicle fields: make, model, year, trim, mileage, body style, transmission, drivetrain, fuel type, exterior color, title status, and optional VIN.
- Preserve seller setup, identity/payout readiness, moderation, media storage, listing status, editing, cancellation, and order handoff.
- Rework selling dashboards around each classified listing and its offers/orders; remove shared-catalog and suggestion terminology.

## 7. Minimal compatibility layer

This cannot be presentation-only because the verified schema has no vehicle attributes and the current seller flow requires attaching an offer to a pre-existing shared product. Make a narrow additive change rather than replacing the transaction backend:

- Add a one-to-one classified metadata record keyed to the existing seller listing, containing Idaho location, fulfillment mode, and typed category attributes (including indexed vehicle fields).
- Add a secure creation function that creates the unique product, internal variant, seller listing, media links, and classified metadata together, preserving existing listing review and seller-read access.
- Keep existing offer, checkout, payment, shipping, order, payout, review, notification, audit, and dispute records linked through the same listing/product/variant IDs.
- Keep Park Shopper and sourcing tables/functions dormant and inaccessible from the Gem State UI; do not delete historical structures during this conversion.
- Maintain row-level access controls and explicit grants for every additive table/function.

## 8. Account, operations, and admin

- Rebrand auth, onboarding, account, watchlist/saved items, notifications, buying, selling, order details, seller setup, payout setup, and all transactional states.
- Replace catalog-curation administration with classified moderation: review listing content/photos, approve or reject, inspect seller/order state, and manage categories and vehicle taxonomy.
- Hide sourcing/shopper administration and obsolete product suggestion queues.
- Keep existing role checks and server-side authorization unchanged in strength.

## 9. Validation

- Verify create → moderate → publish → browse/filter → save → offer/buy → pay → fulfill/ship → deliver → review/dispute across the retained flows.
- Test automotive filters and individual listing URLs with real stored records only; verify honest empty states when inventory is absent.
- Check desktop and mobile layouts, including the browse filter sheet, photo galleries, forms, dashboards, checkout, and order pages.
- Run focused payment/order regression tests, confirm no broken links or ParkVault/Disney/park-shopper wording remains, and verify every public route has unique Gem State metadata.

## Delivery order

Because this is an entire-app conversion, deliver it in approval-gated phases:

1. **Foundation:** brand system, classifieds compatibility layer, taxonomy, and listing contracts.
2. **Public marketplace:** header/footer, home, browse/search, listing cards, and listing detail.
3. **Seller experience:** create/edit listing, seller setup, selling dashboard, offers, and fulfillment presentation.
4. **Buyer and account experience:** auth, saved listings, buying, orders, notifications, reviews, and disputes.
5. **Admin and launch pass:** moderation, policies, emails, SEO, accessibility, responsive checks, and full flow regression.

Each phase stops for review before the next begins, while the underlying live transaction behavior remains intact throughout.
