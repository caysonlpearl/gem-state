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

Remaining verification includes publishing release 2, live cache timing and
source-failure behavior, sitemap/detail policy checks, content review/publication,
earned links and the recurring measurement workflow. The legacy homes adapter's
relative days-on-market calculation also needs a stable source-date review; do
not represent a cache read as a new publication date.

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
