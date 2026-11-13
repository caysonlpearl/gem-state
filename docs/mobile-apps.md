# Bluebird native apps: implementation and release ledger

Updated November 13, 2026. This is a source/build milestone, not store approval or a completed beta.

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
compiled. No physical Android device was attached when checked. An Android 36 ARM emulator
and matching system image are installed. The debug app starts, loads bundled assets
and has no fatal startup or safe-area injection errors in its current process log.
This does not establish authenticated journeys or actual push delivery.

Phone/tablet browser checks verified browsing, detail pages, responsive layout
and the two signup controls at 320, 390 and 768 pixels. These are not substitutes
for real-device journeys. API publication must be verified independently from a
branch or app build. The private mobile SQL
foundation and shopper controls were applied and verified on the owning database
on November 12. A release build points at the canonical production API and cannot be
used for end-to-end testing until that API and its dependencies are deployed and
its canonical HTTPS endpoints pass production checks. Deployment evidence belongs
in the release record; local runtime success alone is not a live deployment.

## November 13 production database verification

Migrations 600, 700, 800, 900 and 1000 were applied from the reviewed repository
files, chronologically, with atomic migration-history records. Stored source
checks matched all five files. Private capabilities, mapping/receipt RLS,
unauthenticated actor rejection, denied anonymous RPC access and denied member
access to the private mapping/capability were verified. The checks created no
production member, listing, message, application, review, upload or email.

The baseline point observation was 276.1 MB, 26 connections of 60 and no other
active queries. This is not a load/performance percentile or a future-capacity
claim. Scheduled job failures last observed at 11:00 UTC had recovered by
15:45 UTC; the separately paused dealer-inventory sweep was preserved. No new
scheduled job, provider refresh, paid service or push credential was added.
Physical-device/authenticated delivery, phone push and complete deletion remain
launch gates. Evidence: `output/mobile-storefronts-20261113/database-verification.*`.

## Shared website design

Publishing-tool check, November 13: Lance's official site advertises source builds
on its cloud Mac, signing/provisioning, Apple capabilities, TestFlight uploads,
App Store submissions and review assistance. It lists $40/month with 2,000 monthly
credits and 500 starter credits. Google Play support has not been verified. This
is a potential release adapter for the existing Capacitor project, not a reason
to redesign Bluebird or replace its recommendation/consent/delivery services.
No Lance account, credentials, subscription or repository access was created.
The owning Apple developer enrollment, agreements and fees remain owner steps.
Source: https://www.lance.app/ (read live).

The app must match the phone website as closely as possible in every aspect: layout, wording, imagery, controls, spacing, navigation, content, and behavior. Reuse actual screens/presenters rather than rebuilding a lookalike. This is a release acceptance requirement, not a loose branding preference.

The existing website is the visual source of truth. Do not create a separate
mobile visual system. The native app imports the website stylesheet, self-hosted
fonts, BrandMark, category artwork, MarketplaceHero, HomeSearchDropdown,
ListingCardView, ListingGallery, MarketplaceListingSection and vehicle lead header.
The website continues using these same presenters with its existing service,
authentication, navigation and analytics adapters. Native adapters use the stable
mobile API and native consent/activity code; website browser fingerprinting and
advertising adapters must never be imported into the app bundle.

`GET home` applies the permanent app catalog boundary before using the website's
homepage snapshot/initial projection. The app uses the same row allocator and
seller grouping. Search controls use the shared city/ZIP/region/state parser;
explicit searches and sorting still use the complete cached browse service.
Provider credits remain visible when shared cards replace the old prototype tiles. The services-directory eligibility check accepts the server-owned app catalog marker; it is safety metadata, not an unsupported inventory filter. Native directory read failures propagate to the existing filtered, explicitly incomplete snapshot fallback instead of becoming a successful empty page. The directory remains database-only, with permanent app-scope filtering applied to returned cards.

The sign-in/sign-up/forgot/reset form, phone tab bar, header sizing and mobile category menu also use shared website presenters. The native tab labels/icons/order now follow the website: Home, Search, Sell, Saved, Messages, with account access in the header. This supersedes the prototype's Browse/Saved/Post/Messages/Account arrangement. Auth adapters preserve native callbacks, explicit signup choices and account ownership; the Apple option is the corresponding native requirement.

Remaining parity work includes the account overview and the remaining account tabs, wider-screen header search/category controls, exact related-listing rails, seller dashboard/navigation/own-listing management and category landing pages. Profile and account/security now use shared website presenters. Do not describe the remaining sections as already migrated. Compare each screen at the same viewport, data and state before beta; record any difference and its reason. Necessary exceptions are permanent app catalog/payment restrictions, native permission prompts, device integrations and phone system boundaries. A proposed design simplification alone is not a reason to diverge.

The earlier text-only wordmark and separate listing-card/photo designs are replaced.
The remaining account presenters and seller management must
also reuse the existing website UI before beta. Existing native controllers and phone navigation
are adapters, not authority to invent a different design. Native notification,
permission and app catalog differences still follow the approved launch plan.

## Shared browse rules and saved-search matching

The website now imports its actual search types, parsing, category normalization and input mapping from `browse-search.ts`. Its server validator is shared in `classified-browse-contract.ts`. Website layout stays unchanged. Mileage bands now enforce their numerical ceiling, and comma-formatted home thresholds keep their full value.

`GET /api/mobile/v1/search` accepts the full supported website filter contract and returns `items`, `total`, `page`, `pageSize`, `nextPage` and `incomplete`. `features.fullSearch` advertises this additive API. The older `GET listings` discovery contract remains compatible with installed clients. Full search uses existing marketplace reads with `readOnlyProviders: true` and rechecks public predicates on returned source cards. If a source returned broader results, the page is marked incomplete and its total is a candidate upper bound rather than an exact match count. Its fallback applies the shared full card predicate and reports `incomplete: true`. It cannot fall back to a broader basic search. Duplicate query keys, unsupported meaningful conditions and invalid filters return 400. Full search shares the website's safe page-number rules and fixed per-read row budget, without inheriting the older discovery endpoint's 100-page ceiling. App catalog scope is server-owned; internal mock/scope overrides are rejected. No database migration or paid capacity is required.

Saved-search candidate generation and immediate pre-delivery checks now translate website names such as `bedrooms`, `propertyType`, `jobType` and posting windows through those same rules. Earlier canonical filter names remain supported. Matching preserves all geographic constraints and avoids landing-page location defaults or category-switch resets. Unsupported legacy conditions fail closed rather than generating unrelated alerts. An app-origin `mobileCatalog: true` scope permanently excludes prohibited inventory in the shared matcher; eligible separately saved website searches keep website catalog behavior. This does not change the existing consent distinction between explicitly requested saved-search matches and broader personalized alerts, or later-unsubscribe suppression.

The native results/filter screens now import the actual website vehicle, homes, jobs and services presenters, general/pet filters, results heading, grid/list/sort controls and saved-search account section. Their router, listing-card and preview-read dependencies are adapters; native imports neither the website tracking layer nor generated server-function URLs. Category landing pages remain separate pending parity work. Full criteria, including older aliases, survive reopening saved searches; unsupported conditions remain visible in the request and fail closed. Studio now enforces zero bedrooms, and the service description-search choice now controls matching on both platforms.

`GET saved-searches` loads the signed-in member's eligible existing searches. `POST saved-searches` and `PUT/DELETE saved-searches/:id` require an immutable logical retry identifier. Migration **`20261113080000_mobile_saved_search_receipts.sql` was installed and its private capability verified on November 13**. `features.durableSavedSearches` follows the cached server-only readiness read. Reads, reopening filters and browsing work independently; mutation controls disable before a write. The SQL transaction derives identity, locks the full owned search, validates the permanent app catalog scope, and commits its private receipt atomically. App scope cannot be removed by later website edits. Results retain only an identifier, never deleted query text. Replay does not recreate a deleted search or re-enable email after later withdrawal. Privacy-only pause/email-off/delete operations remain available without current terms, while new or expanded alerts require them. Native creates default to email off; the existing explicit saved-search matching consent remains distinct from expanded shopping alerts.

Unconfirmed native writes retain the original account-scoped snapshot across reload and explicit retries. Account changes reset shopper identifiers without hiding operational recovery from the original account; another member cannot see, retry or clear that snapshot. A late response cannot clear the new account's pending request. This is verified with a delayed first-account response while a second account independently creates a search. These are synthetic browser/SQL tests, not production member or physical-device proof.

The shared map's explicit **Use my location** action invokes a native foreground, low-accuracy, one-time location read. Android requests coarse permission only. Device coordinates are rounded to two decimals before search/preview/save; manually chosen map centers are not represented as device measurements. No location watch or background mode is enabled. City/ZIP entry and manual map selection stay usable when permission is denied. The map remains an existing website dependency; no extra listing-provider request or paid service was added. Native Back gives open filter drawers/dialogs their normal dismissal before navigating; returning to recent results preserves the current loaded rows and scroll. The app tracks its own bundled-route history because Android WebView can report no back history for hash navigation. Both header and hardware Back use the same tracked boundary, so a cold shared link cannot navigate behind the app launch document.

Validation: isolated SQL and HTTP tests cover replay after later deletion, owner isolation, concurrent receipts, rollback, permanent scope and permission withdrawal. Browser checks at 320/390/1280 cover full category filters, Studio, service descriptions, map permission denial, overlay/back navigation, delayed account-switch recovery, write-readiness outages and zero horizontal overflow. The native bundle is checked for server-only credentials and website tracking imports. Real signed-in iPhone/Android journeys and keyboard/gallery/native permission testing remain beta gates. The November 13 production canary observed roughly 10.8-second Studio reads and a 9.4-second title-only services read; this is not acceptable-performance approval. Profile the native/database read deadline and cache fallback paths against the Phase 0 baseline before beta; no paid capacity has been added.

Android 36 emulator verification also loaded the production catalog (12 Ford vehicles under 25,000 miles), showed the operating system’s approximate-only permission prompt, preserved manual map/city entry after denial, closed the filter drawer with hardware Back without changing the search, and returned from a real listing to that exact filtered search with hardware Back. This is emulator evidence only; iPhone compilation and physical-device proof remain pending.

Dependency audit: the native dependency tree currently reports six high-severity advisories in existing Vite dev-server tooling and the unused Firestore/grpc dependency chain pulled by Firebase. Geolocation is not their source. Do not apply the audit's forced Firebase/analytics downgrade. Resolve with compatible, verified upgrades in a separate measured dependency batch before beta; this change does not claim a clean audit.

## Shared conversation screens and attachment readiness

Messages now render the same `MessagesSectionView` and account section presenters as the website: buying/selling/unread/search filters, conversation list and bubbles, signed attachment links, reply box, retry state, report dialog/acknowledgement and block confirmation. The native adapter uses API v1, account-scoped session drafts and explicit atomic retry receipts. A delayed response cannot clear a different conversation's draft or a newer draft. Private message/file content is not shopper activity or advertising input. Real signed-in device journeys and the full surrounding account-center shell remain unverified/incomplete; browser fixtures do not establish those gates.

The native upload implementation supports the website's JPG/PNG/WebP/PDF and 10 MB boundary. A lost upload/commit response reuses the private object reference and logical request before allocating another upload; file bytes, upload tokens and message bodies are excluded from retry receipt storage. Attachment sends require an `Idempotency-Key`. Finalization verifies the authenticated owner/conversation, current terms, deletion/block status and actual private Storage object MIME/size, then commits the message and its receipt in one transaction. The shared web upload preparation also checks the other participant's block before issuing a token.

**Production database dependency installed November 13:** `20261113060000_mobile_conversation_attachments.sql` is applied on GemList (`udxxfuticbxwiehoepeg`). Browser access to the owning project succeeded; the available CLI login still does not list it. A server-only, cached `mobile_messaging_capabilities` read controls `features.conversationAttachments`, failing closed if readiness cannot be confirmed. Text messages and existing signed attachment links remain independent. Guest actor rejection, private capability permissions, exact journaled source and receipt RLS were verified on production. Authenticated attachment delivery and physical-device journeys remain unverified.

Additive API v1 routes are `POST conversations/:id/attachments` (prepare) and `POST conversations/:id/attachments/send` (commit/retry). They reuse the existing private attachment bucket, signed uploads and conversation domain services; there is no new public media bucket or provider request. Install the migration on the verified owning project, record its migration history and privileges, then verify the capability, cross-account/object isolation, upload/receive/open/retry and blocking with test members before release. Abandoned uploads must also be included in media-retention and account-deletion tests before beta.

Storage metadata is read only; files are not deleted by editing `storage.objects`. References used for the implementation: [Supabase Storage schema](https://supabase.com/docs/guides/storage/schema/design), [Storage object metadata types](https://github.com/supabase/storage/blob/master/src/storage/backend/adapter.ts).

## Shared notifications and unread navigation

The app now reuses the website's actual `NotificationsSectionView`, `NotificationBellView` and `HeaderAccountMenuView`. Filtered activity, mark-one/mark-all controls, five-row bell previews, signed-in identity, keyboard/Escape handling and unread badges use the same presenters. The phone category menu's Notifications link reaches the native account center. Account overview, remaining saved/listing/review tabs, selling navigation and wider header controls are still pending parity work; the app does not expose a paid billing destination.

`features.notificationCenter` advertises the additive authenticated `GET notifications` and `PUT notifications/read` contract. Missing support stops the client before inbox reads. Reads derive the JWT owner, select that member's latest 60 notification rows and at most 100 recent conversation summaries, then validate referenced native listings, cached external inventory, current dealer publication, both participants' block states and job-application ownership. Metadata is batched; directory or listing-provider detail/refresh calls are never used. Read-only stages have five-second deadlines. Invalid references, restricted inventory, unscoped website dealer chats, expired shopping inventory, foreign recipients and website-only payment activity do not appear or contribute to badges. Existing authorized conversations about retained, eligible native listings remain readable after expiry; those same expired listings cannot generate shopping reminders. Native message-list checks batch minimal category facts instead of treating public availability as permission to view private history. Hard-deleted or unverifiable contexts still fail closed. Eligible seller review/application notices can remain readable after their own listing becomes unavailable, without a misleading public-listing link. Source failures return a retry state rather than a successful empty inbox.

Mark-all freezes the currently loaded app-eligible unread inbox. The server rechecks eligibility and passes only those owned, still-unread identifiers to the existing authenticated read RPC; it never uses the global null/all form. This preserves hidden website activity. An uncertain result keeps the original snapshot for retry, so a newer arrival is not consumed by an older operation. The native header, bell, sidebar and center share one owner-scoped state, refresh on acknowledged conversation reads/blocks, schedule polling once per minute while foregrounded, with focus/visibility refreshes and clear on account changes. Notification text and private conversation content are not shopper or advertising exports. Phone permission is separate; this inbox does not enable APNs/FCM or request OS notification permission.

Login callbacks now consume a validated, one-use, 15-minute app return destination, preserve the app's navigation boundary and replace the callback URL so a login code is not left in history. This covers social/email confirmation, magic links and password recovery; password login keeps its current guarded page. It stores no member details, tokens or tracking identifiers. Production Apple/Google login configuration, actual-device callbacks and universal-link association remain release gates.

Validation includes the real filtering/read handler with synthetic owner-scoped database projections, replay after a lost acknowledgement, fresh arrivals, publication withdrawal, blocked members, forged scope and untrusted destinations. Browser journeys at 320/390/1280 cover shared controls and navigation, preview-only read acknowledgements, independent second-account writes during a delayed first-account response, background polling suppression and zero horizontal overflow. Existing account/auth/message regressions pass. These tests create no real accounts, messages, notifications or emails. Private production writes, actual-device inbox behavior and phone push delivery are not claimed as verified.

## Shared listing details and contact actions

The app imports the website's actual listing-detail presenters: vehicle, home/rental/community, job, service/directory, pet/rescue and general layouts, galleries, facts, seller/contact cards, safety information, price insight and phone contact bar. Website controllers retain their existing services and analytics. Native adapters use the stable API, system sharing and validated links. A separate lazy detail bundle keeps these layouts out of the initial download's main JavaScript chunk. Public counters read existing aggregates without recording a website visitor or deriving an IP/browser fingerprint; acknowledged saves refresh the displayed count.

`features.listingDetails` advertises the additive `GET listings/:id/detail` contract. The recursive closed projection retains public, permitted contacts and category facts, strips unknown/private/provider raw fields, sanitizes media/contact URLs, and filters nested cards against the permanent app catalog. Ended listings remain readable with saving/messaging disabled. Failed source reads show retry rather than inventing a missing listing. Price insight reuses existing cached domain logic and provider budgets; no new paid capacity or refresh workload is introduced. Older installed clients keep their existing endpoint and fallback.

Shared contact/login, report, claim and job-application forms retain the website's appearance. Native owner/install checks run before and after responses, and private query/form state is isolated by account. Guest contact sign-in returns to the original listing; signup retains exactly two choices with optional shopping alerts unchecked. Native sharing uses the canonical listing title/URL. The skip link focuses the single main landmark without changing the hash route. In-page home section and payment links scroll within that listing while preserving the app route. Printing is website-only, and paid vehicle-history report purchase controls are omitted under the approved deferred-payment boundary. Claims derive the business and actor on the server; failed claim reads cannot imply an unclaimed business.

**Production application dependency installed November 13:** `20261113090000_mobile_job_application_receipts.sql` was applied after the earlier mobile migrations on the verified owning database. `features.durableApplications` follows private readiness; if missing/unavailable the app stops before collecting/uploading a resume or submitting an internal application. External eligible application links and job browsing remain independent. The transaction validates current terms, account state, current eligible job, blocks and an owned private resume with an allowed type/size. It commits the existing application and an identifier-only receipt atomically. The receipt retains a hash, never a cover letter, resume filename/bytes or upload token. Exact retry cannot reset an employer's review or create another logical application notice; a deliberate new update has its own receipt.

Native resume uploads use immutable server-derived paths and no overwrite. Explicit retries retain the same logical receipt after a lost upload or application acknowledgement, including an anonymous-identifier reset. The commit verifies the actual private object; a definite rolled-back missing-file response permits a fresh upload on the next explicit retry. Account changes stop stale responses from changing a different member's screen. Email delivery failure does not undo a committed application. Resume retention/orphan cleanup and full account deletion still require the owning deletion processor before launch.

Browser fixtures exercise 14 source/category variants at 320/390/1280 pixels, guest authentication, saves/counts, canonical sharing, reporting, claims, messages, account switching, source failures, separate permissions and lost upload/application responses with one stored resume. Actual SQL is exercised in an isolated PostgreSQL runtime for replay, rollback, owner/catalog/file checks and employer-review preservation. These tests create no production members, files, applications, messages or email. Run `npm run test:mobile:details:ui`. Authenticated production, physical-device file/share behavior, cross-connection database concurrency and iPhone compilation remain unverified.

Category landing layouts, account overview/remaining tabs, seller management and exact related rails remain in scope. Seller/dealer links now open the shared native storefront pages described below. Place links preserve canonical city/region, radius and collection filters while those landing presenters are pending. The app is not yet fully 1:1.

## Shared seller and dealership storefronts

Seller/dealer links now open actual native storefront pages instead of substituting filtered search. `SellerStorefrontView`, `SellerListingGridView`, `SellerReviewFormView`, `SellerReviewFlagView`, `DealerStorefrontView`, `DealerStorefrontHeaderView` and `DealerContactPanelView` contain the website's markup and form state. Platform adapters supply links, authenticated actions and analytics. The website retains its existing handlers and legacy listing modal; native seller inventory opens the shared direct-contact listing page under the approved marketplace launch model. Checkout code is not imported into the native bundle. Dealer inventory uses the same listing-card presenter already shared with browse/detail. Small shared wrapping fixes preserve dealer logos, long names and report controls on narrow phones.

Additive `GET sellers/:slug` and `GET dealers/:slug?page=N` routes advertise `features.storefronts`. The server owns the app catalog flag, excludes restricted/misplaced/expired/unpublished seller inventory **before signing photos**, filters reviews consistently, and computes app counts from eligible inventory. Dealer reads use existing cached inventory through `loadMobileBrowseInventory` or the published feed, without listing-provider refreshes. Closed projections omit private/future fields and sanitize media/contact links. Missing/failed reads return an unavailable/retry state rather than editable defaults or fabricated empty profiles. Registered dealer headers now honor the owner's existing internal-message preference, like feed-backed dealer headers.

`GET/PUT sellers/:slug/review` derives the seller from the public slug; input cannot supply a seller or reviewer identity. Reporting at `POST sellers/:slug/reviews/:id/report` rechecks that the visible review belongs to that seller. Existing authenticated review/moderation services retain ownership and SQL controls; self-review and blocked-member review writes stop on the server. Own-review read failures disable editing until retry; failed saves retain drafts. Refreshes preserve unsaved review edits. Account changes isolate query clients and form state, and response checks prevent a delayed prior-account result from clearing or changing the new account's form. Review, moderation and private message text are never shopper-learning or advertising payloads.

**General dealership messaging migration `20261113100000_mobile_dealer_conversations.sql` was installed November 13**, following migrations 600–900 in chronological order on the verified owning project. Its private capability and guest/direct-table access rejection were verified. `features.durableDealerMessages` follows cached server-only readiness; the native compose panel stops before collecting message text while the dealership's public contact options remain usable. `POST dealers/:slug/conversations` derives the actual dealer, requires the original retry identifier and delegates to an atomic SQL operation. Current terms, deletion state, ready/approved dealership, owner, contact preference, blocks and rate limits are rechecked. A receipt and the ordinary message/notification commit together, using the existing send-message domain function. Exact retry returns its original result without a second send or notice; email failure does not undo business success.

App-created general dealer conversations have their own private mapping and separate thread from unscoped website chats. Existing website threads are never relabeled or imported into the app. Participant identity must match the trusted mapping before native conversation reads/actions, notification previews or unread badges include the thread. No fake listing reference is assigned. Replies, reporting and blocking reuse the existing participant-authorized services. Receipts and mappings contain identifiers/hashes only, with account/conversation deletion cascades. Full account deletion/retention processing is still a separate open launch gate.

Native routes preserve inventory page links, in-page inventory scrolling, guest login return and the owning dealer's inbox link. Public profile deep links are recognized, with Android route declarations; verified domain association and physical-device handling remain release gates. The public seller profile link in native account settings now uses this route when supported. Paid destinations remain excluded. Native first-party/advertising adapters stay separate from website business analytics; app profile actions never import its IP/browser tracking.

Validation includes the actual seller/dealer handlers with mocked storage/database boundaries, closed projections, source failures, filters-before-photo-signing, contact preferences, strict API routing and owner-derived review/report writes. The actual SQL and existing send-message function run in isolated PostgreSQL, proving replay, rollback, separate website/app threads, blocks, preferences, owner isolation, terms/deletion and denied direct table access. The ninth browser suite, `npm run test:mobile:storefronts:ui`, covers 320/390/1280 pixels, profile layouts, inventory pagination/anchors, reviews/reporting, failed reads, lost message acknowledgement, conversation read/reply/report, unavailable capability, account changes, guest return, own-profile/owner-inbox behavior, and shopping permission off/on without private text exports. Fixtures create no real accounts, reviews, messages, flags or email. Migration installation and access checks are verified separately on production. Authenticated production writes, phone push and physical-device journeys remain unverified.

## Shared profile, account and security controls

The native account prototype is replaced by the website's actual `AccountLayoutView`, `AccountProfileView`, `AccountSettingsView`, form state and preference presenters. Profile, account/security and notifications are connected; the full overview, saved-listings, reviews and listing-management account destinations remain to be connected. Existing Saved and Messages phone-tab journeys continue through their existing controllers. This is an incremental migration toward full parity, not a reduced final account-center scope.

Native profiles support display name, primary market/intent, profile photo upload/removal, seller-profile editing and all five contact preferences. The same forms remain on the website with its existing services and query invalidation. Native links reach the shared seller setup through `/post/profile`. The native public-profile link now opens the shared seller storefront, guarded by API support and its eligible inventory projection. Admin and paid billing controls remain website destinations. Native email settings preserve the existing billing-receipt preference without exposing the paid upgrade flow.

New API v1 endpoints are `PUT account/profile|avatar`, `GET/PUT account/contact-preferences|notification-preferences`, and `DELETE devices/all`. Authenticated domain services retain ownership/RLS; complete, allowlisted preference objects reject extra fields and partial writes. The server derives onboarding state and identity. No migration or provider request is added by these endpoints. `features.accountControls` marks API support; the new client stops before preference reads when the backend lacks that support. Missing/failed preference reads render a retry state, never editable defaults that could overwrite existing settings.

Profile-photo uploads freeze the form's account/install identity through upload and the subsequent avatar write. An account switch cannot publish the photo on the new member. Refreshing a photo does not reset unsaved profile/contact fields, and failed saves retain edits. Shopping alerts continue using their own server consent, independently of legacy email settings, operating-system phone permission and advertising permission. Profile/email/phone values are not shopper activity or advertising inputs. Password recovery returns through the existing native callback.

Ordinary sign-out on the website and app uses the local Supabase scope; the separate global control revokes the authenticated member's push registrations before global session sign-out. Both clients share owner rechecks and stop when revocation fails. Local token removal remains separate. Auth-provider errors leave an error state; neither action claims that revoked access JWTs expire sooner than the provider's actual behavior. In-app deletion still records a request/status and requires explicit confirmation; full deletion/anonymization processing remains unimplemented and a release blocker. The website account deletion link now reaches the existing dedicated deletion-request route.

Validation includes actual profile/avatar domain handlers with authenticated-owner assertions, native upload account-switch checks, API authentication/terms/deletion/field allowlists, and synthetic browser journeys at 320/390/1280px. They cover unavailable API support, failed preference reads, failed saves, unsaved edits across photo updates, both sign-out scopes, password recovery, separate shopping consent and deletion request acknowledgement. Fixtures create no real accounts, photos, emails, or deletion requests. Run `npm run test:mobile:account:ui`; real signed-in phone and production account journeys remain beta gates.

## Shared seller setup and listing forms

Native posting imports the website's `SellerSetupView`, `CreateListingHeader`, `ListingFormView`, form state, submission mapping and all six category-specific forms. This replaces the generic schema-driven prototype. Website create/edit/duplicate retain their existing services, mutation acknowledgements, analytics and navigation. Native uses API v1 and account-scoped drafts, keeps existing shipping preferences when saving a public seller profile, and requires the seller agreement. The native heading omits the paid-promotion upsell under the approved payment boundary.

`POST vehicles/vin` reuses the website's authenticated NHTSA lookup and shared field-fill controls; it is user-triggered and does not refresh paid listing providers. Photo upload freezes account/install identity throughout the original upload and mirror fallback. The form preserves Idaho city/region validation, complete structured fields, photo rights, previews and ordering. Draft metadata is scoped to the signed-in account; file bytes and signing tokens are not stored in session drafts.

Native listing submission now carries a stable `Idempotency-Key` and persists its exact payload and own photo references before sending. An uncertain outcome locks those original fields and exposes an explicit retry, including after reload. Permission/session rejection of a retry must retain that original receipt because it cannot prove the first attempt failed. Success clears the draft and confirms moderation review; it does not navigate to an unpublished public listing. The complete selling dashboard, native edit/duplicate and own pending-listing management remain release gates.

**Production dependency installed November 13:** `20261113070000_mobile_listing_receipts.sql` delegates to existing classified/free-pet domain functions and commits listing details and the private receipt in the same transaction. It was applied after migration 600 on the verified owning Bluebird project. `features.durablePosting` stays false if its private capability read is missing/unavailable; the new client stops before photo upload or listing submission. The existing website posting path is unchanged. Do not report real native posting as verified until authenticated device journeys pass.

Validation uses actual SQL in an isolated PostgreSQL runtime for rollback/replay/owner isolation, mocked native upload account changes, and synthetic browser journeys at 320/390/768 pixels for shared seller setup, six form types, VIN, city validation, draft/account isolation and recovery after a lost submission response. Fixtures create no real members, photos or listings. The CI entry is `npm run test:mobile:posting:ui`. Real camera/gallery, keyboard/back behavior, file handling and both physical devices remain beta requirements.

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

## Apple release automation candidate: Lance

The owner shared Ayo Omolewa's reel about wrapping existing sites and using Lance for release operations. The app is already based on Capacitor; this does not require a new visual design. Lance's official pages, checked November 13, 2026, advertise source-based builds/signing on its cloud Mac, TestFlight, App Store metadata/screenshots, Apple capabilities and submission/review handling through an authenticated MCP connection. This could cover the missing local Xcode build/signing setup. These are vendor claims, not a successful Bluebird build or an approval guarantee. Equivalent Google Play management was not confirmed in the inspected documentation; the Android build continues using the working local project.

Pricing currently lists 500 free starter credits for the first 30 days after connecting App Store Connect, then a $40/month Pro plan with 2,000 monthly credits. Optional automatic credit top-ups are $20 per 2,000 credits and must not be enabled by assumption. No Lance account/connection, subscription, payment or repository access has been created/granted. Bluebird still needs its owning Apple Developer account and verified entity; nothing in this option completes beta, moderation, privacy, deletion or device testing. Consumer subscriptions/IAP are deferred in the approved launch, so Lance's IAP automation is not a launch dependency.

If adopted after account setup, the release input is the verified pushed repo, `apps/mobile/ios/App/App.xcodeproj`, scheme App, bundle `com.onbluebird.marketplace`, root and `apps/mobile` dependency installation, followed by the existing mobile build/Capacitor sync. Keep the bundled website presenters and canonical API, use the real Apple signing identity, and preserve all catalog/privacy gates. Review the first build and TestFlight results before a store submission. No unverified release build should be reported as published.

Official references: [Lance capabilities](https://www.lance.app/), [pricing](https://www.lance.app/pricing), [connection and tools](https://www.lance.app/docs).

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
opens with a freshness-bounded published snapshot and labels it as a selection.
Explicit search, category, location, price and sort choices use the shared
cache-only browse service, with a clearly labeled snapshot fallback on failure. Listing validations do not inflate
website view counts.

Authenticated routes include:

- Account and consent: `GET account`, `PUT account/profile|avatar`, `GET/PUT account/contact-preferences|notification-preferences`, `PUT consent`, `GET/PUT advertising`.
- Saves: `GET saved`, `GET saved-state`, `POST saved`.
- Seller/posting: `GET/POST seller`, `POST listings`, `POST photos/mode|begin|finish`, `POST vehicles/vin`.
- Messages: `GET/POST conversations`, `GET conversations/:id`,
  `POST conversations/:id/messages|read|block|report`.
- Controls: `POST reports`, `PUT/DELETE devices`, `DELETE devices/all`,
  `GET/POST account/deletion`.

Terms, alert and device-registration writes use validated, server-derived
identity. Current terms are required for marketplace writes; pending deletion
blocks further writes. Device registration and alert updates are idempotent.
Native message starts and replies preserve an account-scoped retry identifier.
The message and its private receipt commit in one transaction; retries return the
original result without sending or emailing twice. Pending receipt identifiers
survive session restoration, carry no message bodies, and never replay automatically.
The 20261113050000_mobile_message_receipts migration is installed and recorded in
production; actual authenticated native journeys remain a beta gate. Listing
creation has equivalent source-level receipt protection in installed migration 700;
never silently resend an uncertain post or treat that migration as installed.

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
The foundation and 20261113040000_mobile_shopper_controls migrations are applied
to production and recorded in Supabase migration history. A live post-check
verified RLS on all five mobile tables, denied anon/member reads and execution,
and confirmed push/advertising remain paused. An isolated production transaction
verified native personalization withdrawal preserves website ad consent; its
synthetic changes were rolled back.

Exactly two signup choices are present, including a social-account onboarding
step: required terms and optional initially-unchecked shopping alerts. There is
no frequency selector or universal daily email cap. OS notification permission,
ATT and optional ad consent are separate. Existing members are not enrolled in
expanded shopping alerts automatically. A later opt-out suppresses queued
shopping delivery; initial onboarding preserves separately requested web
saved-search handling. Operating-system permission never substitutes for
Bluebird's own shopping permission.

The shared shopper implementation and subsequent fixes through PR #194 are integrated into
the mobile branch. Native adapters reuse its activity, favorites, ranking, vector
retrieval, holdout and privacy records. The mobile interface strips fingerprints,
hardware/browser characteristics and private content before storage. Public
cached inventory validates activity references and filters restricted website
interests before choosing seeds or returning app recommendations. No native
recommendation or similarity read calls a listing provider.

The app now includes Recently viewed, Continue shopping, Recommended for you and
similar listings. Visible impressions carry placement, position, model and ranking
features. Detail views, foreground viewing time, photo interactions, saves,
searches, contacts and acknowledged dismissals use the same shopper system.
Explicit searches/categories and nondefault sorts keep recommendation rows out
of their results. Ordinary browsing remains available when learning is off,
preferences cannot be loaded, vectors are missing or recommendations fail.

Privacy choices are separate from the two signup controls. Signed-in preferences
and history are account-scoped across web/apps; guest identifiers are installation
specific, reset on guest-history clearing and account changes, and never merge
guest history into another account. Collection starts only after server-confirmed
personalization. Pending telemetry is discarded on withdrawal/account changes,
and the API checks the expected account/install again after session resolution
so a delayed batch cannot be reassigned. Native background time does not count
as active viewing. Mobile privacy writes preserve website advertising consent.

App links use the shared terms/privacy pages. This branch adds accurate phone-app
privacy/catalog explanations; publish them with the mobile API before collecting
app activity. Full legal-entity, moderation and deletion disclosures remain release
gates. Embeddings stay on the independent private runner.

## Push and advertising setup

The native push worker is `infra/mobile/push-worker.mjs`. The service/timer are
installation templates, not enabled services. It sends direct APNs HTTP/2 on
iPhone and FCM HTTP v1 on Android. Configure a private file containing
`supabaseUrl`, `supabaseServiceKey`, optional `apns` (keyId, teamId, privateKey,
sandbox) and optional `firebase` (project_id, client_email, private_key).
Use restrictive file permissions/systemd credentials. Never commit those files.

A notifications insert queues one delivery per current device; logical keys,
SKIP LOCKED claims, lease IDs and provider collapse identifiers protect retries.
Phone shopping delivery reuses the email eligibility service, including durable
dismissal/purchase/reminder stops, saved-search state, current prices and dealer-feed
publication. Its own email receipt does not suppress the corresponding phone alert;
email provider failures do not disable phone delivery. Before provider handoff the worker reloads consent, ownership, unread state,
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
shopping delivery. It is not yet full account deletion. See docs/account-deletion.md for the live relationship audit. Identity, photos,
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
tests, the full marketplace test suite, and responsive browser smoke
checks. Browser evidence is stored outside source at
`output/mobile-apps-20261112` and subsequent dated mobile release folders; use each release's exact-source evidence for current counts. The original smoke script makes no account writes or sends. The new shopping UI
suite uses explicit synthetic API fixtures in real Chromium at all three sizes;
it verifies permission-off/on/withdrawn, visible impressions, dismissal persistence,
filter precedence, guest identifier reset and a usable browsing fallback during a
consent outage. This is not a claim of native device or live-account testing.
Python Playwright is required by the existing full-suite KSL DOM test.

Phase status and concrete outstanding checks:

- Phase 0: baseline documented; enrollment, provider approvals and measured
  database/email/job capacity remain open. No validated hour estimate yet.
- Phase 1: bundled project and stable API implemented; iPhone compilation and
  both real-device authenticated journeys remain open. Complete those before
  revising the remaining effort estimate or scaling the feature set.
- Phase 2: consent/request controls implemented; full deletion, Apple provider,
  accurate policy publication and source-wide moderation remain open.
- Phase 3: shared service, native adapters, no-fingerprint activity and recommendation
  UI are implemented and tested. Stable API publication is verified; real-account
  cross-device verification and actual-device behavior remain open.
- Phase 4: push outbox/worker implemented but inactive; credential setup,
  shopping suppression integration and real-device delivery are
  still open. The shared in-app notification center, unread navigation and scoped read acknowledgements are implemented; authenticated production and physical-device verification remain open.
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
