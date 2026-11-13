# Bluebird native apps: implementation and release ledger

Updated November 12, 2026. This is a source/build milestone, not store approval or a completed beta.

## Current result

`apps/mobile` is a separate React/Capacitor application that bundles its own
assets. It does not load the whole website through `server.url`. The app uses
Bluebird's existing Supabase accounts, listing services, cached feeds, saved
items, conversations and photo-upload pipeline through `/api/mobile/v1`.

Both native projects are checked in. Android debug compilation has succeeded
locally with Java 21, Android SDK 36 and Capacitor 8.6.2. The owner explicitly
authorized acceptance of the Android SDK license. No store accounts, store
agreements, purchases, signing keys, Firebase project or paid capacity were
created by this batch. Full Xcode is absent, so the iPhone project is not yet
compiled. No physical Android device was attached when checked.

Phone/tablet browser checks verified browsing, detail pages, responsive layout
and the two signup controls at 320, 390 and 768 pixels. These are not substitutes
for real-device journeys. The backend changes and SQL in this branch are not
live. A release build points at the canonical production API and cannot be
used for end-to-end testing until that API and its dependencies are deployed.

## Baseline and ownership

The isolated branch starts from `origin/main` commit `3a733bb`. Existing dealer,
homes, business reporting and website personalization work is preserved in
other checkouts. At the initial read-only check (2026-11-13 00:38 UTC), the
website returned HTTP 200 with 0.718-second time to first byte and 0.850-second
total request time. That is one observation, not a latency percentile or a
capacity test. The database reported 29 categories and 444 active listing
rows; eligibility and cached external feeds are separate from that count.

Lovable reports an external Supabase project, so its database query tool cannot
measure this database's capacity. Confirm Supabase usage, connection budget,
slow queries, email credentials/delivery configuration and scheduled-job health
in the owning dashboards before enabling new workloads. No extra hosting or
compute has been purchased.

The intended owner login is `cayson@xstayproperties.com`; the legal business
that owns Bluebird has not been identified. An email address does not establish
the legal entity. Organization enrollment needs that entity's matching legal
name, address, authority and D-U-N-S information. Owner checkpoints are identity
verification, agreements and payment. Current published fees are Apple
US$99/year and Google Play US$25 once; tax/local currency may vary.

Official enrollment references:

- https://developer.apple.com/help/account/membership/program-enrollment
- https://support.google.com/googleplay/android-developer/answer/6112435?hl=en
- https://support.google.com/googleplay/android-developer/answer/13628312?hl=en

## Developer setup

Install root and app dependencies separately:

```sh
npm ci
npm ci --prefix apps/mobile
npm run build:mobile
npm run test:mobile
```

For local development, run the website backend and set the app's ignored
`.env.development.local` to `VITE_MOBILE_API_ORIGIN=http://127.0.0.1:5176` (or
your local backend port), then run `npm --prefix apps/mobile run dev`.
Backend service credentials stay in its private environment, never a `VITE_`
variable or the app bundle. The production build rejects a noncanonical API
origin. Use `apps/mobile/.env.example` for the production origin.

```sh
cd apps/mobile
npm run sync
# On this Mac, tool paths can be supplied for one command:
JAVA_HOME=/opt/homebrew/opt/openjdk@21 ANDROID_HOME=$HOME/Library/Android/sdk ./android/gradlew -p android assembleDebug
```

For an installed device, deploy a compatible HTTPS backend first. Set the
Supabase custom redirect allowlist to
`com.onbluebird.marketplace://auth/callback`; configure Apple as an auth
provider and validate Google/Apple linking with existing accounts. Do not ship
unconfigured social-login options. The app id is
`com.onbluebird.marketplace`; confirm ownership/availability when enrolling.

Create Apple signing credentials, APNs capability/entitlement and associated
domains after enrollment. Add the verified Apple team identifier to the
website's apple-app-site-association file. Add Google Play signing certificate
SHA-256 fingerprints to assetlinks.json. Neither association has been published
with guessed IDs. Native custom callback support is present; verified HTTPS
links are still a setup/test gate.

## API and authorization boundaries

All routes return `{data,requestId}` or `{error:{code,message},requestId}` and
`Cache-Control: no-store`. Native origins are explicitly allowed; they are
never identity proof. Private routes verify the bearer session on the server
and derive the account id there. Released API v1 must remain compatible with
already-installed app versions. Do not replace it with generated server-function
URLs or arbitrary URL/RPC forwarding.

Public reads are `GET bootstrap`, `GET listings`, and `GET listings/:id`.
Search accepts bounded q/category/city/state/price/sort/page inputs. Browsing
uses the shared cache-only feed path and a freshness-bounded homepage fallback
with an explicit incomplete-source notice. Listing validations do not inflate
website view counts.

Authenticated routes include:

- Account and consent: `GET account`, `PUT consent`, `GET/PUT advertising`.
- Saves: `GET saved`, `GET saved-state`, `POST saved`.
- Seller/posting: `GET/POST seller`, `POST listings`, `POST photos/mode|begin|finish`.
- Messages: `GET/POST conversations`, `GET conversations/:id`,
  `POST conversations/:id/messages|read|block|report`.
- Controls: `POST reports`, `PUT/DELETE devices`,
  `GET/POST account/deletion`.

Terms, alert and device-registration writes use validated, server-derived
identity. Current terms are required for marketplace writes; pending deletion
blocks further writes. Device registration and alert updates are idempotent.
Message and listing creation still need end-to-end retry/idempotency hardening
before the beta gate; never silently resend an uncertain creation.

The catalog filter is permanent code. It excludes the firearm category,
firearm merchant inventory, unknown categories, fixtures and obvious weapons
in misplaced listing text across browsing, detail, saves, conversations,
posting and push eligibility. Regex filtering alone is not complete moderation:
expand the catalog review to every prohibited product/service and verify
report queues for every feed source before launch. No paid checkout is exposed.
Provider contracts/redistribution permissions have not yet been cleared for
native distribution; existing website feed access is not proof of permission.

## Shared consent and shopper-system dependency

Apply `20261113030000_mobile_foundation.sql` only AFTER the linked chat's
`20261113010000_shopper_personalization.sql` is merged and applied. This batch
adds native-specific controls/devices/outbox/deletion/advertising records and
reuses shared `shopping_accounts`/`shopping_consents`/`shopping_queue`.
The migration is locally tested with PostgreSQL-compatible fixtures, not yet
applied by this branch to production.

Exactly two signup choices are present, including a social-account onboarding
step: required terms and optional initially-unchecked shopping alerts. There is
no frequency selector or universal daily email cap. OS notification permission,
ATT and optional ad consent are separate. Existing members are not enrolled in
expanded shopping alerts automatically. A later opt-out suppresses queued
shopping delivery; initial onboarding preserves separately requested web
saved-search handling. Operating-system permission never substitutes for
Bluebird's own shopping permission.

The shared shopper-learning implementation is being authored in
`work/shopper-personalization-20261112` by the referenced chat. It is deliberately
not copied while uncommitted. The mobile app still needs adapters for native
activity, guest install identifiers, recommendations and history controls after
that shared implementation is available. The app must exclude all browser
fingerprinting inputs, keep first-party learning separate from advertising,
respect explicit filters/sorts and make zero listing-provider requests from
recommendations. SigLIP embeddings belong on the separate private runner;
never add inference to API requests or the small inventory machine.

Terms/privacy links currently use the website's policies page. Switch them to
the accurate published shared terms/privacy pages after integration; publish
retention, moderation and app catalog explanations before enabling collection.

## Push and advertising setup

The native push worker is `infra/mobile/push-worker.mjs`. The service/timer are
installation templates, not enabled services. It sends direct APNs HTTP/2 on
iPhone and FCM HTTP v1 on Android. Configure a private file containing
`supabaseUrl`, `supabaseServiceKey`, optional `apns` (keyId, teamId, privateKey,
sandbox) and optional `firebase` (project_id, client_email, private_key).
Use restrictive file permissions/systemd credentials. Never commit those files.

A notifications insert queues one delivery per current device; logical keys,
SKIP LOCKED claims, lease IDs and provider collapse identifiers protect retries.
Before provider handoff the worker reloads consent, ownership, unread state,
blocks, deletion state, pause switch, lease and cached listing eligibility.
Invalid provider tokens are removed. Push text is generic and excludes private
message bodies. At-least-once provider handoff can still produce duplicates
across a network timeout; test visible deduplication on actual devices.

The one-minute worker must run separately from recommendation computation and
feed refreshes, within measured infrastructure limits. Unread badges, precise
shopping-candidate suppression after dismissal/purchase, notification inbox,
cold starts, account switching and closed-app delivery need device tests and
remaining implementation. Shopping candidate evaluation and emails remain
owned by the shared 15-minute worker; do not create a second reminder schedule.

Push activation requires BOTH `BLUEBIRD_MOBILE_PUSH_ENABLED=true` on the backend
and `mobile_controls.push_enabled=true` in the database. Advertising similarly
requires `BLUEBIRD_MOBILE_ADS_ENABLED=true` and
`mobile_controls.advertising_enabled=true`. Both default off. Advertising plugins are also excluded from native projects by
default, preventing missing Meta configuration from breaking prototype startup.
After configuring both providers, set `BLUEBIRD_MOBILE_NATIVE_ADS_READY=true`
when running `npm run sync` to include the native advertising plugins. The app
checks native plugin availability before showing advertising controls. Android
FCM auto-initialization is off until explicit device registration. Configure Firebase
and Meta project IDs privately before enabling. Android/iOS static defaults
turn automatic advertising collection off. Native event exports use the shared
allowlist and stable event IDs, check server consent before export, do not
replay pre-consent events and require ATT authorization for iOS tracking.
Neither app permission nor native ad consent enables website tracking.
Revocation/provider failure behavior needs full native verification; do not
claim measurement is active from an SDK dependency alone.

## Deletion and moderation: incomplete release gates

The app and `/delete-account` website route currently RECEIVE a verified,
idempotent deletion request. That request immediately removes push tokens,
disables mobile advertising, withdraws shopping alerts and suppresses queued
shopping delivery. It is not yet full account deletion. Identity, photos,
public posts, recommendation history, Apple token revocation and retained
transaction/dispute records need a tested deletion/anonymization processor
with documented retention exceptions. Do not present a pending request as
completed deletion or submit this prototype as compliant.

Existing report/block domain actions are reused. External homes/pets and other
unsupported report routes still need source-wide moderation handling; validate
that a real moderator can resolve every supported-source report and that blocked
members remain blocked across channels.

Official release references:

- https://developer.apple.com/app-store/review/guidelines/
- https://developer.apple.com/support/offering-account-deletion-in-your-app/
- https://developer.apple.com/app-store/user-privacy-and-data-use/
- https://support.google.com/googleplay/android-developer/answer/9878810?hl=en

## Verification and next batches

Local checks at this milestone: root TypeScript, website production build,
mobile TypeScript/Vite build, Android debug compile, mobile security/queue/SQL
tests, full marketplace test suite (1,141 passing), and responsive browser smoke
checks. Browser evidence is stored outside source at
`output/mobile-apps-20261112`. The smoke script makes no account writes or sends.
Python Playwright is required by the existing full-suite KSL DOM test.

Phase status and concrete outstanding checks:

- Phase 0: baseline documented; enrollment, provider approvals and measured
  database/email/job capacity remain open. No validated hour estimate yet.
- Phase 1: bundled project and stable API implemented; iPhone compilation and
  both real-device authenticated journeys remain open. Complete those before
  revising the remaining effort estimate or scaling the feature set.
- Phase 2: consent/request controls implemented; full deletion, Apple provider,
  accurate policy publication and source-wide moderation remain open.
- Phase 3: shared website service is in progress elsewhere; native adapters,
  no-fingerprint activity and recommendation UI are still open.
- Phase 4: push outbox/worker implemented but inactive; credential setup,
  shopping suppression integration, unread state and real-device delivery are
  still open.
- Phase 5: permission-gated native measurement adapter implemented but inactive;
  SDK configuration, privacy disclosures and consent/revocation device tests
  remain open. Shared ranking evaluation remains with the shopper service.
- Phases 6–7: not started. Require no critical/high-impact defects, privacy
  manifests/labels/Data Safety, real beta users and a seven-day observation
  window, store metadata/reviewer accounts, owner agreements/payment, review,
  gradual release and seven days of post-launch monitoring.

Keep separate pause switches for recommendations, shopping delivery and ads.
Rollback the mobile backend compatibly; retain API v1 for installed versions.
Stop delivery/advertising first during an incident, rather than breaking core
browsing or message writes. Preserve the website's separately consented work.
