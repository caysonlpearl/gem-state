# ParkVault — Revised Validation MVP Architecture Plan

Independent marketplace for Walt Disney World Resort and Disneyland Resort park merchandise. One canonical product page per exact product, with variation-level Bids and Asks underneath. Not affiliated with, endorsed by, or sponsored by The Walt Disney Company. No Disney or StockX marks, fonts, or artwork; no scraped imagery.

## One correction to item 3 (stack)

This Lovable project is already a TanStack Start project, and that is the officially supported, previewable, and deployable stack here — it is not theoretical. Swapping to a plain Vite + React SPA (react-router) is not supported on this project and would break preview/deploy. So:

- Public pages **are** genuinely server-rendered; route-level `head()` metadata is real, not a claim.
- Privileged server operations use **server functions** (`createServerFn`) — the supported equivalent of Edge Functions on this stack. Supabase Edge Functions are not used here by platform rule.
- Everything else in item 3 stands: Lovable Cloud PostgreSQL + auth + storage + RLS, PostgreSQL functions for atomic matching, typed frontend services for ordinary reads, clean route structure, GitHub sync from the start.

Everything else in your revision list is adopted as written.

## Launch scope

WDW Resort and Disneyland Resort. USD only at launch; `currency` retained on money-bearing tables and `resorts` for later international resorts.

`resorts → parks → locations(stores)` kept distinct. Disney Springs / Downtown Disney modeled as non-park districts under a resort so stores hang off them cleanly. Filtering supports: all resorts, one resort, one park, a district, or a single store.

Products relate to resorts **many-to-many** via `product_resorts` (no `resort_id` column on `products`). Bids/Asks attach to variations; sightings attach to resort + park/district + store.

## Design direction (restrained premium marketplace)

Removed entirely: soft park dusk, Fraunces, whimsical serifs, brass/gold rules, coral/teal market styling, large radii, duotone icons.

- Type: one modern grotesque (Söhne-adjacent open face, e.g. `Geist` / `Inter Tight` — not default Inter), tabular numerals for all prices, near-black `#0E0F10`-equivalent text token.
- Surfaces: warm white / very light neutral; neutral gray hairline borders; minimal shadow; radii 6–10px; strict grid alignment; dense product/market tables.
- Accent: single original restrained forest green, used for primary actions and positive market states only. Bid/Ask differentiated by label, position, and weight — not by hue.
- Icons: `@phosphor-icons/react`, regular weight only, uniform size. `lucide-react` unused.
- Product photography is the primary visual element. All tokens are semantic oklch vars in `src/styles.css`; brand name, logo, colors, URLs, contact, and legal copy live in `src/config/brand.ts`. `src/config/fees.ts` holds **defaults only** — the authoritative fee schedule is the versioned `fee_schedules` table.

## Schema

**Geography & catalog**
`resorts`(code, name, country, currency, active) · `parks`(resort_id, kind: park|district) · `locations`(park_id, name, area) · `brands` · `collections` · `categories`
`products`(slug unique, name, brand_id, collection_id, category_id, description, release_date, release_type, retail_price_cents, retail_price_currency, retail_price_source, retail_price_observed_at, status: draft|pending_review|published|rejected|archived, is_demo, created_by)
`product_resorts`(product_id, resort_id) — M2M
`product_variants`(product_id, size, color, edition, sku_label, position, active, **variation_key** generated normalized text, unique(product_id, variation_key)) — the generated key coalesces nulls to a sentinel so "null size" duplicates are impossible
`product_images`(**product_id NOT NULL**, variant_id NULL, storage_path, alt, kind: canonical|seller_evidence, approved_by, approved_at) — seller evidence never becomes canonical without moderator approval
`product_suggestions`(submitter_id, raw_name, notes, status: submitted|in_review|approved|merged|rejected|duplicate, merged_product_id, reviewed_by, decision_note)
`product_suggestion_media`(suggestion_id FK NOT NULL, storage_path, uploaded_by) — private bucket, signed URLs

**Market**
`asks`(variant_id, seller_id, kind: in_hand|sourcing, price_cents, **currency**, quantity, condition, sourcing_window_days, expires_at, status) · `ask_events` append-only · `ask_media`(ask_id FK NOT NULL, storage_path, uploaded_by) — seller evidence only, never canonical catalog imagery
`bids`(variant_id, buyer_id, price_cents, **currency**, quantity, expires_at, **is_binding false**, payment_authorization_status: none|authorized|expired, authorized_at, status) · `bid_events` append-only
`market_matches`(ask_id, bid_id, variant_id, matched_price_cents, currency, origin, order_id) — the atomic match record
`orders`(variant_id, buyer_id, seller_id, ask_id, bid_id, quote_id, **origin**: buy_now|sell_now|accepted_quote|manual_pilot|demo_seed, status: inquiry|awaiting_payment|paid|sourcing|ready_to_ship|shipped|delivered|completed|cancelled|refunded|disputed, merch_price_cents, buyer_fee_cents, seller_fee_cents, shopper_comp_cents, shipping_cents, tax_cents, total_cents, **currency**, **fee_schedule_id + fee_snapshot jsonb (immutable)**, quoted_amount_cents, accepted_amount_cents, external_payment_status, external_payment_reference, evidence_confirmed_at, confirmed_by, is_demo) · `order_events` append-only
CHECK constraints enforce origin consistency: `buy_now` requires ask_id, null quote_id; `sell_now` requires bid_id; `accepted_quote` requires quote_id and null ask_id/bid_id; `manual_pilot` requires real buyer_id and (seller_id or shopper), `is_demo = false`, quoted+accepted amounts, and an `admin_audit_log` row; `demo_seed` requires `is_demo = true`. Matching functions reject records with mismatched currency.
`order_addresses`(order_id FK unique, recipient_name, lines, city, region, postal_code, country, phone) — immutable delivery snapshot, never read from the mutable profile; RLS restricts SELECT to the buyer, the accepted fulfillment party, and admins; nothing is exposed before the order is accepted; no public grant.
`verified_sales`(order_id unique, variant_id, price_cents, currency, sold_at) — written only when an order is `completed`, non-demo, never disputed/refunded, and — for `manual_pilot` — only after external payment status and delivery evidence are confirmed. Manual pilot orders enter validation analytics on confirmation; `demo_seed` orders never enter analytics or market history.
`price_snapshots`(variant_id, captured_at, currency, lowest_ask, highest_bid, last_sale) — daily history feed
`payment_records` / `payout_records`(order_id, provider, external_ref, amount_cents, **currency**, status, occurred_at) — external status only; no card data ever stored
`shipments`(order_id, carrier, tracking_number, status, shipped_at, delivered_at, delivery_evidence_path)
`fee_schedules`(buyer_fee_bps, seller_fee_bps, minimum_fee_cents, currency, resort_id NULL, effective_start, effective_end, active, created_by, created_at) — versioned; the server resolves the applicable row and snapshots it onto the order

**Sourcing & shoppers**
`sourcing_requests`(requester_id, variant_id NULL, description, target_price_cents, currency, status: open|quoted|accepted|fulfilled|closed, accepted_quote_id) — **no claimed_by**
`sourcing_request_media`(request_id FK NOT NULL, storage_path, uploaded_by) — private
`shopper_quotes`(request_id, shopper_id, merch_cost_cents, shopper_comp_cents, shipping_estimate_cents, delivered_estimate_cents, **currency**, availability_note, fulfillment_window_days, expires_at, status: submitted|accepted|declined|expired|withdrawn) — many per request; accepting one sets `accepted` and closes the request to new quotes
`shopper_applications`(user_id, home_resort_id, park_frequency, id_document_path, status, reviewed_by, decision_note) — identity documents in a private bucket, signed URLs, admin-only read

**Trust & ops**
`profiles`(display_name, avatar, home_resort_id) — **no manually stored authoritative stats**; performance comes from `seller_performance` / `shopper_performance` aggregate views over eligible orders
`reviews`(order_id unique, reviewer_id, subject_id, rating, body) — insert policy requires the order to be `completed`, non-demo, and the reviewer a party to it
`watchlist` · `sightings`(variant_id, **location_id** — the single most specific known location, reporter_id, seen_at, availability, price_cents NULL, **currency**, note, confirmations, flagged) · `sighting_confirmations`
Sightings store exactly one location reference and derive district/park/resort through `locations → parks → resorts`; no independent resort_id/park_id columns to contradict it. Park- or district-only reports are modeled intentionally: `locations` includes a validated `granularity` (`store` | `district` | `park`) row per park/district so a less specific sighting still points at one valid node in the hierarchy.
`notifications`(user_id, kind, payload, read_at) · `analytics_events`(user_id NULL, session_id, name, props jsonb — no form contents, no PII) · `admin_audit_log`(actor_id, action, entity, entity_id, before, after) · `rate_limit_events`(user_id, action, window_start, count) enforced in the DB functions behind every submission (asks, bids, quotes, sightings, suggestions, reviews)

**Views & functions**
`variant_market` — secure aggregate SQL view (chosen implementation, not materialized): lowest active eligible ask, highest active bid, last sale, sales count, median, 30/90-day range, all sourced from `verified_sales` excluding demo/cancelled/disputed/refunded rows. No user identifiers in any public view.
`has_role()` security-definer · `place_bid`/`place_ask`/`cancel_*` with rate-limit checks · `match_buy_now()`, `match_sell_now()`, `accept_shopper_quote()` — each locks the resting row `FOR UPDATE`, writes `market_matches`, the order, the events, and the fee snapshot in one transaction.

Every table: explicit GRANTs, RLS enabled, owner-scoped policies, narrow `TO anon` SELECT only on published catalog + aggregate views.

## Roles

anonymous (browse published catalog, aggregate market, sightings) · signed-in user (buy side: Bid, Buy Now, watch, sighting, sourcing request, suggestion; sell side: in-hand Ask, Sell Now) · shopper (approved — sourcing Asks with disclosed window, shopper quotes) · moderator (suggestions, duplicate merges, canonical media approval, sightings, disputes) · admin (roles, fee config, catalog, validation transactions — every action audited). Roles in `user_roles` + `has_role()` only.

## Money and honesty rules

- Ordinary sourcing Ask: shopper compensation is **inside** the Ask price. No second mandatory shopper fee at checkout. No global shopper-comp default on marketplace orders.
- Custom quote breakdown: merchandise cost, shopper compensation, marketplace buyer fee, shipping estimate, estimated tax, estimated delivered total.
- Server resolves the applicable `fee_schedules` row, recomputes every total, and snapshots schedule id + values immutably on the order; the client never submits totals. Frontend fee config is a display default only.
- Bids are labeled **non-binding test-market interest**; unauthorized Bids are excluded from any liquidity metric.
- No escrow, protected payment, funds-held, or guaranteed-payment language anywhere. `awaiting_payment` states plainly that live checkout is not enabled during validation.
- **Manual pilot orders are real transactions**, recorded by an admin with audit history, real counterparties, quoted and accepted amounts, external payment status (no card data), and shipping/delivery evidence. They stay out of public verified sales until payment and delivery evidence are confirmed, then count in validation analytics. `demo_seed` orders are always `is_demo = true`, visibly labeled, and excluded from analytics and market history. No fake bids, asks, sales, sightings, or reviews in production-facing metrics.

## Risks

IP/trademark (original branding, disclaimer, takedown path) · match concurrency (row-locked DB functions) · fee tampering (server-authoritative + snapshot) · PII leakage via market data (aggregate views only) · sourcing trust (approved shoppers, disclosed windows, computed performance) · sighting/suggestion spam (rate limits, moderation, confirm/flag) · duplicate products and variants (unique slug, generated variation key, merge tooling) · private media exposure (private buckets + signed URLs) · misleading validation metrics (demo flags, non-binding bid labeling).

## Test gate (end of every phase)

Before any phase is called complete and before the next one starts, I run and report: production build (`vite build`), relevant browser tests via Playwright against the running app, RLS policy tests for every policy the phase touched (positive and negative cases), mobile-viewport checks on finished screens, an explicit list of simulated or disabled functionality, and any security-scan warnings. Then I stop and wait for your approval. No phase starts automatically.

## Phase 1 — Foundation (the only phase I start now)

Build:
- Connect GitHub sync.
- Enable Lovable Cloud (Postgres, auth, storage, RLS).
- Design system: tokens, type scale with tabular numerals, forest-green accent, 6–10px radii, Phosphor icons; remove all template placeholder styling.
- `src/config/brand.ts` (name, logo, contact, URLs, legal/disclaimer copy) and `src/config/fees.ts` (display defaults only).
- App shell: header, nav, footer with the non-affiliation disclaimer; real home route replacing the placeholder index; route-level metadata.
- Migration for `analytics_events` (+ grants + RLS) and the typed analytics service, wired to the first events (page/product view, search) so instrumentation exists from day one.
- One thin vertical proof slice used for verification: a public server-rendered route, one authenticated server function, and one RLS-protected read/write.

Stack-proof checklist reported before Phase 1 is called complete:
1. GitHub connected.
2. Framework and versions read from the actual project files (`package.json`, `vite.config.ts`, `src/routeTree.gen.ts` SSR registration) and quoted in the report.
3. Production build run, output reported.
4. Working Lovable preview deployment.
5. One public route verified as server-rendered — proved by fetching the URL and showing the content present in the raw HTML response, not only after hydration.
6. One authenticated server function verified with a real signed-in session.
7. One PostgreSQL/RLS-protected operation verified both ways: allowed for the owner, denied for a different user or anon.
8. Results reported item by item. "The files compile" does not count as confirmation; a failure is reported as a failure.

## Later phases (not started without approval)

2. **Catalog & geography** — resorts/parks/districts/locations with granularity, products, M2M `product_resorts`, variants with variation key, canonical `product_images` + evidence media tables, `fee_schedules` seed, browse + filters (all resorts → single store), canonical product page, per-route metadata + Product JSON-LD.
3. **Auth & roles** — sign-in, profiles, `user_roles`/`has_role()`, protected layout, plain-language glossary onboarding.
4. **Market core** — non-binding Bids, in-hand Asks, Buy Now, Sell Now, offer book, currency-checked matching functions, orders + append-only events + immutable fee snapshots, `order_addresses`, dashboards.
5. **Sourcing & shoppers** — applications with private ID docs, sourcing Asks, sourcing requests with private media, multi-quote comparison and acceptance.
6. **Community & signals** — sightings on a single location reference, confirmations, watchlist, `price_snapshots`, `variant_market` surfaced.
7. **Manual pilot & trust ops** — admin manual-pilot order tooling with audit trail, external payment status, shipment and delivery evidence, verified-sale confirmation gate, reviews on completed orders, notifications, moderation queue, rate-limit tuning.
8. **Hardening** — accessibility, mobile, empty/error states, security scan, analytics funnel verification against the validation questions.

Analytics instrumentation is added inside each phase, not deferred to the last one.
