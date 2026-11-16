# Account deletion: provider authorizations

## Status and boundaries

This is a source-only phase adapter on top of the encrypted Apple authorization vault, ledger attribution cleanup, and bounded private-record erasure work. It does not activate a scheduler, enable an identity provider, install production migrations, remove an actual Auth account, or complete the full deletion processor. Production activation still requires the complete media, retained financial records, Auth-admin removal, final verification, and operational rehearsal path.

The additive migration is `20261116180000_account_deletion_authorizations.sql`. Apply only to the intended database with the worker disabled and its prerequisites present. The checked-in `supabase/config.toml` project reference must not be assumed to identify Bluebird production. No migration or credential configuration is performed by importing the TypeScript adapter.

## Work and evidence

`createAccountDeletionAuthorizationWork` provides three operations:

- `step`: during the leased authorization phase, prepare one credential, decrypt its verified vault envelope, recheck the current account/job/lease/schema immediately before the provider call, revoke its refresh token, and acknowledge the exact credential envelope. Acknowledgement atomically writes a minimal receipt and removes that vault row. Each call handles at most one credential; the next empty pass marks preparation ready.
- `finalize`: during the identity phase and only after the Auth user is absent, remove temporary identity UUIDs from up to 100 revocation receipts. A subsequent empty pass records finalization. Repeated calls are safe.
- `verify`: independently confirm Auth absence, completed preparation/finalization, no remaining member vault credentials, and no temporary receipt identity UUIDs. This operation does not repair state or mark the entire job complete.

All operations use fresh leased scope and current catalog/function/ACL contracts. Direct receipt/state access is denied to browser roles and service role; the server invokes the restricted RPCs. A completion trigger separately refuses unfinished authorization cleanup. Auth identity insert/update writes share the existing account withdrawal lock, so a newly linked identity cannot repopulate a pending-deletion account.

The server-only Apple configuration contains the vault keyring and an explicit registry of allowed client IDs and revocation signing configurations. It is optional for accounts without captured Apple credentials. A configured credential with missing/wrong keys, corrupt ciphertext, an unknown client, a provider failure, stale lease, or changed schema remains an error requiring retry/review. These failures never silently become the legacy manual-cleanup case.

An Apple identity with genuinely missing historical credentials records `manual_apple_revocation`; a Google-only account does not. Neither case requires Apple keys or an Apple network call. The deletion UI links to [Apple's account instructions](https://support.apple.com/en-us/102571) and makes clear that this optional provider-side action does not block Bluebird deletion. This follows [Apple TN3194](https://developer.apple.com/documentation/technotes/tn3194-handling-account-deletions-and-revoking-tokens-for-sign-in-with-apple): unavailable historical tokens must not prevent account-data deletion.

No raw token, Apple subject, email, private signing key, or decrypted envelope is stored in the new receipt/state tables. Temporary identity UUIDs are cleared after Auth removal. Final job target minimization remains the whole-processor responsibility. Errors returned by the adapter contain only its stable failure code.

## Delivery and cancellation

Provider revocation uses the fixed Apple endpoint and existing empty-200 success contract. SDK mutation retries are disabled. Ambiguous provider results retain the encrypted credential for an idempotent later attempt; a lost acknowledgement after the database commit resumes without sending a second revocation. Abandoned response-body cancellation is started without awaiting an unresponsive provider stream, keeping cancellation within the worker deadline.

## Validation and remaining rehearsal

Disposable database tests exercise the actual migration, actual Supabase SDK adapter and queue orchestration. They cover target isolation, real records/inventory component composition before synthetic Auth removal, lost acknowledgements, ambiguous provider outcomes, key/config/ciphertext failures, schema drift, role restrictions, bounded receipt cleanup, independent verification, and the separate completion guard. A two-connection native PostgreSQL test covers lease takeover and Auth identity writes racing account withdrawal. No live Apple requests or real member deletions occur.

The account UI smoke checks cover normal and pending deletion at 320, 390, and 1280 pixels, including the Apple help link and nonblocking explanation. The screenshots are browser renders of synthetic account data, not physical-device or live Auth evidence.

Before production activation, rehearse the installed GoTrue signup, sign-in, identity linking and metadata-update HTTP flows against the Auth identity trigger. SQL fixtures prove locking and rejection semantics, but do not establish compatibility with the deployed Auth service's complete request lifecycle. Real Apple token capture/revocation and physical-device link opening also remain release checks.

## UI contract

`src/components/account/AppleDeletionNotice.tsx` is shared guidance within the existing cream/navy account UI. Keep it a plain paragraph using the inherited sans-serif font, `text-sm` (14px), relaxed line height, and `text-muted-foreground`; it adds no card, alert treatment, icon, or new palette. The Apple help link inherits that color and uses medium weight, an underline, and a 4px underline offset. Preserve its official destination (`https://support.apple.com/en-us/102571`), new-window behavior, and `noopener noreferrer`. Keep the explicit statement that Bluebird account deletion continues even if the user does not complete the Apple step; this guidance must not become a required checkbox or gate.

In `apps/mobile/src/Account.tsx`, place the notice after the DELETE confirmation field and before the request/cancel controls in the open form, and after the received-request status in the pending state. Both placements use `handleNativePublicLink`. In `src/routes/delete-account.tsx`, keep it in the existing 24px top-margin wrapper below the form/status or sign-in guidance and above the privacy/contact footer. It remains visible for signed-out visitors. This ordinary extension preserves the incumbent account styles and brand assets; no PRODUCT.md, DESIGN.md, or design sidecar is introduced.

The finish review disposition is **ship**, with no material fixes. Normal and pending account UI browser captures are in `/Users/cayson/Documents/ChatGPT/Bluebird/output/account-deletion-authorization-20261116/ui/`: `deletion-{320,390,1280}.png` and `deletion-pending-{320,390,1280}.png`. They cover synthetic account states at those widths, not physical devices, a deployed public `/delete-account` route, live Apple link opening, or completed account deletion. Public-route placement is supported by source inspection; these captures are not screenshots of that route.
