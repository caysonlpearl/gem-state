# Home listing detail experience

Home listings keep their photo collage, seller/contact behavior and feed attribution. Pricing and the bed/bath/area summary use stronger typography; confirmed reductions in the current listing get a red price-cut badge. Historical sale prices do not imply a current discount.

Overview, facts, available price/tax history, the sale payment calculator and neighborhood map render together. The sticky Home information links jump to sections, with scroll offsets measured from the site header. Rental pages retain rental terms and do not show a purchase mortgage calculator.

Public feed addresses and available coordinates are retained on externalHome and used for the map and directions. Native seller listings without a public property address keep an area-level map. School names/districts appear only when provided by the listing data; neighborhood links provide walking, cycling and school exploration. Numeric Walk Score or GreatSchools ratings are not fabricated, scraped or enabled by this layout change; they require appropriate API access and display rights.

Partner contact cards show a blue Request a tour link and outlined Contact agent action. A known agent/broker phone is used for contact; otherwise the existing source destination remains the contact path. No inquiry is submitted or tour scheduled automatically. The navy Safe. Simple. Trusted. card uses the existing report flow.

Payment estimates default to 20% down, 6.75% interest and 30 years as illustrative inputs. Buyers can change down payment, rate, term, monthly property tax, insurance and HOA. Blank costs, PMI and closing costs are excluded; the starting interest rate is not represented as a live quote.

Related homes use only existing public inventory, filtered to the current sale/rental mode. The pool is ranked by location, relative price, bedrooms and size, deduplicated by listing/address, and split into Similar homes and More homes to explore when enough inventory exists. Public views do not reserve provider calls or write member listings.

Validation: home-shopping tests cover public/private map selection, current-listing price cuts, sale/rental filtering and recommendation deduplication. The built-worker home-listing-layout-smoke checks sale and rental SSR, all section content, contact copy and exact map queries using cache fixtures and forbids provider requests and database writes.

Facts are now rebuilt into deduplicated label/value groups before display, including existing cached Redfin fields that flattened multiple categories into a single string. Raw tour URLs become labeled links, placeholder values are omitted, and the old duplicate amenity badge wall is removed. Core dimensions appear first; values wrap left-aligned in a two-column desktop grid and one column on phones. Highlight cards use a fixed 80px row height, separate labels/values and a concise parking summary. Future Redfin appliance/heating selections match entry labels rather than incidental words in unrelated values.
