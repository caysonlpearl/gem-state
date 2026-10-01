# Phase 5 live evidence

Run date: 2026-10-01
Base URL: https://gemstateclassifieds.lovable.app
Browser: Codex In-app Browser

## Automated release gate

`npm run test:phase5`, `npm run test:inventory`, `npm run test:release-gate`, the changed-file ESLint pass, `npm run build`, and `git diff --check` passed.

The live route gate returned the following verified states:

- `200 /`
- `307 /browse -> /browse?allCategories=false`
- `200 /policies`
- `200 /safety`
- `200 /contact`
- `307 /account -> /account?section=overview`
- `200 /create-listing`
- `200 /selling`
- `200 /buying`
- `200 /watchlist`
- `401 /api/internal/dealer-inventory` without the internal secret

## Responsive and keyboard matrix

The public homepage, vehicle browse results, authenticated account overview, and admin validation view were opened at 1440, 768, 390, and 320 CSS pixels. Each route had a deliberate main region and no browser-wide horizontal overflow after the validation table was made scroll-contained. The homepage mobile menu opened from the keyboard reachable `Open menu` control and closed with Escape; the focus returned to the menu trigger. The skip link, account control, search fields, category menu, location field, and Search button were reached through repeated Tab navigation.

The rotating homepage headline was sampled across multiple rotations at a narrow viewport. The headline block now reserves the tallest supported shape so changing copy does not change the hero height or shift the rest of the page.

Physical-device, Safari, and Firefox passes are **untested**. The current execution environment exposes the Codex In-app Browser only for this run; those checks require the corresponding browser/device surfaces.

## Controlled-record manifest

Evidence was captured before retirement. Synthetic records were identified by the `AUDIT` prefix and the designated test seller/member accounts.

- 5 synthetic asks/listings: general boundary item, rental boundary, hourly job, handyman service, and dog placement. All five were set to `cancelled` and `is_demo=true` with a Phase 5 retirement note; no rows were deleted.
- 5 synthetic dealer inventory sources: mock, JSON, XML, scheduled HTTPS fixture, and scheduled raw fixture. All five had their feed URL and schedule cleared and were annotated with a Phase 5 retirement error; historical sync runs remain for evidence.
- 2 synthetic saved searches were paused and email alerts disabled.
- 11 synthetic notifications were marked read.
- 11 synthetic conversation messages, including one attachment message, remain in the controlled conversation as immutable audit evidence.
- 1 classified-listing report and 1 conversation report remain in reviewed state with their resolution history.
- 2 synthetic analytics events remain for telemetry verification.
- The designated seller profile and ordinary/member accounts were preserved.

No production-wide settings, real user records, payment credentials, or permanent deletions were used for cleanup.

## Observability checks

Browser error and unhandled-rejection listeners are installed at the root. Listing submission, search, mutation, slow-mutation, and browser-error events are recorded with bounded/redacted properties. The admin validation workspace exposes the reliability event group. Mutation latency uses a 1.5 second default threshold (1 second for searches), with slow events emitted separately.

