# Gem State Classifieds conversion

## Industrial category
- [x] Add Industrial to every category selector and register it for listing creation.
- [x] Add the 22 supplied subcategories to create/edit/display and browse filtering.
- [x] Verify category navigation and existing marketplace tests (93 passing); authenticated submission unavailable on external Supabase.

## Current category homepage cleanup
- [x] Remove fabricated category listing cards without deleting database rows.
- [x] Retain category listing sections and show the homepage getting-started card.
- [x] Verify category homepages and resolve existing page-check errors.

## Vehicles navigation label
- [x] Rename the header, mobile menu and homepage chip from Cars to Vehicles.
- [x] Route that link to the whole motors group (cars, trucks, motorcycles, RVs, powersports, trailers) instead of cars only.
- [x] Match the vehicles landing heading, filter pill and page title; keep the honest empty state.

## Dropdown arrow spacing
- [x] Replace the browser's edge-flush select arrow with the shared inset chevron used by the custom dropdowns (14px, 12px off the border).
- [x] Apply it to the sidebar filters, the sort control and the compact sort controls so every dropdown matches.
- [x] Verify the arrows sit clear of the border in the preview; code check and tests pass.

## Phase 1 — Foundation (done)
- [x] Brand config, colors, Sora/Manrope fonts, Gem State mark
- [x] Classifieds taxonomy + Idaho regions + listing contracts
- [x] Compatibility layer (classified metadata table + secure create function)
- [x] Header and footer rebuilt around classifieds nav (Post a listing, categories, regions)
- [x] Sitemap/robots on the Gem State domain
- [x] Google Search Console connected in the new workspace

## Phase 2 — Public marketplace (awaiting approval)
- [ ] Home page: search-first, motors lead, category tiles, live shelves
- [ ] Browse/search: grid+list, sorting, vehicle filters in URL state
- [ ] Individual listing detail page

## Phase 3 — Seller experience (awaiting approval)
## Phase 4 — Buyer and account experience (awaiting approval)
## Phase 5 — Admin, policies, emails, launch pass (awaiting approval)

## Workspace move follow-up
- [ ] Reconnect Google Search Console in the new workspace

## Migrate off Lovable Cloud to user's own Supabase
- [x] Explain why connect was blocked (Cloud attached; connect lives in Project Settings → Integrations)
- [x] Export: schema (69 tables, 148 functions, 131 policies, grants), data, 8 auth accounts, 8 buckets, 18 storage files → /mnt/documents/gemstate-classifieds-db-backup.zip
- [ ] User disconnects Cloud (Project Settings → Integrations) — destructive, backup confirmed
- [ ] User connects their Supabase project in Project Settings → Integrations
- [ ] Restore schema + data + storage into the new project
- [ ] Re-wire secrets (Stripe, Shippo, webhook secrets, site URL), auth providers, email templates/domains
- [ ] Verify checkout, sign-in, listing flows end-to-end on the new backend

## Account menu redesign
- Dropdown: "Signed in as" identity header (avatar/name/email, links to /account), Marketplace group with aligned icons (Selling, Saved, Messages, Notifications) and unread count badges, Account settings row, Sign out action (global sign-out + cache clear) at the bottom. 244px wide, rounded-xl, shared query keys with AccountCenter/NotificationBell.
