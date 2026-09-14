import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

const configSource = await read("src/config/classifieds.ts");
const browseSource = await read("src/routes/browse.tsx");
const createSource = await read("src/routes/_authenticated/create-listing.tsx");
const contractsSource = await read("src/lib/classified-listing-contracts.ts");
const actionsSource = await read("src/components/classifieds/ListingActions.tsx");
const moderationSource = await read("src/routes/_authenticated/admin.classifieds.tsx");
const sellSource = await read("src/routes/sell.tsx");
const classifiedsFunctionsSource = await read("src/lib/classifieds.functions.ts");
const seedRunnerSource = await read("scripts/seed-classifieds.mjs");
const seedMigrationSource = await read(
  "supabase/migrations/20260914110000_add_classified_seed_listing_function.sql",
);
const emailShellSource = await read("src/lib/email-templates/shell.tsx");
const authEmailSource = await read("src/routes/lovable/email/auth/webhook.ts");
const brandMarkSource = await read("src/components/layout/BrandMark.tsx");
const homeSource = await read("src/routes/index.tsx");
const categoryIconSource = await read("src/components/classifieds/CategoryIcon.tsx");
const listingCardSource = await read("src/components/classifieds/ListingCard.tsx");
const detailSource = await read("src/routes/listings.$listingId.tsx");
const stylesSource = await read("src/styles.css");
const { classifiedSeedListings } = await import("../scripts/classified-seed-data.mjs");

test("classified taxonomy includes Idaho categories and automotive inventory", () => {
  assert.match(configSource, /cars-trucks/);
  assert.match(configSource, /furniture/);
  assert.match(configSource, /idahoRegions/);
  assert.match(configSource, /drivetrains: \[[\s\S]*4WD/);
});

test("browse and create flows expose the same vehicle fields", () => {
  for (const field of [
    "make",
    "model",
    "yearMin",
    "yearMax",
    "mileageMax",
    "bodyStyle",
    "transmission",
    "drivetrain",
    "fuelType",
    "titleStatus",
  ]) {
    assert.match(browseSource, new RegExp(field));
    assert.match(createSource, new RegExp(field.replace(/Min|Max/, "")));
  }
  assert.match(contractsSource, /state:/);
  assert.match(contractsSource, /region:/);
});

test("classified checkout and offers stay attached to one exact listing", () => {
  assert.match(actionsSource, /requestExactListing/);
  assert.match(actionsSource, /makeListingOffer/);
  assert.match(actionsSource, /askId: listing\.id/);
  assert.doesNotMatch(actionsSource, /variantId: listing\.variantId/);
});

test("admin moderation reviews classified listings instead of publishing them directly", () => {
  assert.match(moderationSource, /getAdminClassifiedQueue/);
  assert.match(moderationSource, /adminReviewAsk/);
  assert.match(moderationSource, /Approve listing/);
  assert.match(moderationSource, /Reject listing/);
});

test("public seller landing page is Gem State-specific", () => {
  assert.doesNotMatch(sellSource, /ParkVault|Disney|park merchandise|catalog product/i);
  assert.match(sellSource, /Gem State seller/);
  assert.match(sellSource, /exact-item photos/);
});

test("step five seed fixtures cover realistic Idaho vehicle browse cases", () => {
  assert.equal(classifiedSeedListings.length, 8);
  assert.ok(new Set(classifiedSeedListings.map((listing) => listing.state)).size === 1);
  assert.equal(classifiedSeedListings[0].state, "ID");
  assert.equal(new Set(classifiedSeedListings.map((listing) => listing.category)).size, 1);
  assert.equal(classifiedSeedListings[0].category, "cars-trucks");

  for (const listing of classifiedSeedListings) {
    assert.match(listing.title, /^20\d{2} /);
    assert.ok(listing.priceCents > 0);
    assert.ok(listing.city);
    assert.ok(listing.vehicle.make);
    assert.ok(listing.vehicle.model);
    assert.ok(listing.vehicle.year >= 2010);
    assert.ok(listing.vehicle.drivetrain);
    assert.ok(listing.vehicle.title_status);
    assert.match(listing.description, /Fictional seed listing for MVP flow testing/);
  }
});

test("step five preserves vehicle filters and keeps seeded records safe to review", () => {
  assert.match(classifiedsFunctionsSource, /vehicleForRpc/);
  assert.match(classifiedsFunctionsSource, /body_style: vehicle\.bodyStyle/);
  assert.match(classifiedsFunctionsSource, /title_status: vehicle\.titleStatus/);
  assert.match(classifiedsFunctionsSource, /_vehicle: vehicleForRpc\(data\.vehicle\)/);
  assert.match(seedRunnerSource, /--apply/);
  assert.match(seedRunnerSource, /SUPABASE_SERVICE_ROLE_KEY/);
  assert.match(seedRunnerSource, /SUPABASE_SEED_ACTOR_USER_ID/);
  assert.match(seedRunnerSource, /pending listings/);
  assert.match(seedRunnerSource, /seed_classified_listing/);
  assert.match(seedMigrationSource, /auth\.role\(\).*service_role/);
  assert.match(seedMigrationSource, /pending_review/);
  assert.match(seedMigrationSource, /classified_listing_details/);
});

test("step six keeps customer email surfaces on the Gem State brand", () => {
  assert.match(emailShellSource, /Gem State Classifieds is an independent marketplace/);
  assert.match(emailShellSource, /https:\/\/gemstateclassifieds\.com/);
  assert.match(authEmailSource, /const SITE_NAME = "Gem State Classifieds"/);
  assert.match(authEmailSource, /notify\.gemstateclassifieds\.com/);
  assert.doesNotMatch(emailShellSource, /ParkVault|Disney/);
  assert.doesNotMatch(authEmailSource, /ParkVault|getparkvault/);
});

test("approved Idaho gem logo is used across the responsive brand mark", () => {
  assert.match(brandMarkSource, /gem-state-classifieds-logo\.png/);
  assert.match(brandMarkSource, /gem-state-classifieds-mark\.png/);
  assert.doesNotMatch(brandMarkSource, /Diamond/);
});

test("homepage headline rotates through four-item classifieds combinations", () => {
  assert.match(homeSource, /headlineOptions = \[/);
  assert.match(homeSource, /Fishing Lures/);
  assert.match(homeSource, /Massage Chairs/);
  assert.match(homeSource, /Air Hockey Tables/);
  assert.match(homeSource, /headlineItems\[0\].*headlineItems\[1\].*headlineItems\[2\].*headlineItems\[3\]/s);
  assert.match(homeSource, /last-headline/);
});

test("homepage hero uses the expanded headline width and updated subline", () => {
  assert.match(homeSource, /max-w-\[34ch\]/);
  assert.match(homeSource, /And so much more across Idaho and surrounding states\./);
  assert.doesNotMatch(homeSource, /listed one item at a time by sellers/);
  assert.doesNotMatch(homeSource, /What are you looking for\?/);
});

test("shared category icons and no-photo cards have deterministic presentation", () => {
  for (const slug of [
    "cars-trucks",
    "motorcycles",
    "boats",
    "rvs-campers",
    "powersports",
    "furniture",
    "electronics",
    "clothing",
    "outdoor-sporting",
    "tools-equipment",
    "farm-garden",
    "general",
  ]) {
    assert.match(categoryIconSource, new RegExp(`(?:[\\\"']${slug}[\\\"']|${slug}:)`));
  }
  assert.match(categoryIconSource, /weight="duotone"/);
  assert.match(categoryIconSource, /category-icons\/cars-trucks\.png/);
  assert.match(categoryIconSource, /category-icons\/general\.png/);
  assert.match(categoryIconSource, /function CategoryArtwork/);
  assert.match(categoryIconSource, /SquaresFour/);
  assert.match(listingCardSource, /listing\.categorySlug \?\? "general"/);
  assert.match(listingCardSource, /CategoryArtwork/);
  assert.match(listingCardSource, /bg-gradient-to-br/);
  assert.match(listingCardSource, /rounded-2xl/);
  assert.match(stylesSource, /@keyframes category-art-bob/);
  assert.match(stylesSource, /prefers-reduced-motion: no-preference/);
});

test("browse filters remain complete inside the spacious drawer", () => {
  assert.match(browseSource, /SheetContent/);
  assert.match(browseSource, /Filter listings/);
  assert.match(browseSource, /Show \{result\.total\}/);
  for (const field of [
    "make",
    "model",
    "yearMin",
    "yearMax",
    "mileageMax",
    "bodyStyle",
    "drivetrain",
    "transmission",
    "fuelType",
    "exteriorColor",
    "titleStatus",
  ]) {
    assert.match(browseSource, new RegExp(field));
  }
  assert.match(browseSource, /setFiltersOpen\(false\)/);
});

test("listing detail keeps a responsive photo gallery and floating action card", () => {
  assert.match(detailSource, /Show all photos/);
  assert.match(detailSource, /row-span-2/);
  assert.match(detailSource, /DialogContent/);
  assert.match(actionsSource, /floating-card/);
  assert.match(detailSource, /specIcons/);
});
