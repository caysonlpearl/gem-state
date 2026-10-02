# Bluebird Phase 5 release gate

The release gate is repeatable and safe to run after every material marketplace change.

## Automated checks

```sh
npm run test:phase5
npm run test:inventory
npm run test:payments
npm run test:release-gate
npm run build
```

`test:release-gate` checks public routes, protected-route responses, and rejection of an unauthenticated scheduled-inventory request. Set `BLUEBIRD_BASE_URL` to exercise a preview or staging deployment.

## Browser matrix

Each journey is recorded for anonymous, buyer, seller, dealership, and admin roles at 1440px, 768px, 390px, and 320px. Keyboard runs cover Tab, Shift+Tab, Enter, Escape, dialog close, validation recovery, and focus return. A physical-device or Safari/Firefox result is recorded separately from the in-app browser result.

Required journeys:

1. Auth gate → return to the original task.
2. Seller setup → listing → rejection → correction → approval.
3. Buyer search → save → contact → reply.
4. Report → admin queue → resolution → downstream display.
5. Dealer setup → import → moderation → public inventory → update/deactivate.

Every row receives `passed`, `failed`, `blocked`, or `untested`, with the URL, viewport, controlled-record label, and evidence reference.

## Controlled data

Use labels beginning with `BLUEBIRD-QA-` from `controlledRecordLabel()`. Preserve the evidence manifest before taking down or deleting only those records. Never use a real member, listing, message, notification, role, or production-wide setting as a fixture.

## Telemetry acceptance

Browser errors and unhandled rejections write bounded `analytics_events` records without query strings, email addresses, URLs, or UUIDs. Search and listing submission actions emit start, success/failure, completion, and slow-mutation events. Administrators can review reliability events in the Validation workspace.
