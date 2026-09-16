import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

const configSource = await read("src/config/classifieds.ts");
const browseSource = await read("src/routes/browse.tsx");
const createSource = await read("src/routes/_authenticated/create-listing.tsx");
const contractsSource = await read("src/lib/classified-listing-contracts.ts");
const actionsSource = await read("src/components/classifieds/ListingActions.tsx");
const inquirySource = await read("src/lib/classified-inquiry.functions.ts");
const emailNotificationsSource = await read("src/lib/email-notifications.server.ts");
const inquiryEmailTemplateSource = await read(
  "src/lib/email-templates/listing-inquiry-received.tsx",
);
const moderationSource = await read("src/routes/_authenticated/admin.classifieds.tsx");
const authenticatedRouteSource = await read("src/routes/_authenticated/route.tsx");
const authMiddlewareSource = await read("src/integrations/supabase/auth-middleware.ts");
const sellSource = await read("src/routes/sell.tsx");
const sellerSetupSource = await read("src/routes/_authenticated/seller-setup.tsx");
const sellingSource = await read("src/routes/_authenticated/selling.tsx");
const accountSource = await read("src/routes/_authenticated/account.tsx");
const glossarySource = await read("src/routes/glossary.tsx");
const policiesSource = await read("src/routes/policies.tsx");
const classifiedsFunctionsSource = await read("src/lib/classifieds.functions.ts");
const marketFunctionsSource = await read("src/lib/market.functions.ts");
const stripeMarketplaceSource = await read("src/lib/stripe-marketplace.functions.ts");
const stripeServerSource = await read("src/lib/stripe-marketplace.server.ts");
const seedScriptSource = await read("scripts/seed-classifieds.mjs");
const mediaCountMigrationSource = await read(
  "supabase/migrations/20260915140000_repair_classified_media_counts.sql",
);
const classifiedSchemaSource = await read(
  "supabase/migrations/20260913173736_32625455-cc9d-4572-a1dc-713b70e33dce.sql",
);
const inquiryMigrationSource = await read(
  "supabase/migrations/20260915160000_add_classified_listing_inquiries.sql",
);
const inquiryWriteLockMigrationSource = await read(
  "supabase/migrations/20260915180000_lock_classified_inquiry_writes.sql",
);
const requeueEditedListingMigrationSource = await read(
  "supabase/migrations/20260915190000_requeue_edited_classified_listings.sql",
);
const classifiedMediaSecurityMigrationSource = await read(
  "supabase/migrations/20260915191000_secure_classified_listing_media.sql",
);
const mvpCopyMigrationSource = await read(
  "supabase/migrations/20260915170000_refresh_classified_mvp_copy.sql",
);
const seedRunnerSource = await read("scripts/seed-classifieds.mjs");
const seedMigrationSource = await read(
  "supabase/migrations/20260914110000_add_classified_seed_listing_function.sql",
);
const seedOwnerRepairSource = await read(
  "supabase/migrations/20260915200000_repair_classified_seed_owner_without_fixed_uuid.sql",
);
const fixedSeedOwnerRepairSource = await read(
  "supabase/migrations/20260915110000_repair_classified_seed_owner_fixed.sql",
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

test("classified MVP contacts the seller while future checkout stays available", () => {
  assert.match(actionsSource, /sendClassifiedListingInquiry/);
  assert.match(actionsSource, /Contact seller/);
  assert.match(actionsSource, /Send message/);
  assert.doesNotMatch(actionsSource, /ParkVaultCheckoutFlow/);
  assert.match(marketFunctionsSource, /requestExactListing/);
  assert.match(stripeMarketplaceSource, /reconcileMyListingOfferCheckouts/);
});

test("buyer inquiries are stored against the exact listing and shown to its seller", () => {
  assert.match(inquirySource, /sendClassifiedListingInquiry/);
  assert.match(inquirySource, /listing_id: data\.listingId/);
  assert.match(inquirySource, /seller_id: listing\.seller_id/);
  assert.match(inquirySource, /buyer_email: email/);
  assert.match(inquirySource, /getSellerListingInquiries/);
  assert.match(inquiryMigrationSource, /create table if not exists public\.listing_inquiries/);
  assert.match(inquiryMigrationSource, /buyer_id = auth\.uid\(\)/);
  assert.match(inquiryMigrationSource, /seller_id = auth\.uid\(\)/);
  assert.match(inquiryMigrationSource, /references public\.asks\(id\)/);
});

test("new inquiries notify the seller and support direct email replies", () => {
  assert.match(inquirySource, /emailListingInquiry/);
  assert.match(emailNotificationsSource, /listing-inquiry-received/);
  assert.match(emailNotificationsSource, /replyTo: inquiry\.buyer_email/);
  assert.match(inquiryEmailTemplateSource, /Reply directly to this email/);
  assert.match(inquiryEmailTemplateSource, /Open Selling/);
});

test("classified inquiry writes are server-only", () => {
  assert.match(inquiryWriteLockMigrationSource, /revoke insert, update, delete on table public\.listing_inquiries from authenticated/);
  assert.match(inquiryWriteLockMigrationSource, /drop policy if exists "Buyers create listing inquiries"/);
  assert.match(inquiryWriteLockMigrationSource, /drop policy if exists "Sellers update listing inquiries"/);
  assert.match(inquirySource, /const admin = supabaseAdmin as any/);
  assert.match(inquirySource, /\.from\("listing_inquiries"\)/);
});

test("switching away from vehicle categories clears vehicle-only browse filters", () => {
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
    "exteriorColor",
    "titleStatus",
  ]) {
    assert.match(browseSource, new RegExp(`${field}: undefined`));
  }
  assert.match(browseSource, /const nextMotors = value\("group"\) === "motors"/);
  assert.match(browseSource, /scopedWithoutVehicleFilters/);
});

test("classified seed owner repair resolves the account instead of hard-coding its UUID", () => {
  assert.match(seedOwnerRepairSource, /FROM auth\.users/);
  assert.match(seedOwnerRepairSource, /lower\(email\) = lower\('cayson@xstayproperties\.com'\)/);
  assert.doesNotMatch(seedOwnerRepairSource, /live_owner[^\n]*'[0-9a-f]{8}-[0-9a-f-]{27}'/i);
  assert.doesNotMatch(fixedSeedOwnerRepairSource, /live_owner[^\n]*'[0-9a-f]{8}-[0-9a-f-]{27}'/i);
});

test("approved classified edits return to moderation", () => {
  assert.match(requeueEditedListingMigrationSource, /status = 'pending_review'::public\.product_status/);
  assert.match(requeueEditedListingMigrationSource, /SET approved_at = NULL/);
  assert.match(requeueEditedListingMigrationSource, /seller_id = uid/);
});

test("classified listing media stays private until approval", () => {
  assert.match(classifiedMediaSecurityMigrationSource, /SET public = false/);
  assert.match(classifiedMediaSecurityMigrationSource, /can_read_approved_classified_media/);
  assert.match(classifiedMediaSecurityMigrationSource, /a\.approved_at IS NOT NULL/);
  assert.match(classifiedMediaSecurityMigrationSource, /p\.status = 'published'/);
  assert.match(classifiedsFunctionsSource, /createSignedUrls\(unique, 60 \* 60\)/);
  assert.doesNotMatch(classifiedsFunctionsSource, /object\/public\/listing-media/);
});

test("direct-contact MVP copy is consistent across buyer and seller surfaces", () => {
  assert.match(homeSource, /Buyers contact\s+you directly/);
  assert.match(glossarySource, /Contact seller sends your message/);
  assert.match(policiesSource, /does not process payment, hold funds or provide escrow in this MVP/);
  assert.match(accountSource, /Save listings, contact sellers and arrange pickup/);
  assert.match(sellSource, /Buyers can message you about the exact listing/);
  assert.match(sellerSetupSource, /do not require payment or payout onboarding/);
  assert.match(sellerSetupSource, /const sellerReady = profileReady/);
  assert.doesNotMatch(sellingSource, /Finish payout setup/);
  assert.match(mvpCopyMigrationSource, /UPDATE public\.products/);
  assert.match(mvpCopyMigrationSource, /MVP demo listing for flow testing/);
  assert.match(mvpCopyMigrationSource, /UPDATE public\.asks/);
  assert.match(mvpCopyMigrationSource, /MVP seed record; replace demo media and copy before launch/);
  assert.match(mvpCopyMigrationSource, /UPDATE storage\.buckets/);
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

test("step five seeds media counters required by classified offer and checkout guards", () => {
  assert.match(mediaCountMigrationSource, /evidence_count = counts\.evidence_count/);
  assert.match(mediaCountMigrationSource, /public_media_count = counts\.public_media_count/);
  assert.match(seedScriptSource, /sync_classified_media_counts/);
});

test("offer checkout has a buyer-return fallback when the Stripe webhook is delayed", () => {
  assert.match(stripeMarketplaceSource, /reconcileMyListingOfferCheckouts/);
  assert.match(stripeServerSource, /reconcileListingOfferCheckout/);
  assert.match(stripeServerSource, /finalizeCheckoutSession\(stripe, session\)/);
  assert.match(stripeMarketplaceSource, /stripe_checkout_session_id/);
  assert.match(marketFunctionsSource, /reconcileListingOfferCheckout/);
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
    assert.match(
      listing.description,
      /Staged Idaho listing for marketplace testing/,
    );
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

test("header categories show four primary destinations and a Classifieds control", () => {
  assert.match(headerSource, /function AllCategoriesPopover/);
  assert.match(headerSource, /featuredHeaderCategories = \[/);
  for (const label of [
    "Cars",
    "Homes",
    "Jobs",
    "Services",
  ]) {
    assert.match(headerSource, new RegExp(`name: "${label.replace(/&/g, "\\&")}"`));
  }
  assert.match(headerSource, /aria-label="Classifieds"/);
  assert.match(headerSource, /<span>Classifieds<\/span>/);
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
  assert.match(headerSource, /aria-label="Classifieds"/);
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
    "Homes",
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

test("vehicle browse uses a branded buy and eight-filter discovery hero", () => {
  assert.match(browseSource, /function VehicleBrowseHero/);
  assert.match(browseSource, /Find your next gem on wheels/);
  assert.match(browseSource, /setShowAllFilters/);
  assert.match(browseSource, /expandedFilter/);
  assert.match(browseSource, /function InlineVehicleMakeModelFilter/);
  assert.match(browseSource, /function VehicleResultsPage/);
  assert.match(browseSource, /function VehicleCheckboxList/);
  assert.match(browseSource, /function VehicleSingleSelectList/);
  assert.match(browseSource, /function InlineSingleFilter/);
  assert.match(browseSource, /vehicleModelsByMake/);
  assert.match(browseSource, /modelsForMakes/);
  assert.match(browseSource, /selectedMakes\.length > 0/);
  assert.match(browseSource, /options={availableModels}/);
  assert.match(browseSource, /function InlineLocationFilter/);
  assert.match(browseSource, /Show all search filters/);
  assert.match(browseSource, /Select location/);
  assert.match(browseSource, /Show \{resultCount\.toLocaleString\(\)\}/);
  assert.match(browseSource, /vehicleMode: "results"/);
  assert.match(browseSource, /selected\.includes\(optionValue\)/);
  assert.match(browseSource, /label: "Broken\/needs repairs"/);
  assert.doesNotMatch(browseSource, /vehicleConditionOptions[\s\S]*New, no tags/);
  for (const label of [
    "Make / model",
    "Year",
    "Price",
    "Mileage",
    "Body type",
    "Seller type",
    "Title type",
  ]) {
    assert.match(browseSource, new RegExp(`"${label.replace(/[/.]/g, "\\$&")}"`));
  }
  assert.match(browseSource, /Buy/);
  assert.match(browseSource, /Sell/);
});

test("homes browse has a large landing hero and tab-specific filter views", () => {
  assert.match(browseSource, /function HomesLandingHero/);
  assert.match(browseSource, /function HomesFilterPage/);
  assert.match(browseSource, /Build\. Buy\. Rent\./);
  assert.match(browseSource, /County, city, neighborhood, or ZIP/);
  assert.match(browseSource, /More filters/);
  assert.match(browseSource, /homeMode: "results"/);
  assert.match(browseSource, /homeTabs/);
  for (const label of [
    "Square feet",
    "Home builder",
    "Construction type",
    "Acres",
    "Seller type",
    "Cats",
    "Dogs",
    "Home amenities",
    "Community amenities",
    "Lease length",
  ]) {
    assert.match(browseSource, new RegExp(label));
  }
  assert.match(browseSource, /function HomeMultiSelectControl/);
  assert.match(browseSource, /function HomePriceRangeControl/);
  assert.match(browseSource, /if \(!input && options\)/);
  assert.match(browseSource, /Minimum price/);
  assert.match(browseSource, /Maximum price/);
  assert.match(browseSource, /visibleSelected\.length === 1/);
  assert.match(browseSource, /\$\{visibleSelected\.length\} selected/);
  for (const selectionRule of [
    'label="Property type" value={propertyType} options={homePropertyTypes} multi onChange',
    'label="Bedrooms" value={bedrooms} options={homeBedroomOptions} multi={false}',
    'label={activeTab === "rent" ? "Bathrooms" : "Bathrooms"} value={bathrooms} options={homeBathroomOptions} multi={false}',
    'label: "Square feet", options: homeSquareFeetOptions, multi: false',
    'label: "Construction type", options: ["Any construction", "New construction", "Existing home"], multi: true',
    'label: "Acres", options: homeAcresOptions, multi: false',
    'label: "Seller type", options: ["Any seller", "Owner", "Agent", "Builder"], multi: true',
    'label: "Cats", options: ["Any cat policy", "Cats allowed", "Cats not allowed"], multi: false',
    'label: "Dogs", options: ["Any dog policy", "Dogs allowed", "Dogs not allowed"], multi: false',
    'label: "Home amenities", options: homeAmenitiesOptions, multi: true',
    'label: "Community amenities", options: communityAmenitiesOptions, multi: true',
    'label: "Lease length", options: leaseLengthOptions, multi: false',
  ]) {
    assert.ok(browseSource.includes(selectionRule), `missing home filter selection rule: ${selectionRule}`);
  }
  for (const option of [
    "<250",
    "10000+",
    "< .10",
    "2.5+",
    "Air Conditioning",
    "WiFi in Common Areas",
    "Month-to-month",
    "24 Months or Less",
  ]) {
    assert.ok(browseSource.includes(option), `missing homes filter option: ${option}`);
  }
  assert.match(browseSource, /h-\[88px\]/g);
  assert.match(browseSource, /Hide all filters/);
  assert.match(browseSource, /homeTab: row\.title\.includes/);
});

test("jobs browse has a landing hero and expanded local job filters", () => {
  assert.match(browseSource, /function JobsLandingHero/);
  assert.match(browseSource, /function JobsFilterPage/);
  assert.match(browseSource, /function JobChecklist/);
  assert.match(browseSource, /selected\.includes\(option\)/);
  assert.match(browseSource, /next\.join\("\|"\)/);
  assert.match(browseSource, /Find <span className="text-accent">local<\/span> work that fits your life/);
  assert.match(browseSource, /Search jobs from local employers across Idaho and surrounding states/);
  assert.match(browseSource, /Search Jobs/);
  assert.match(browseSource, /Post a Job/);
  assert.match(browseSource, /More filters/);
  assert.match(browseSource, /jobMode: "results"/);
  assert.match(browseSource, /<JobSelect label="Time on site"/);
  for (const label of [
    "Category",
    "Job type",
    "Job pay range",
    "Education level",
    "Years of experience",
    "Photos / video",
    "Time on site",
  ]) {
    assert.match(browseSource, new RegExp(label));
  }
  assert.match(browseSource, /function JobToggle/);
  assert.match(browseSource, /function JobCard/);
});

test("services browse has a category-led landing page", () => {
  assert.match(configSource, /slug: "services"/);
  assert.match(browseSource, /function ServicesLandingHero/);
  assert.match(browseSource, /function ServicesCategoryShowcase/);
  assert.match(browseSource, /function ServicesFilterPage/);
  assert.match(browseSource, /function ServiceCategoryPicker/);
  assert.match(browseSource, /function ServiceFilterGroup/);
  assert.match(browseSource, /Popular services/);
  assert.match(browseSource, /Seasonal categories/);
  assert.match(browseSource, /Browse all categories/);
  assert.match(browseSource, /What service are you looking for\?/);
  assert.match(browseSource, /Expand Your Search/);
  assert.match(browseSource, /Only show listings with photos/);
  assert.match(browseSource, /Seller Type/);
  assert.match(browseSource, /Time On Site/);
  assert.match(browseSource, /serviceMode: "results"/);
});

test("listing detail keeps a responsive photo gallery and floating action card", () => {
  assert.match(detailSource, /Show all photos/);
  assert.match(detailSource, /row-span-2/);
  assert.match(detailSource, /DialogContent/);
  assert.match(actionsSource, /floating-card/);
  assert.match(detailSource, /specIcons/);
});
