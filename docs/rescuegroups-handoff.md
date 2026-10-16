# RescueGroups.org pets feed: handoff plan

Goal: adoptable pets from Idaho and nearby rescues on the Pets landing page
(`/browse?category=pets`), the homepage, and their own listing pages, the same
way the other partner feeds work (Adzuna jobs, MarketCheck cars, OpenWeb
Ninja homes, Foursquare services). Pets are merged into browse **at read
time** from a cache. They are never written as marketplace listings.

## Already done
- `src/lib/rescuegroups-contract.ts`: pure normalizer
  (`normalizeRescueGroupsAnimals`), request body helper, `RESCUEGROUPS_ID`
  (`rescuegroups-<digits>`), API base. Tested in
  `tests/rescuegroups-contract.test.mjs`.
- `supabase/migrations/20261017000000_add_rescuegroups_cache.sql`: cache
  table, request log, `reserve_rescuegroups_call` budget function, and
  `rescuegroups-` added to `listing_view_counts`. **Applied in production
  on 2026-10-16.**
- `src/lib/rescuegroups.server.ts`: cached feed (4 search centers, 100
  miles, up to 3 pages of 100, refreshed every 12h, stale on failure, crawlers
  never trigger calls), `rescueGroupsCards`, `rescueGroupsCard` (maps into the
  existing `pet` fields with placement "adoption"), `rescueGroupsDetail`.
- Wired: `runBrowseClassifieds` merges `externalPets` for the pets category
  and all-items; `getClassifiedListing` routes `rescuegroups-` ids;
  `ClassifiedCard.externalPet`; "Adopt" button in `ListingActions` and
  `MobileContactBar` (opens the rescue's adoption page).

## Owner steps (not for an agent)
- Add `RESCUEGROUPS_API_KEY` to the live site's secrets and to local `.env`.
  Agents never enter keys into web forms.

## Remaining work, in order (steps 2-4 are done; start at 1 and 5)
1. **Verify the API against a real response** with the local key
   (`curl -X POST 'https://api.rescuegroups.org/v5/public/animals/search/available/?include=pictures,orgs,species&limit=5' -H "Authorization: $RESCUEGROUPS_API_KEY" -H 'Content-Type: application/vnd.api+json' -d '{"data":{"filterRadius":{"miles":150,"postalcode":"83702"}}}'`).
   Fix the normalizer's field names if any differ (picture `large.url`,
   org `adoptionUrl`/`url`, species `singular`, animal `ageGroup`/`sexLabel`/
   `sizeGroup`/`breedString`/`descriptionText`/`adoptionFeeString`). Update the
   test fixture to match. One call only.
2. **Apply the migration** (Supabase SQL editor), then
   `npm run test:payments`.
3. **`src/lib/rescuegroups.server.ts`**, modeled on
   `src/lib/marketcheck.server.ts` (`cachedCall`, `cacheDb`, bot guard):
   - `rescueGroupsInventory()`: one cached search per center, refreshed
     about every 12h, a few pages of 100. Centers: Boise 83702, Idaho Falls
     83402, Coeur d'Alene 83814, Twin Falls 83301, 100 miles each. Dedupe by id.
     If a fetch fails or the budget is denied, fall back to the stale cache.
   - `rescueGroupsCards(data: ClassifiedBrowseInput)`: filter locally (q,
     city/radius via `isWithinClassifiedRadius`, species via the pets
     subcategory if one is set) and map with `rescueGroupsCard`.
   - `rescueGroupsCard(pet)` -> `ClassifiedCard`: `id: rescuegroups-<id>`,
     `categorySlug: "pets"`, `priceCents` from the adoption fee if numeric
     (else 0), city and state from the org, `imageUrl` = first photo,
     `condition: "not_applicable"`, plus a new optional
     `externalPet?: { sourceUrl, orgName, ... }` field on `ClassifiedCard`
     (`classifieds.functions.ts`), like `externalVehicle`.
   - `rescueGroupsDetail(id)` -> `ClassifiedDetail` from the cached
     inventory: all photos, description, breed/age/sex/size facts,
     `seller: null`.
4. **Wire into `runBrowseClassifieds`** (`src/lib/classifieds.functions.ts`),
   only for the pets category (or "all"), exactly like
   `marketCheckCards`/`directoryCards`: add to listings and total.
   **Wire `getClassifiedListing`**: `if (data.id.startsWith("rescuegroups-"))`
   -> `rescueGroupsDetail`. Add `rescuegroups-` to
   `reportClassifiedListing` and `recordListingView` if they gate on id
   prefixes.
5. **Listing page** (`src/routes/listings.$listingId.tsx`): render pets with
   the general item layout. Sidebar card: org name, city and state, phone,
   email. Main button **"Adopt"** links to `externalPet.sourceUrl`
   (`target=_blank rel="noopener noreferrer nofollow"`). Mobile bar
   (`MobileContactBar.tsx`): "Adopt" to the same URL. Keep wording short:
   no "on RescueGroups" repeated. Put one credit line ("Pet data from
   RescueGroups.org") at the bottom of the page, last on phones. Mark the
   page `noindex` like other partner listings.
6. **Pets landing rows** (`browse.tsx`, `petShowcaseRows`): rows should fill
   from the feed. Rows already skip listings shown higher up
   (`ShownRowsContext`). Keep headings and the empty state when a row has
   nothing. Don't add hardcoded showcase cards (see AGENTS.md).
7. **Homepage**: pets currently skip the homepage rows (`!listing.pet` in
   `src/routes/index.tsx`). Optionally add an "Adoptable pets" row from
   the pets pull. Homepage rows stay Idaho-only (filter `state === "ID"`).
8. Saved/heart button: reuse the partner pattern
   (`PartnerVehicleHeartButton` / `saved_partner_*`) or hide the heart for
   pets in v1.
9. Test, typecheck (`npx tsc --noEmit`), push to main, then the owner
   publishes in Lovable. Check live: Pets landing rows fill, a pet page shows
   photos, facts, Adopt link, and credit, and the API key never appears in
   page HTML (`curl` the page and grep for the key).

## Constraints (from the project owner)
- Never prompt Lovable chat. Push to GitHub; the owner clicks Publish.
- Keys stay server-side; never put a key in a URL that reaches the browser.
- Bluebird covers Idaho and surrounding states; only homepage rows are
  Idaho-only.
- Short UI copy: buttons say "Adopt" / "Contact", no repeated source names.
