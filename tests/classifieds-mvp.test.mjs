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
const authenticatedRouteSource = await read("src/routes/_authenticated/route.tsx");
const authMiddlewareSource = await read("src/integrations/supabase/auth-middleware.ts");
const sellSource = await read("src/routes/sell.tsx");
const classifiedsFunctionsSource = await read("src/lib/classifieds.functions.ts");
const stripeMarketplaceSource = await read("src/lib/stripe-marketplace.functions.ts");
const classifiedSchemaSource = await read(
  "supabase/migrations/20260913173736_32625455-cc9d-4572-a1dc-713b70e33dce.sql",
);
const seedRunnerSource = await read("scripts/seed-classifieds.mjs");
const seedMigrationSource = await read(
  "supabase/migrations/20260914110000_add_classified_seed_listing_function.sql",
);
const approvalRepairSource = await read(
  "supabase/migrations/20260915130000_publish_classified_product_after_approval.sql",
);
const emailShellSource = await read("src/lib/email-templates/shell.tsx");
const authEmailSource = await read("src/routes/lovable/email/auth/webhook.ts");
const brandMarkSource = await read("src/components/layout/BrandMark.tsx");
const headerSource = await read("src/components/layout/SiteHeader.tsx");
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

test("step four protects authenticated, seller-owned, and admin-only surfaces", () => {
  assert.match(authenticatedRouteSource, /supabase\.auth\.getUser\(\)/);
  assert.match(authenticatedRouteSource, /throw redirect\(\{ to: "\/auth"/);
  assert.match(authenticatedRouteSource, /sellerRedirects = \[/);
  assert.match(authMiddlewareSource, /getClaims/);
  assert.match(authMiddlewareSource, /userId: data\.claims\.sub/);

  assert.match(classifiedsFunctionsSource, /middleware\(\[requireSupabaseAuth\]\)/);
  assert.match(classifiedsFunctionsSource, /_user_id: context\.userId/);
  assert.match(classifiedsFunctionsSource, /_role: "admin"/);
  assert.match(moderationSource, /if \(!data\.isAdmin\)/);
  assert.match(moderationSource, /Administrator access required/);

  assert.match(classifiedSchemaSource, /a\.seller_id = auth\.uid\(\)/);
  assert.match(classifiedSchemaSource, /public\.is_staff\(auth\.uid\(\)\)/);
  assert.match(classifiedSchemaSource, /created_by = auth\.uid\(\)/);
});

test("step five keeps classified checkout delivery labels on the Gem State brand", () => {
  assert.match(stripeMarketplaceSource, /id: "gemstate_flat_ground"/);
  assert.match(stripeMarketplaceSource, /carrier: "Gem State Classifieds"/);
  assert.doesNotMatch(
    stripeMarketplaceSource,
    /id: "parkvault_flat_ground"[\s\S]*carrier: "ParkVault"/,
  );
});

test("classified approval publishes the linked product", () => {
  assert.match(approvalRepairSource, /publish_classified_product_after_approval/);
  assert.match(approvalRepairSource, /NEW\.approved_at IS NOT NULL/);
  assert.match(approvalRepairSource, /classified_listing_details/);
  assert.match(approvalRepairSource, /status = 'published'::public\.product_status/);
  assert.match(approvalRepairSource, /AFTER UPDATE OF status, approved_at ON public\.asks/);
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
  assert.match(
    homeSource,
    /headlineItems\[0\].*headlineItems\[1\].*headlineItems\[2\].*headlineItems\[3\]/s,
  );
  assert.match(homeSource, /last-headline/);
});

test("homepage hero uses the expanded headline width and updated subline", () => {
  assert.match(homeSource, /max-w-\[34ch\]/);
  assert.match(homeSource, /And so much more across Idaho and surrounding states\./);
  assert.doesNotMatch(homeSource, /listed one item at a time by sellers/);
  assert.doesNotMatch(homeSource, /What are you looking for\?/);
  assert.doesNotMatch(homeSource, /live.*listings.*right now/);
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
  assert.match(categoryIconSource, /loading="eager"/);
  assert.match(categoryIconSource, /SquaresFour/);
  assert.match(listingCardSource, /listing\.categorySlug \?\? "general"/);
  assert.match(listingCardSource, /CategoryArtwork/);
  assert.match(listingCardSource, /bg-gradient-to-br/);
  assert.match(listingCardSource, /rounded-2xl/);
  assert.match(stylesSource, /@keyframes category-art-bob/);
  assert.match(stylesSource, /prefers-reduced-motion: no-preference/);
});

test("header categories show six featured categories and an all-categories control", () => {
  assert.match(headerSource, /function AllCategoriesPopover/);
  assert.match(headerSource, /featuredHeaderCategories = \[/);
  for (const label of [
    "Cars & Trucks",
    "Appliances",
    "Electronics",
    "Furniture",
    "Home & Garden",
    "Pets",
  ]) {
    assert.match(headerSource, new RegExp(`name: "${label.replace(/&/g, "\\&")}"`));
  }
  assert.doesNotMatch(headerSource, /Scroll categories left/);
  assert.doesNotMatch(headerSource, /Scroll categories right/);
  assert.doesNotMatch(headerSource, /scrollBy\(/);
  assert.match(
    headerSource,
    /navigationCategories = classifiedCategories\.filter\(\(c\) => c\.slug !== "general"\)/,
  );
  assert.match(headerSource, /navigationCategories\.map/);
  assert.match(headerSource, /size=\{64\}/);
});

test("all categories opens a labeled icon menu with KSL-style sections", () => {
  assert.match(headerSource, /PopoverContent/);
  assert.match(headerSource, /function AllCategoriesPopover/);
  assert.match(headerSource, /aria-label="All categories"/);
  assert.match(
    headerSource,
    /<p className="text-\[18px\] font-semibold tracking-tight">All categories<\/p>/,
  );
  assert.match(
    headerSource,
    /CategoryArtwork[\s\S]*slug=\{category\.slug\}[\s\S]*size=\{58\}[\s\S]*className="!h-\[58px\] !w-\[58px\] shrink-0"/,
  );
  assert.match(headerSource, /w-\[min\(1280px,calc\(100vw-2rem\)\)\]/);
  assert.match(headerSource, /xl:grid-cols-6/);
  assert.match(headerSource, /w-auto min-w-\[158px\]/);
  assert.match(headerSource, /sm:gap-2/);
  assert.match(headerSource, /hover:shadow-md/);
  for (const label of [
    "Announcements",
    "Appliances",
    "Baby",
    "Books and Media",
    "Clothing and Apparel",
    "Computers",
    "Cycling",
    "Fitness Equipment",
    "For Trade or Barter",
    "FREE",
    "Home and Garden",
    "Hunting and Fishing",
    "Industrial",
    "Jobs",
    "Livestock",
    "Musical Instruments",
    "Other Real Estate",
    "Pets",
    "Services",
    "Tickets",
    "Toys",
    "Water Sports",
    "Weddings",
    "Winter Sports",
  ]) {
    assert.match(headerSource, new RegExp(`name: "${label}"`));
  }
  for (const slug of [
    "announcements",
    "appliances",
    "baby",
    "books-media",
    "clothing-apparel",
    "computers",
    "cycling",
    "fitness-equipment",
    "for-trade-barter",
    "free",
    "home-garden",
    "hunting-fishing",
    "industrial",
    "jobs",
    "livestock",
    "musical-instruments",
    "other-real-estate",
    "pets",
    "services",
    "tickets",
    "toys",
    "water-sports",
    "weddings",
    "winter-sports",
  ]) {
    assert.match(categoryIconSource, new RegExp(`(?:[\\"']${slug}[\\"']|${slug}:)`));
  }
});

test("expanded category menu entries use transparent dimensional artwork", () => {
  for (const slug of [
    "announcements",
    "appliances",
    "baby",
    "books-media",
    "clothing-apparel",
    "computers",
    "cycling",
    "fitness-equipment",
    "for-trade-barter",
    "free",
    "home-garden",
    "hunting-fishing",
    "industrial",
    "jobs",
    "livestock",
    "musical-instruments",
    "other-real-estate",
    "pets",
    "services",
    "tickets",
    "toys",
    "water-sports",
    "weddings",
    "winter-sports",
  ]) {
    assert.match(categoryIconSource, new RegExp(`src: "/category-icons/${slug}\\.png"`));
  }
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
