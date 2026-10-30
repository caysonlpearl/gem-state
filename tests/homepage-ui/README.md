# Offline Cars & Trucks homepage regression

Run `npm run test:homepage:ui` from the repository root. Set `PLAYWRIGHT_MODULE_PATH` to a local Playwright module if it is not installed in this checkout. Set `BLUEBIRD_UI_EVIDENCE_DIR` to choose the screenshot/report directory.

This mounts the production homepage route, SiteHeader, listing cards, empty/error/loading components, and real TanStack router/query cache. The featured server loader and its Cars & Trucks query are extracted from the production source. Only its data, analytics and anonymous auth boundaries are synthetic. The secondary homepage data remains a wider Motors pool.

Forty newer parts/trailer records precede six Cars & Trucks records and one out-of-state car in the fixture. The actual production query must select Cars & Trucks in Idaho before pagination. Merely filtering the first broad Motors page in the component fails this scenario.

The checks cover 1366, 1440, 768, 390 and 320 CSS-pixel widths; loading and the eight-second slow notice; successful empty inventory; request failure and explicit retry; no repeated featured cars in later rows; correct Cars & Trucks links; broader Vehicles/parts/trailer destinations; a Twin Falls selection leaving homepage cards and category links statewide, with city/radius applied only after submitting the hero search; and no horizontal overflow. Screenshots use deliberately synthetic inventory and approved local artwork, not live marketplace records.

A separate delayed-allocation fixture supplies the same 24 Idaho sedans to the secondary Motors and recent pools while holding the lead request. Before the fix, lead arrival moved c17–c20 into a secondary row while leaving them in the retained feed, producing 28 cards for 24 listings. The regression requires exactly one copy of every listing after allocation changes. Additional 72-listing cases load page two before lead arrival or hold it in flight across arrival, then load page three. They verify every unique listing survives and pagination proceeds as pages `[2, 3]` without a reset. Set `BLUEBIRD_UI_ALLOCATION_ONLY=1` to run only these three timing scenarios at all five widths.

The fixture has no environment files or credentials. Unstubbed backend imports fail. Browser requests to nonlocal resources, backend endpoints and fetch/XHR are blocked; CSP is a second guard. Tests fail on attempted external requests or unexpected browser exceptions. The intentionally injected request failure is expected to reach the production error boundary; the existing duplicate `Sandy` city-key warning is recorded separately.

Query-level regressions run with `node --experimental-strip-types --test tests/homepage-cars-trucks.test.mjs tests/classifieds-home-lead.test.mjs tests/homepage-category-pairing.test.mjs`. The full suite also includes these tests.

Git history review found a broad Motors homepage request in the original `61e8d13`, curated row `50fdef3`, geography change `c885ec6`, and independent lead-query change `1c9e5bc`. No earlier Cars & Trucks-only server query was identified. This branch implements the subsequently confirmed product scope rather than claiming to revert to an unverified historical query.
