import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

const configSource = await read("src/config/classifieds.ts");
const browseSource = await read("src/routes/browse.tsx");
const createSource = await read("src/routes/_authenticated/create-listing.tsx");
const listingFormSource = await read("src/components/classifieds/listing-form/ListingForm.tsx");
const vehicleFieldsSource = await read("src/components/classifieds/listing-form/VehicleFields.tsx");
const homeFieldsSource = await read("src/components/classifieds/listing-form/HomeFields.tsx");
const jobFieldsSource = await read("src/components/classifieds/listing-form/JobFields.tsx");
const serviceFieldsSource = await read("src/components/classifieds/listing-form/ServiceFields.tsx");
const listingFormPayloadSource = await read("src/components/classifieds/listing-form/payload.ts");
const editSource = await read("src/routes/_authenticated/listings.$listingId.edit.tsx");
const homeJobServiceMigrationSource = await read(
  "supabase/migrations/20260918100000_add_classified_home_job_service_details.sql",
);
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
const accountCenterSource = await read("src/components/account/AccountCenter.tsx");
const accountFunctionsSource = await read("src/lib/account.functions.ts");
const accountCenterFunctionsSource = await read("src/lib/account-center.functions.ts");
const conversationFunctionsSource = await read("src/lib/conversation.functions.ts");
const listingUpgradeFunctionsSource = await read("src/lib/listing-upgrade.functions.ts");
const listingUpgradeMigrationSource = await read(
  "supabase/migrations/20260918113000_add_seller_listing_upgrades.sql",
);
const simplifiedUpgradeMigrationSource = await read(
  "supabase/migrations/20260920120000_simplify_listing_upgrades.sql",
);
const accountCenterMigrationSource = await read(
  "supabase/migrations/20260918110000_add_account_center_tools.sql",
);
const profileAvatarMigrationSource = await read(
  "supabase/migrations/20260920100000_add_profile_avatar_storage.sql",
);
const savedSearchWorkerSource = await read("src/lib/saved-search-worker.server.ts");
const glossarySource = await read("src/routes/glossary.tsx");
const policiesSource = await read("src/routes/policies.tsx");
const authSource = await read("src/routes/auth.tsx");
const classifiedsFunctionsSource = await read("src/lib/classifieds.functions.ts");
const listingDetailSource = await read("src/routes/listings.$listingId.tsx");
const adminClassifiedsSource = await read("src/routes/_authenticated/admin.classifieds.tsx");
const listingReportsMigrationSource = await read(
  "supabase/migrations/20260920110000_add_classified_listing_reports.sql",
);
const vehicleFunctionsSource = await read("src/lib/vehicle.functions.ts");
const marketFunctionsSource = await read("src/lib/market.functions.ts");
const stripeMarketplaceSource = await read("src/lib/stripe-marketplace.functions.ts");
const stripeServerSource = await read("src/lib/stripe-marketplace.server.ts");
const emailSenderSource = await read("src/lib/email-templates/send-email.ts");
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
const inquiryRpcMigrationSource = await read(
  "supabase/migrations/20260917222000_secure_classified_inquiry_rpc.sql",
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
const seedCopyMigrationSource = await read(
  "supabase/migrations/20260919240000_clean_classified_seed_copy.sql",
);
const seedRunnerSource = await read("scripts/seed-classifieds.mjs");
const advertiseSource = await read("src/routes/advertise.tsx");
const safetySource = await read("src/routes/safety.tsx");
const footerSource = await read("src/components/layout/SiteFooter.tsx");
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
const allCategoriesSource = await read("src/components/classifieds/AllCategoriesPopover.tsx");
const homeSource = await read("src/routes/index.tsx");
const categoryIconSource = await read("src/components/classifieds/CategoryIcon.tsx");
const listingCardSource = await read("src/components/classifieds/ListingCard.tsx");
const detailSource = await read("src/routes/listings.$listingId.tsx");
const mockListingsSource = await read("src/config/classified-mocks.ts");
const stylesSource = await read("src/styles.css");
const { classifiedSeedListings } = await import("../scripts/classified-seed-data.mjs");

test("classified taxonomy includes Idaho categories and automotive inventory", () => {
  assert.match(configSource, /cars-trucks/);
  assert.match(configSource, /furniture/);
  assert.match(configSource, /idahoRegions/);
  assert.match(configSource, /drivetrains: \[[\s\S]*4WD/);
  assert.match(configSource, /vehicleModelsByMake/);
  for (const make of [
    "Abarth",
    "Alfa Romeo",
    "Freightliner",
    "Polestar",
    "Rivian",
    "Winnebago",
    "Big Tex",
  ]) {
    assert.match(configSource, new RegExp(make.replace(/[.*+?^${}()|[\\]\\]/g, "\\$&")));
  }
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
    assert.match(vehicleFieldsSource, new RegExp(field.replace(/Min|Max/, "")));
  }
  assert.match(contractsSource, /state:/);
  assert.match(contractsSource, /region:/);
  assert.match(vehicleFieldsSource, /vehicle-make-options/);
  assert.match(vehicleFieldsSource, /vehicle-model-options/);
  assert.match(vehicleFieldsSource, /vehicleModelsByMake/);
});

test("listing creation and edit share one form, extended with home/job/service fields", () => {
  // Create/edit used to be two hand-duplicated flat forms; both are now thin
  // wrappers around the shared ListingForm component.
  assert.match(createSource, /<ListingForm mode="create"/);
  assert.match(editSource, /<ListingForm[\s\S]*mode="edit"/);
  assert.doesNotMatch(createSource, /vehicleOptions\.bodyStyles\.map/);
  assert.doesNotMatch(editSource, /vehicleOptions\.bodyStyles\.map/);

  assert.match(listingFormSource, /isHome/);
  assert.match(listingFormSource, /isJob/);
  assert.match(listingFormSource, /isService/);
  assert.match(listingFormSource, /HomeFields/);
  assert.match(listingFormSource, /JobFields/);
  assert.match(listingFormSource, /ServiceFields/);

  assert.match(homeFieldsSource, /propertyType/);
  assert.match(homeFieldsSource, /bedrooms/);
  assert.match(homeFieldsSource, /homeMode/);
  assert.match(jobFieldsSource, /employerName/);
  assert.match(jobFieldsSource, /payMin/);
  assert.match(jobFieldsSource, /employmentType/);
  assert.match(serviceFieldsSource, /subcategory/);
  assert.match(serviceFieldsSource, /serviceArea/);
  assert.match(serviceFieldsSource, /licenseNumber/);

  assert.match(contractsSource, /home: z/);
  assert.match(contractsSource, /job: z/);
  assert.match(contractsSource, /service: z/);
  assert.match(contractsSource, /employerName/);
  assert.match(contractsSource, /propertyType/);
  assert.match(contractsSource, /subcategory/);

  assert.match(classifiedsFunctionsSource, /function homeOf/);
  assert.match(classifiedsFunctionsSource, /function jobOf/);
  assert.match(classifiedsFunctionsSource, /function serviceOf/);
  assert.match(classifiedsFunctionsSource, /_home: homeForRpc/);
  assert.match(classifiedsFunctionsSource, /_job: jobForRpc/);
  assert.match(classifiedsFunctionsSource, /_service: serviceForRpc/);

  assert.match(homeJobServiceMigrationSource, /home_property_type/);
  assert.match(homeJobServiceMigrationSource, /job_employer_name/);
  assert.match(homeJobServiceMigrationSource, /service_subcategory/);
  assert.match(homeJobServiceMigrationSource, /_apply_classified_category_details/);
  assert.match(
    homeJobServiceMigrationSource,
    /INSERT INTO public\.categories[\s\S]*other-real-estate[\s\S]*ON CONFLICT \(slug\) DO NOTHING/,
  );
  assert.match(configSource, /other-real-estate.*Homes/);

  assert.match(listingFormPayloadSource, /function buildHome/);
  assert.match(listingFormPayloadSource, /function buildJob/);
  assert.match(listingFormPayloadSource, /function buildService/);
  assert.match(listingFormPayloadSource, /function fromEditor/);

  assert.match(sellingSource, /Duplicate/);
  assert.match(sellingSource, /duplicateFrom/);
});

test("classified MVP contacts the seller while future checkout stays available", () => {
  assert.match(actionsSource, /create_listing_inquiry/);
  assert.match(actionsSource, /Contact seller/);
  assert.match(actionsSource, /Send message/);
  assert.doesNotMatch(actionsSource, /ParkVaultCheckoutFlow/);
  assert.match(marketFunctionsSource, /requestExactListing/);
  assert.match(stripeMarketplaceSource, /reconcileMyListingOfferCheckouts/);
});

test("buyer inquiries are stored against the exact listing and shown to its seller", () => {
  assert.match(inquirySource, /create_listing_inquiry/);
  assert.match(inquirySource, /_listing_id: data\.listingId/);
  assert.match(inquiryMigrationSource, /listing_id uuid[\s\S]*seller_id uuid[\s\S]*buyer_id uuid/);
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
  assert.match(
    inquiryWriteLockMigrationSource,
    /revoke insert, update, delete on table public\.listing_inquiries from authenticated/,
  );
  assert.match(
    inquiryWriteLockMigrationSource,
    /drop policy if exists "Buyers create listing inquiries"/,
  );
  assert.match(
    inquiryWriteLockMigrationSource,
    /drop policy if exists "Sellers update listing inquiries"/,
  );
  assert.match(inquiryRpcMigrationSource, /SECURITY DEFINER/);
  assert.match(inquiryRpcMigrationSource, /auth\.uid\(\)/);
  assert.match(inquirySource, /create_listing_inquiry/);
  assert.doesNotMatch(inquirySource, /supabaseAdmin/);
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
  assert.match(
    requeueEditedListingMigrationSource,
    /status = 'pending_review'::public\.product_status/,
  );
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

test("flag this listing submits an authenticated report and exposes it to admins", () => {
  assert.match(listingDetailSource, /FlagListingDialog/);
  assert.match(listingDetailSource, /reportClassifiedListing/);
  assert.match(listingDetailSource, /Submit report/);
  assert.match(classifiedsFunctionsSource, /classified_listing_reports/);
  assert.match(classifiedsFunctionsSource, /getAdminClassifiedReports/);
  assert.match(adminClassifiedsSource, /Open listing reports/);
  assert.match(listingReportsMigrationSource, /Members create listing reports/);
  assert.match(listingReportsMigrationSource, /Admins read listing reports/);
  assert.match(listingReportsMigrationSource, /classified_listing_reports_one_per_member/);
});

test("vehicle forms can decode VINs through the server-side NHTSA adapter", () => {
  assert.match(vehicleFunctionsSource, /vpic\.nhtsa\.dot\.gov\/api\/vehicles\/DecodeVin/);
  assert.match(vehicleFunctionsSource, /requireSupabaseAuth/);
  assert.match(vehicleFunctionsSource, /VIN_PATTERN/);
  assert.match(vehicleFunctionsSource, /bodyStyleFor/);
  assert.match(vehicleFunctionsSource, /fuelTypeFor/);
  assert.match(vehicleFieldsSource, /decodeVehicleVin/);
  assert.match(vehicleFieldsSource, /Decode VIN/);
  assert.match(vehicleFieldsSource, /NHTSA vehicle database/);
});

test("direct-contact marketplace copy is consistent across buyer and seller surfaces", () => {
  assert.match(homeSource, /Buyers contact\s+you directly/);
  assert.match(glossarySource, /Contact seller sends your message/);
  assert.match(
    policiesSource,
    /does not process payment, hold funds or provide escrow through the\s+marketplace/,
  );
  assert.match(accountSource, /Save listings, contact sellers and arrange pickup/);
  assert.match(sellSource, /Buyers can message you about the exact listing/);
  assert.match(sellerSetupSource, /do not require payment, payout, or shipping-method/);
  assert.match(sellerSetupSource, /const sellerReady = profileReady/);
  assert.match(
    sellerSetupSource,
    /const profileReady = Boolean\(setup\.data\?\.exists && setup\.data\?\.termsAccepted\)/,
  );
  assert.doesNotMatch(sellingSource, /Finish payout setup/);
  assert.match(mvpCopyMigrationSource, /UPDATE public\.products/);
  assert.match(mvpCopyMigrationSource, /MVP demo listing for flow testing/);
  assert.match(mvpCopyMigrationSource, /UPDATE public\.asks/);
  assert.match(
    mvpCopyMigrationSource,
    /MVP seed record; replace demo media and copy before launch/,
  );
  assert.match(mvpCopyMigrationSource, /UPDATE storage\.buckets/);
  assert.match(seedCopyMigrationSource, /UPDATE public\.products/);
  assert.match(
    seedCopyMigrationSource,
    /Confirm item details and availability directly with the seller/,
  );
  assert.doesNotMatch(glossarySource, /\bMVP\b/);
  assert.doesNotMatch(policiesSource, /\bMVP\b/);
});

test("Google sign-in has a recognizable provider mark", () => {
  assert.match(authSource, /Continue with Google/);
  assert.match(authSource, /viewBox="0 0 24 24"/);
  assert.match(authSource, /fill="#4285F4"/);
  assert.match(authSource, /fill="#34A853"/);
  assert.match(authSource, /fill="#FBBC05"/);
  assert.match(authSource, /fill="#EA4335"/);
});

test("account center exposes the unified sections and preserves legacy entry points", () => {
  for (const section of [
    "overview",
    "profile",
    "settings",
    "listings",
    "saved",
    "searches",
    "messages",
    "notifications",
    "reviews",
    "billing",
  ]) {
    assert.match(accountCenterSource, new RegExp(`\\"${section}\\"`));
  }
  assert.match(accountSource, /validateSearch/);
  assert.match(accountSource, /conversation/);
  assert.match(accountCenterSource, /Saved listings/);
  assert.match(accountCenterSource, /Saved searches/);
  assert.match(accountCenterSource, /Messages/);
  assert.match(accountCenterSource, /Billing/);
  assert.match(accountCenterSource, /Manage billing/);
  assert.match(accountCenterSource, /Set up seller profile/);
});

test("account profile editing and listing upgrades use clear current-state controls", () => {
  assert.match(accountCenterSource, /Edit the fields below/);
  assert.match(accountCenterSource, /h-11 w-full rounded-xl border border-input/);
  assert.match(accountCenterSource, /Upgrade your listing now/);
  assert.match(accountCenterSource, /Secure checkout is handled by Stripe/);
  assert.match(accountCenterSource, /do not need to connect a Stripe seller account/);
  assert.doesNotMatch(accountCenterSource, /Continue to Stripe/);
  assert.doesNotMatch(accountCenterSource, /Stripe seller connection:/);
});

test("account profile supports an authenticated public profile picture", () => {
  assert.match(accountCenterSource, /profile-photo-upload/);
  assert.match(accountCenterSource, /profile-avatars/);
  assert.match(accountCenterSource, /updateMyAvatar/);
  assert.match(accountFunctionsSource, /updateMyAvatar/);
  assert.match(accountFunctionsSource, /avatar_url/);
  assert.match(profileAvatarMigrationSource, /profile-avatars/);
  assert.match(profileAvatarMigrationSource, /Members upload their profile avatar/);
  assert.match(profileAvatarMigrationSource, /file_size_limit/);
});

test("account center writes are authenticated and conversations are participant-scoped", () => {
  assert.match(accountCenterFunctionsSource, /requireSupabaseAuth/);
  assert.match(conversationFunctionsSource, /requireSupabaseAuth/);
  assert.match(accountCenterMigrationSource, /alter table if exists public\.notifications/);
  assert.match(accountCenterMigrationSource, /Participants read messages/);
  assert.match(accountCenterMigrationSource, /security definer/i);
  assert.match(accountCenterMigrationSource, /conversation_start/);
  assert.match(accountCenterMigrationSource, /conversation_message/);
  assert.match(accountCenterMigrationSource, /block_conversation/);
});

test("messaging supports protected attachments, moderation controls, and send retries", () => {
  assert.match(conversationFunctionsSource, /conversation-attachments/);
  assert.match(conversationFunctionsSource, /image\/jpeg/);
  assert.match(conversationFunctionsSource, /10 \* 1024 \* 1024/);
  assert.match(conversationFunctionsSource, /await emailMarketplaceMessage/);
  assert.match(conversationFunctionsSource, /reportConversation/);
  assert.match(accountCenterSource, /Block this member\?/);
  assert.match(accountCenterSource, /Report this conversation/);
  assert.match(accountCenterSource, /Retry send/);
});

test("saved searches reopen their full filters and update in place", () => {
  assert.match(browseSource, /savedSearchId/);
  assert.match(
    browseSource,
    /updateSearch\(\{ data: \{ id: search\.savedSearchId, search: searchToSave \} \}\)/,
  );
  assert.match(browseSource, /Update saved search/);
  assert.match(accountCenterSource, /Edit filters/);
  assert.match(accountCenterSource, /params\.set\("savedSearchId", item\.id\)/);
});

test("saved-search alerts honor category-specific filters", () => {
  assert.match(savedSearchWorkerSource, /vehicle_make/);
  assert.match(savedSearchWorkerSource, /home_mode/);
  assert.match(savedSearchWorkerSource, /job_employment_type/);
  assert.match(savedSearchWorkerSource, /service_subcategory/);
  assert.match(savedSearchWorkerSource, /classified_listing_details\(\*\)/);
});

test("seller billing is catalog-backed and settles upgrades through Stripe webhooks", () => {
  assert.match(listingUpgradeFunctionsSource, /getListingUpgradeOptions/);
  assert.match(listingUpgradeFunctionsSource, /createListingUpgradeCheckout/);
  assert.match(listingUpgradeFunctionsSource, /idempotencyKey/);
  assert.match(listingUpgradeMigrationSource, /listing_upgrade_catalog/);
  assert.match(listingUpgradeMigrationSource, /listing_upgrade_purchases/);
  assert.match(stripeServerSource, /gemstate_purpose/);
  assert.match(stripeServerSource, /finalizeListingUpgradeCheckout/);
  assert.match(stripeServerSource, /failListingUpgradePaymentIntent/);
  assert.match(stripeServerSource, /checkout\.session\.async_payment_failed/);
  assert.match(stripeServerSource, /payment_intent\.payment_failed/);
  assert.match(stripeServerSource, /status: "failed"/);
  assert.match(accountCenterSource, /Upgrade your listing now/);
  assert.match(accountCenterSource, /queryKey: \["my-listings"\][\s\S]*?enabled: true/);
  assert.match(simplifiedUpgradeMigrationSource, /amount_cents = 1200/);
  assert.match(simplifiedUpgradeMigrationSource, /amount_cents = 1000/);
  assert.match(simplifiedUpgradeMigrationSource, /duration_days = 1/);
  assert.match(simplifiedUpgradeMigrationSource, /where code not in \('bump', 'featured'\)/);
  assert.match(classifiedsFunctionsSource, /order\("featured_until"/);
  assert.match(classifiedsFunctionsSource, /order\("ranking_at"/);
  assert.match(stripeServerSource, /listingUpdate\["ranking_at"\] = paidAt/);
  assert.match(listingCardSource, />\s*Featured\s*</);
  assert.match(createSource, /Every listing is free/);
  assert.match(
    accountCenterSource,
    /Boosted and Featured are the only paid options, and both are completely optional/,
  );
  assert.doesNotMatch(accountCenterSource, /extra visibility or time/);
});

test("marketplace notification delivery is Resend-only", () => {
  assert.match(emailSenderSource, /RESEND_API_KEY/);
  assert.match(emailSenderSource, /api\.resend\.com\/emails/);
  assert.doesNotMatch(emailSenderSource, /sendLovableEmail|LOVABLE_API_KEY|LOVABLE_SEND_URL/);
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
    assert.match(listing.description, /Buyers should confirm availability/);
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

test("main homepage presents category-curated listing rows", () => {
  assert.match(homeSource, /function HomepageListingRow/);
  for (const title of [
    "Fresh local finds",
    "New vehicle arrivals",
    "Trucks, SUVs & pickups",
    "Affordable vehicles",
    "Homes for sale",
    "New builds to explore",
    "Rentals worth a look",
    "Jobs hiring now",
    "Flexible and part-time work",
    "Services for your next project",
    "Home services and repairs",
    "Everyday finds from local sellers",
    "Toys and collectibles",
    "Value finds under $100",
    "More from local sellers",
  ]) {
    assert.match(homeSource, new RegExp(title.replaceAll("$", "\\$")));
  }
  assert.match(homeSource, /function HomepageInfoBand/);
  assert.match(homeSource, /How GemList works/);
  assert.match(homeSource, /For sellers and businesses/);
  assert.match(homeSource, /A marketplace with a local feel/);
  assert.match(homeSource, /home\.recent\.filter\(\(listing\) => listing\.home\)/);
  assert.match(homeSource, /home\.recent\.filter\(\(listing\) => listing\.job\)/);
  assert.match(homeSource, /home\.recent\.filter\(\(listing\) => listing\.service\)/);
  assert.match(homeSource, /no-scrollbar mt-5 flex gap-4/);
});

test("browse heroes surface the GemList sponsorship opportunity", () => {
  assert.match(browseSource, /function SponsoredHeroBadge\(\)/);
  assert.match(browseSource, /Sponsored by GemList/);
  assert.doesNotMatch(browseSource, /Your business could be here/);
  assert.match(browseSource, /to="\/advertise"/);
  assert.match(browseSource, /min-h-\[430px\]/);
  assert.match(browseSource, /min-h-\[500px\]/);
  assert.match(browseSource, /GemList Classifieds/);
  assert.match(browseSource, /GemList Homes/);
  assert.match(browseSource, /GemList Services/);
  assert.match(browseSource, /GemList Jobs/);
  assert.match(browseSource, /Gem State motors/);
  assert.match(browseSource, /min-h-\[590px\]/);
  assert.match(browseSource, /absolute right-5 top-5 z-20 sm:right-7 sm:top-7/);
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
  assert.match(headerSource, /featuredHeaderCategories = \[/);
  for (const label of ["Cars", "Homes", "Jobs", "Services"]) {
    assert.match(headerSource, new RegExp(`name: "${label.replace(/&/g, "\\&")}"`));
  }
  assert.match(headerSource, /aria-label="Classifieds"/);
  assert.match(headerSource, /<span>Classifieds<\/span>/);
  assert.doesNotMatch(headerSource, /Scroll categories left/);
  assert.doesNotMatch(headerSource, /Scroll categories right/);
  assert.doesNotMatch(headerSource, /scrollBy\(/);
  assert.match(headerSource, /mobilePrimaryCategories = \[/);
  assert.match(headerSource, /aria-label="Main categories"/);
  assert.match(headerSource, /Find your next local gem\./);
  assert.match(headerSource, /category\.description/);
  assert.match(headerSource, /size=\{42\}/);
  assert.match(headerSource, /size=\{64\}/);
});

test("all categories opens a labeled icon menu with KSL-style sections", () => {
  assert.match(allCategoriesSource, /PopoverContent/);
  assert.match(allCategoriesSource, /function AllCategoriesPopover/);
  assert.match(headerSource, /aria-label="Classifieds"/);
  assert.match(
    allCategoriesSource,
    /<p className="text-\[18px\] font-semibold tracking-tight">All categories<\/p>/,
  );
  assert.match(
    allCategoriesSource,
    /CategoryArtwork[\s\S]*slug=\{category\.slug\}[\s\S]*size=\{58\}[\s\S]*className="!h-\[58px\] !w-\[58px\] shrink-0"/,
  );
  assert.match(allCategoriesSource, /w-\[min\(1280px,calc\(100vw-2rem\)\)\]/);
  assert.match(allCategoriesSource, /xl:grid-cols-6/);
  assert.match(headerSource, /w-auto min-w-\[158px\]/);
  assert.match(allCategoriesSource, /sm:gap-2/);
  assert.match(allCategoriesSource, /hover:bg-secondary/);
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
    assert.match(allCategoriesSource, new RegExp(`name: "${label}"`));
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
  assert.match(browseSource, /vehicleShowcaseRows/);
  assert.match(browseSource, /Popular cars & trucks/);
  assert.match(browseSource, /Just reduced/);
  for (const row of [
    "Fuel-efficient commuters",
    "Family SUVs & crossovers",
    "Work trucks & vans",
    "RVs, campers & trailers",
    "Motorcycles & powersports",
    "Cars under $20,000",
    "Late-model local vehicles",
    "Classic & enthusiast vehicles",
    "Three-row family vehicles",
    "AWD & winter-ready rides",
  ]) {
    assert.match(browseSource, new RegExp(row.replaceAll("$", "\\$")));
  }
  assert.match(browseSource, /GemList Motors/);
});

test("homes browse has a large landing hero and tab-specific filter views", () => {
  const normalizedBrowseSource = browseSource.replace(/\s+/g, " ");
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
    assert.ok(
      normalizedBrowseSource.includes(selectionRule),
      `missing home filter selection rule: ${selectionRule}`,
    );
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
  assert.match(browseSource, /homeTab: activeTab/);
  assert.match(browseSource, /homePreviewRowsByTab/);
  assert.match(browseSource, /Price drops to watch/);
  assert.match(browseSource, /Quick move-in homes/);
  assert.match(browseSource, /Pet-friendly rentals/);
  for (const row of [
    "Starter homes",
    "Condos & townhomes",
    "Homes with space to grow",
    "New build communities",
    "Custom build opportunities",
    "Townhome builds",
    "Apartments under $1,800",
    "Rentals with room to spread out",
    "Short-term & flexible stays",
  ]) {
    assert.match(browseSource, new RegExp(row.replaceAll("$", "\\$")));
  }
  assert.match(browseSource, /HomeShowcaseRows activeTab=\{homeTab\}/);
});

test("jobs browse has a landing hero and expanded local job filters", () => {
  assert.match(browseSource, /function JobsLandingHero/);
  assert.match(browseSource, /function JobsFilterPage/);
  assert.match(browseSource, /function JobChecklist/);
  assert.match(browseSource, /selected\.includes\(option\)/);
  assert.match(browseSource, /next\.join\("\|"\)/);
  assert.match(
    browseSource,
    /Find <span className="text-accent">local<\/span> work that fits your life/,
  );
  assert.match(
    browseSource,
    /Search jobs from local employers across Idaho and surrounding states/,
  );
  assert.match(browseSource, /Search Jobs/);
  assert.match(browseSource, /Post a Job/);
  assert.match(browseSource, /More filters/);
  assert.match(browseSource, /jobMode: "results"/);
  assert.match(
    browseSource,
    /<JobSelect[\s\S]*label="Time on site"[\s\S]*options=\{jobPostedOptions\}/,
  );
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
  assert.match(browseSource, /jobsShowcaseRows/);
  assert.match(browseSource, /Part-time & flexible/);
  assert.match(browseSource, /Skilled trades & hands-on work/);
  for (const row of [
    "Healthcare & caregiving",
    "Hospitality & food service",
    "Office & administrative",
    "Sales & customer experience",
    "Education & childcare",
    "Remote-friendly roles",
    "Seasonal & event work",
    "Finance & accounting",
    "Transportation & delivery",
    "Engineering & technical",
  ]) {
    assert.match(browseSource, new RegExp(row));
  }
});

test("jobs browse results use real listing data, not static placeholder cards", () => {
  assert.match(browseSource, /listings: ClassifiedBrowseResult\["listings"\]/);
  assert.match(browseSource, /sortedListings\.map\(\(listing\) => \(/);
  assert.match(browseSource, /No jobs match these filters\./);
  assert.doesNotMatch(browseSource, /function JobCard/);
  assert.doesNotMatch(browseSource, /jobPreviewRows/);
  assert.doesNotMatch(browseSource, /Laborer needed/);
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
  assert.match(browseSource, /servicesShowcaseRows/);
  assert.match(browseSource, /Recently added pros/);
  assert.match(browseSource, /Projects to plan this season/);
  for (const row of [
    "Plumbing & water",
    "Electrical & lighting",
    "Lawn & landscaping",
    "Cleaning & move-out",
    "Automotive & mobile repair",
    "Home improvement pros",
    "Technology & business help",
    "Moving & hauling",
    "Pet care & family help",
    "Roofing & exterior work",
  ]) {
    assert.match(browseSource, new RegExp(row));
  }
});

test("listing detail keeps a responsive photo gallery and floating action card", () => {
  assert.match(detailSource, /Show all photos/);
  assert.match(detailSource, /row-span-2/);
  assert.match(detailSource, /DialogContent/);
  assert.match(actionsSource, /floating-card/);
  assert.match(detailSource, /specIcons/);
  assert.match(detailSource, /listingTabListClass/);
  assert.match(detailSource, /ring-1 ring-primary\/15/);
  assert.match(detailSource, /hover:border-border\/80/);
  assert.match(detailSource, /Gem State Reviews/);
  assert.match(detailSource, /Array\.from\(\{ length: 5 \}/);
});

test("general classifieds have mock detail fixtures without changing category setup", () => {
  assert.match(mockListingsSource, /mock-general-squishmallows/);
  assert.match(mockListingsSource, /mock-general-vintage-plush/);
  assert.match(mockListingsSource, /mock-general-princess-doll/);
  assert.match(classifiedsFunctionsSource, /mockClassifiedListings/);
  assert.match(detailSource, /function GeneralListingDetail/);
  assert.match(detailSource, /You Might Also Like/);
  assert.match(detailSource, /More From This Seller/);
  assert.match(detailSource, /Safe\. Simple\. Trusted\./);
  assert.match(detailSource, /showPaymentCalculator={false}/);
});

test("job and service mock listings exist with realistic detail fixtures", () => {
  for (const listing of [
    "mock-job-twilite-bouncer",
    "mock-job-meridian-dental-front-desk",
    "mock-job-gem-state-logistics-warehouse",
    "mock-service-boise-home-works",
    "mock-service-treasure-valley-lawn",
    "mock-service-gem-state-tech",
  ]) {
    assert.match(mockListingsSource, new RegExp(listing));
  }
  // Both jobs and services are rendered from the real browseClassifieds
  // result set (see the dedicated browse tests below), so their mock ids are
  // fetched at runtime rather than hardcoded in browse.tsx.
  assert.match(classifiedsFunctionsSource, /service\?: ClassifiedServiceDetails/);
  assert.match(listingCardSource, /listing\.service\?\.pricing/);
});

test("services browse results use real listing data, not static placeholder cards", () => {
  assert.match(browseSource, /listings: ClassifiedBrowseResult\["listings"\]/);
  assert.match(browseSource, /No services match these filters\./);
  assert.doesNotMatch(browseSource, /function ServiceCard/);
  assert.doesNotMatch(browseSource, /servicePreviewRows/);
  assert.doesNotMatch(browseSource, /All Pro Handyman/);
});

test("services have a dedicated detail page with reviews, license, and map tabs", () => {
  assert.match(detailSource, /function ServiceListingDetail/);
  assert.match(detailSource, /function StarRating/);
  assert.match(detailSource, /listing\.categorySlug === "services"/);
  assert.match(detailSource, /Customer reviews/);
  assert.match(detailSource, /What's included/);
  assert.match(detailSource, /License #/);
  assert.match(detailSource, /Look up business license/);
  assert.match(mockListingsSource, /businessAddress:/);
  assert.match(mockListingsSource, /licenseNumber:/);
  assert.match(mockListingsSource, /reviews:\s*\[/);
});

test("home listings use a rental-specific detail layout", () => {
  assert.match(mockListingsSource, /mock-home-rental-crescent-townhome/);
  assert.match(mockListingsSource, /mock-home-rental-parkside-flats/);
  assert.match(mockListingsSource, /mock-home-sale-riverstone/);
  assert.match(mockListingsSource, /mode: "rent"/);
  assert.match(mockListingsSource, /mode: "buy"/);
  assert.match(classifiedsFunctionsSource, /homeTab\?: "buy" \| "rent" \| "build"/);
  assert.match(classifiedsFunctionsSource, /listing\.home\?\.mode !== data\.homeTab/);
  assert.match(detailSource, /listing\.categorySlug === "other-real-estate"/);
  assert.match(detailSource, /function HomeListingDetail/);
  assert.match(detailSource, /function HomeRentalInformation/);
  assert.match(detailSource, /Who pays utilities/);
  assert.match(detailSource, /Lease terms/);
  assert.match(detailSource, /Important safety tip/);
  assert.match(detailSource, /Property details/);
  assert.match(detailSource, /More listings like this/);
});

test("build listings show community and floorplan context", () => {
  assert.match(mockListingsSource, /mock-home-build-banbury-meadows/);
  assert.match(mockListingsSource, /mock-home-build-sage-creek-cottonwood/);
  assert.match(mockListingsSource, /mock-home-build-north-bench-highlands/);
  assert.match(mockListingsSource, /mode: "build"/);
  assert.match(mockListingsSource, /homeCommunities/);
  assert.match(classifiedsFunctionsSource, /communityListings/);
  assert.match(classifiedsFunctionsSource, /communityFloorplans/);
  assert.match(detailSource, /Part of the \{details\.community\.name\} community/);
  assert.match(detailSource, /More Homes in This Community/);
  assert.match(detailSource, /Floorplans in This Community/);
  assert.match(detailSource, /calculatorVariant="mortgage"/);
});

test("all categories routes to its own general classifieds landing page", () => {
  assert.match(headerSource, /search=\{\{ allCategories: true \}\}/);
  assert.match(allCategoriesSource, /Browse Categories/);
  assert.match(browseSource, /function ClassifiedsLandingHero/);
  assert.match(browseSource, /function GeneralClassifiedShowcase/);
  for (const category of [
    "Furniture",
    "Electronics",
    "Tools & Equipment",
    "Outdoor & Sporting",
    "Farm & Garden",
    "General",
  ]) {
    assert.match(browseSource, new RegExp(category.replace(/[&]/g, "\\&")));
  }
  assert.match(browseSource, /Top listings/);
  assert.match(browseSource, /Newest listings/);
  assert.match(browseSource, /classifiedShowcaseRows/);
  assert.match(browseSource, /Holiday & seasonal finds/);
  assert.match(browseSource, /Clothing & accessories/);
  assert.match(browseSource, /Recently discounted/);
  for (const row of [
    "Furniture & home refresh",
    "Electronics & gaming",
    "Outdoor & recreation",
    "Tools & shop equipment",
    "Farm & garden finds",
  ]) {
    assert.match(browseSource, new RegExp(row));
  }
});

test("advertising page explains local partner opportunities and links to contact", () => {
  assert.match(advertiseSource, /createFileRoute\("\/advertise"\)/);
  assert.match(advertiseSource, /Start a conversation/);
  assert.match(advertiseSource, /Featured placements/);
  assert.match(advertiseSource, /sample CSV, XML, or JSON feed/);
  assert.match(advertiseSource, /Do you have a fixed advertising rate card/);
  assert.match(advertiseSource, /to="\/contact"/);
  assert.match(footerSource, /to="\/advertise"/);
  assert.match(footerSource, /Advertise with us/);
});

test("safety center explains scams, protections, and GemList limits", () => {
  assert.match(safetySource, /createFileRoute\("\/safety"\)/);
  assert.match(safetySource, /Common marketplace scams and what to do instead/);
  assert.match(safetySource, /Overpayment or refund tricks/);
  assert.match(safetySource, /What we do not do/);
  assert.match(safetySource, /does not inspect, authenticate, or guarantee/);
  assert.match(safetySource, /do not provide escrow or hold funds/);
  assert.match(safetySource, /Stop, save, report/);
  assert.match(safetySource, /Flag This Listing/);
  assert.match(safetySource, /to="\/contact"/);
  assert.match(footerSource, /to="\/safety"/);
  assert.match(footerSource, /Safety center/);
});
