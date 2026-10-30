## Project guidance

This repository is deployed independently of the original hosted builder. Keep
Supabase credentials server-side where required, preserve the generated route
tree when routes change, and verify production configuration before deployment.

## TypeScript configuration

Homepage category and location menus use HomeSearchDropdown for a shared appearance while location retains free-text input.

Category landing listing sections retain their headings and navigation when empty and use the shared Bluebird empty-state component; hardcoded showcase metadata must not supply listing cards, so empty inventory remains honest without deleting database records.

Industrial uses the shared classifieds taxonomy and stores its subcategory in item_details.itemType; create, edit, display and browse reuse the existing item-details pipeline without a parallel schema.

Keep `noPropertyAccessFromIndexSignature`, `noUncheckedIndexedAccess`, and
`exactOptionalPropertyTypes` off in tsconfig.json. These three extra-strict
settings flag safe code across the whole app (index-signature property access,
index reads, and optional-property spreads) without catching real bugs; the
codebase is deliberately written against `strict: true` only. If a fresh
typecheck floods with TS4111/TS2375/TS18048 errors, restore these settings to
`false` before hand-fixing files.
- External listing feeds (Adzuna jobs, Mashvisor homes) are merged into browse at read time, cached in service-role-only tables with a DB-enforced request budget, and never written as marketplace listings — keeps provider quotas and terms safe.
- Guns.com uses pinned merchant/feed scopes, bounded small pages and cooldowns after incomplete/failed requests; retailer cache refreshes never create or alter member listings.
- Normalize Guns.com photo delivery through its public sized-image URLs on cache reads, preserving explicit provider image policies; this repairs existing inventory without feed requests or member-data writes.
