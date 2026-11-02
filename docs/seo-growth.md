# Organic search growth: delivery and verification

Baseline captured November 1, 2026: Search Console Web data available October
11–30, 8 clicks / 918 impressions / 0.9% displayed CTR / 13.4 average position.
Keyword Planner: 122 curated phrases, 119 estimates, Idaho, Google network,
all languages, October 2025–September 2026 monthly averages. Preserve ranges;
do not sum close variants or treat advertising competition as organic difficulty.

## Completion requirements

2. Inventory: cached homes appear on relevant public SEO pages, buy and rent
   remain distinct where selected, geographic and category filters are accurate,
   and available descriptions/specifications reach existing detail components.
3. Speed/reliability: stored public inventory/prepared pages are read without
   upstream provider requests; background refresh, concurrency protection,
   expiry, moderation and failed-refresh retention are tested and verified live.
4. Discovery: sitemap eligibility, rendered robots and canonical URLs agree;
   include eligible provider-backed inventory/collections; record the eligibility
   review for jobs/businesses; retain appropriate private, expired and thin-page
   exclusions. Verify actual live URLs and Search Console submission where available.
5. Targeted pages: release a bounded, researched first batch of local rental,
   vehicle and trade collections with matching inventory, distinct useful content,
   crawlable links and browse/post destinations. Empty collections stay noindex.
6. Editorial: improve existing guide intent/snippets/CTAs without duplicating the
   November 1 edits; research and prepare two original articles for review, publish
   approved originals, and establish two-per-week drafting/review/publishing.
   Keep news supplementary and preserve source/photo permissions.
7. Local links: qualify real local partners, prepare tailored outreach and useful
   reference destinations, then secure and verify real public mentions/links.
   A prospect list or draft message alone does not prove this outcome. Sending
   messages requires explicit authorization for the concrete recipients/copy.
8. Measurement: verify organic attribution through listing views, contact actions,
   completed inquiries and posting starts/submissions; establish weekly reports
   and monthly reprioritization, retain the baseline and complete the initial
   review. Future indexing/rank improvements require future observation.

## New findings incorporated

- First repair homes routing: the provider adapter requires buy/rent, while the
  current generic SEO query omits it. Read regional saved caches for every city,
  including Twin Falls, rather than using a short city allowlist or spending calls.
- Prioritize city house rentals; used cars Boise/Idaho Falls; plumbers
  Boise/Meridian; then verified cleaning/landscaping and jobs inventory.
- Registration and selling guides had 400 and 288 impressions, respectively,
  with no clicks before their November 1 edits. Measure those changes separately.
- Inspect 352 discovered-not-indexed URLs and distinguish intentional noindex,
  redirect/canonical exclusions from errors. October 22 indexing counts are
  historical; all three historical error examples returned HTTP 200 on November 1,
  which does not by itself disprove a soft-404 classification.
- Use actual availability and verified source dates, not invented freshness,
  fabricated prices or claims about an entire market from bounded samples.

## Delivery record

Work begins from origin/main ac0f6de in an isolated checkout. Preserve the newer
vehicle sitemap work and all unrelated worktrees. No Lovable AI prompts/credits.
Each release requires relevant regression checks, a production build, a pushed
commit, publishing and live HTTP/rendered verification. This file is a checklist,
not proof that its requirements have been completed.

### Release 1 — verified November 1

- PR 60 merged as 0fd64606aab99c5873777c3757c2e135ac41cb45 and published.
- The public Idaho homes SEO page returned HTTP 200, displayed 28 distinct
  provider home links and no noindex directive. Chrome confirmed 572 matching
  results in the underlying saved inventory, with a 192-record review sample.
- The Twin Falls rental results URL returned HTTP 200 with 24 distinct cached
  provider-home links. Filtered browse appropriately remained noindex.
- 76 targeted tests, TypeScript, scoped lint and a production build passed;
  the full required GitHub regression workflow also passed.

### Provider review

On November 1 the owner confirmed separate agreements cover MarketCheck
data-feed/caching and Adzuna commercial use. The actual agreements have not
been inspected here; do not invent or increase their allowance. Existing
provider budgets remain unchanged. Standard public terms were reviewed at
https://developers.marketcheck.com/terms and
https://developer.adzuna.com/docs/terms_of_service .
OpenWeb Ninja's API Data license and Foursquare source attribution remain
applicable to directory use. Job snippets and affiliate copies remain noindex;
recently verified, useful directory facts are evaluated independently of claim status.

### Prepared public page cache

Place and vehicle SEO page data is projected to public card fields and stored
under the existing homepage-snapshots bucket. The HTML shell/session is never
cached. Five-minute refresh leases are shared across workers; stored pages can
serve for up to six hours during refresh failures. A successful empty read
replaces old inventory. Background refreshes use saved data only, and SEO
reads do not record listing impressions or call provider APIs.

The first targeted set is finite and demand-led. Inventory/freshness gates still
control indexing; an unsupported city/collection combination is not a new page.
Sale/rent modes, house/apartment types, service trades and part-time employment
are propagated into the browse destination and shared sitemap predicates.

Releases 2–6 are merged and published through e65931e. Shared cache objects,
stored/warm responses, approved originals, sitemap policy and private baseline
storage have been checked live. Source-failure retention, successful-empty
replacement and concurrent cold reads have regression coverage; production
sources were not deliberately interrupted to simulate an outage.

### Editorial and measurement rhythm

The owner reviewed and approved the full Twin Falls rental-cost checklist and
Boise/Meridian plumbing-quote checklist on November 1. Their canonical homes
are guide URLs; they are registered in Bluebird Local without duplicate thin
news pages. Local collection buttons and related cards enforce the same mode,
property type, trade, state and radius as their destination.

Each Tuesday, select two original topics using Search Console queries with
impressions but weak clicks, the researched Idaho demand ranges, and actual
matching inventory. Research primary sources and prepare complete drafts.
Review on Thursday, then publish only the approved drafts. If a review is late,
keep drafts private rather than fabricating a publication or backdating one.
The first two approved originals satisfy this initial two-article batch.

Review search and classified outcomes each Monday after 9am Boise time. Keep
Google Search Console's available-date range separate from first-party traffic.
Compare completed periods and segment organic search from paid, AI and direct
visits. Track article reads and CTA placements through listing views, contact
attempts, acknowledged inquiries, posting starts and accepted submissions.
The first day of each month adds a closed calendar-month review and inventory-
matched reprioritization. Keyword Planner ranges are revisited when choosing a
new batch, not automatically summed into an invented traffic forecast.

Stored weekly/monthly analytics use a private Storage bucket, administrator-only
server functions, immutable period keys and retryable leases. Existing news and
worker maintenance trigger due reports; no marketplace provider requests or
writing subscription are added. The rolling seven-day baseline can be saved
from the traffic report. Future scheduled runs and search gains remain future
observations, even after the workflow is configured and tested.

Local-link outreach remains drafted and unsent. A public editorial link must
be observed on the third party's site before it counts as an earned-link result.

### Home dates and visibility

New upstream searches capture their observation timestamp. Days-on-market can
then supply a stable derived listing date; reads no longer subtract a saved age
from the visitor's current clock. Legacy records without a source date or an
observation anchor omit posting-age claims and posting-date structured data.
Current inventory-cache validity can qualify collection recency independently;
it is never represented as datePosted or lastmod. Failed forced refreshes put
back the original expiry, so a failed request does not renew stale inventory.
Detail pages now use the same unexpired, deduplicated search inventory as browse.
Coeur D Alene is displayed and matched as Coeur d'Alene for Idaho source rows.
Prepared SEO cache storage advances to v2 and homepage layout revision advances
so old derived dates are rebuilt from stored data without provider calls.

### Live verification — November 1, 2026, Boise time

- The main sitemap returned HTTP 200 with 2,074 unique canonical-domain URLs.
  Google Search Console accepted its resubmission in the existing
  `sc-domain:onbluebird.com` property. The receipt proves submission, not that
  Google has indexed the new URLs. Robots advertises both sitemap endpoints;
  the news sitemap also returned HTTP 200.
- All 25 supported first-batch collection routes were checked. Two statewide
  sale/rental pages initially returned 500 during the cold-cache rollout, then
  recovered to HTTP 200 with 24 cards each and stored v2 objects. This initial
  failure remains recorded; warm-cache performance does not prove every cold
  request is fast or reliable. Remaining supported routes returned HTTP 200.
- Prepared home cards retained sale/rent and property-type filters, Idaho
  locations and actual cache expiry. Unknown legacy publication dates were
  absent. Trades and part-time employment matched their requested collections.
  Idaho Falls part-time jobs had one result, remained noindex and was absent
  from the sitemap. Unsupported city/collection combinations returned 404.
- Both approved originals appear in Bluebird Local and have server-rendered
  article copy and crawlable CTAs. Native Chrome verified four matching Twin
  Falls rental cards and four Boise plumbing businesses after hydration.
- The administrator saved and downloaded `baseline-2026-11-02`, a rolling
  seven-day report (UTC key; still November 1 in Boise). Anonymous access to
  its public Storage URL was denied. It recorded 1,077 visits, 412 listing-view
  events and zero recorded organic visits for this shorter period. Keep it
  separate from the prior 30-day baseline: 2,113 visits, nine search visits,
  three search listing-view events and one search contact action.
- Read-only inspection of the installed database job confirmed
  `bluebird-local-refresh` is active every 15 minutes. Its 00:30 UTC November 2
  HTTP response was 200 and reported successful saves of `weekly-2026-10-26`
  and `monthly-2026-11-01`; these are observed scheduled saves. Cache warming
  is now attached to this installed endpoint and rotates with its actual
  quarter-hour cadence, covering the 29 configured destinations within four
  hours, ahead of the six-hour stale bound. The standalone homepage-refresh
  endpoint has no separate installed database schedule.
- No outreach has been sent. CSI Housing, Built in Idaho and Gem State Realty
  have tailored drafts. The owner asked how this supports SEO; actual send
  authorization and any third-party editorial decision remain outstanding.
  Verified earned links: zero. The overall steps 2–8 goal is not complete.

Detailed dated evidence lives in the workspace research directory
`research/seo/2026-11-01`, including `collections-live-audit.json`,
`collections-recovery-live.json`, `discovery-live.json`,
`saved-report-live.json` and `gsc-sitemap-submission.json`.

### Listing lifecycle and bounded reads

The historical discovered-URL export was reconciled against all 352 public
addresses: 330 returned self-canonical HTTP 200 responses, while 22 removed
native listings redirected to categories and were absent from the sitemap.
Removed listings now use a real 404 with a browse link; only an equivalent
same-listing canonical URL receives a permanent redirect. Retained sold/expired
archives stay readable and noindex. Source errors are not treated as removals.
Malformed native identifiers are rejected before live, archive or browse-link
lookups. Invalid UUID syntax is a 404, not a database outage; compiled SSR tests
assert zero source requests for malformed native and home identifiers.

PR67 passed local checks but failed live verification. PR68 restored the exact
last verified source; home/native detail requests and direct backend API controls
still timed out after that rollback. The cause was not established by the quota
warning. The follow-up bounds detail SELECTs, disables their SDK retries and
shares saved home searches for one minute, rechecking actual expiry on every
read. Failed and malformed reads are evicted, and detail-cache failures cannot
be presented as an absent description. Cards and listing layouts are preserved.

The production-build SSR smoke test runs actual compiled routes with all network
traffic intercepted. It checks full saved home text/photos, removed native and
partner 404s, source failures remaining 500s, an eight-second cancelled SELECT
without retry or archive fan-out, and recovery. CI now runs the production build
and that smoke test in addition to existing regressions and TypeScript. These
controlled checks do not replace live verification.

Desktop home phone/external contact links use the existing contact event. The
admin label describes an opened contact/application page, not a completed
application. Internal live QA already observed article read, intro CTA and
listing-view events. The later contact and posting-start checks below complete
those particular live attribution paths.

The owner chose to keep Supabase Free. No billing upgrade is authorized. A
read-only bucket audit found 6,379 files / 1,248.52 MiB in each of ask-evidence
and listing-media; the import function uploads the same buffer to both buckets.
Prepared homepage/SEO data accounts for about 3 MiB, so deleting prepared pages
would not solve the storage limit. Review duplication, image delivery and free
external storage before any migration or irreversible deletion. Prior usage is
not reset merely by changing the code or moving files.

### Discovered URLs and contact measurement follow-up

The actual Search Console discovered/not-indexed export contains 352 URLs,
from its October 22 snapshot: 278 native listing URLs, 64 collection URLs and
10 guide/static/seller URLs. A full November 1 anonymous HTML reconciliation
found 330 successful self-canonical responses and 22 removed listings that
redirected to broad collections. The report is historical; these HTTP results
do not establish Google's current indexing decisions.

Removed listings now return the existing unavailable page with a real 404 and
a useful browse link. A broad category is not an equivalent replacement for a
specific removed item. Same-listing title aliases retain their 301 redirects.
Retained sold/expired archives remain readable and noindex, with their existing
closed-listing controls and structured-data exclusions. Detail-source database
errors stay errors rather than becoming false missing pages; partner job
details use the same current cache-expiry gate as browse.

The marked internal article test recorded article view, introduction CTA and
the matching rental detail view, carrying the guide and placement attribution
through navigation. Desktop partner-home phone and external contact links now
use the existing contact-action tracker, matching mobile behavior. An external
page click is labeled as an opened contact/application page, not a completed
application. Actual acknowledged messages/applications retain their separate
inquiry-completion event. No messages or applications were sent by the audit.

Reference: Google's removed-page guidance at
https://developers.google.com/search/docs/crawling-indexing/troubleshoot-crawling-errors
recommends a 404/410 when no equivalent replacement exists, and useful onward
links on the custom error page.

### Latest verification and Free-storage preflight

PR69 and PR70 are merged. The final production URL audit passed all 33 checks:
22 removed native listings return 404 with browse navigation, malformed native
and home IDs return 404, active sampled details and approved guides render,
same-listing canonical redirects remain 301, and the main sitemap returns 200
with 2,070 unique URLs. Required CI for PR70 passed 709 tests, TypeScript, the
production build and 10 compiled SSR cases. PR69's publishing receipt was
observed; PR70's final publishing UI receipt was not, so its public behavior
rather than an editor status is the recorded live proof.

Internal browser QA recorded the guide introduction CTA, matching rental
detail view and external contact action with article/placement preserved. The
expected Zillow source page opened; no tour or message was submitted. A second
path recorded the ending post CTA and entry to the ready listing-creation form;
no listing was submitted. All these QA events are marked internal. They are
neither organic growth nor completed inquiries or listing submissions.

The owner kept Supabase Free and approved R2 Standard activation and its
renewing usage terms. The active empty R2 overview is verified. A metadata-only
capture contains 12,758 objects totaling 2,618,329,958 bytes across the listing
and evidence photo stores. All 6,379 same-path pairs match size, content type
and ETag. A candidate paired-download plan requires 1,309,164,979 source bytes,
but no photo bytes have been downloaded or verified. See
[the migration preparation](photo-storage-migration.md). The local preflight
tool has no network, credential, bucket-creation, copy or deletion code.

The source-transfer allowance and November 15 grace / November 17 reset gap
must be resolved before any bulk photo copy. R2 activation does not reset
Supabase's already-consumed transfer or billing-period storage average. Bucket
access, photo migration and exact permanent deletion remain separate gates.

Built in Idaho's public business directory explicitly invites missing companies
to contact it and does not list Bluebird Marketplace. A complete directory
request is prepared using the owner-supplied public business number. The owner
asked its purpose; it remains unsent without submit authorization. The earlier
CSI Housing and Gem State Realty emails remain parked. Verified public earned
links remain zero.

### Private-photo adapter preparation (November 1)

The two private R2 buckets and restricted server credential are configured.
The prepared adapter covers native create/edit, seller administration, import
staging and claiming, stable SEO photo URLs, original galleries and small card
previews. Both production flags remain Supabase. Its additive receipt migration
and read-only diagnostics do not authorize bulk copying, read cutover or source
deletion. The local gate passed 752 tests, TypeScript, production build and the
10-case compiled SSR suite. Actual host/bucket readiness, source allowance/grace
timing, bounded operator transfer and end-to-end migration verification remain
open Step 3 work. See [the migration controls](photo-storage-migration.md).

### Bounded photo-transfer preparation

PR72's private storage connection is published and live-verified; reads/uploads
remain Supabase, and no photos have been moved or deleted. A private operator
review and resumable runner is now prepared for Step 3. It shares the CLI's
inventory digest, requires an expiring server permit for the exact run/range/
photo-byte allowance, serializes copy leases, reserves source bytes before GETs,
preserves failed-attempt reservations and stops for review. It does not schedule
copies, change public listing layouts, switch reads or delete source photos.

The source allowance/grace gap, owner approval of a bounded pilot/cutover,
CORS for future native R2 uploads, and verified earned links remain outstanding.
A Supabase support request and the directory request remain unsent. No future
rank improvement, completed customer inquiry or public listing submission is
claimed from internal QA. The full steps 2–8 objective remains active.
