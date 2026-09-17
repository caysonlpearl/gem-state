# Gem State Classifieds conversion

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
- [ ] Export: schema + RLS + functions (pg-style dump), data rows, storage objects, auth config, secrets list, email templates, cron
- [ ] User disconnects Cloud (Project Settings → Integrations) — destructive, only after export confirmed
- [ ] User connects their Supabase project in Project Settings → Integrations
- [ ] Restore schema + data + storage into the new project
- [ ] Re-wire secrets (Stripe, Shippo, webhook secrets), auth providers, email templates/domains
- [ ] Verify checkout, sign-in, listing flows end-to-end on the new backend
