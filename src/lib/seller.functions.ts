/* eslint-disable @typescript-eslint/no-explicit-any -- the generated Supabase client types lag the applied seller migration until the next linked type generation */
import { createServerFn } from "@tanstack/react-start";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { sellerShippingMethods } from "@/config/shipping";
import { publicServerClient } from "./supabase-public.server";
import {
  connectedAccountMatchesCurrentMode,
  createParkVaultConnectedAccount,
  createParkVaultOnboardingLink,
  getParkVaultConnectedAccount,
  isUnusableConnectedAccountError,
  stripeAccountMatchesCurrentMode,
  stripeConnectConfigured,
  stripeConnectMode,
} from "./stripe-connect.server";

const SELLER_TERMS_VERSION = "seller-v1";
const listingConditions = [
  "new_with_tags",
  "new_without_tags",
  "used_excellent",
  "used_good",
] as const;

export type SellerSetup = {
  exists: boolean;
  isAdmin: boolean;
  displayName: string;
  avatarUrl: string;
  slug: string;
  bio: string;
  status: string;
  shipFromName: string;
  shipFromPhone: string;
  shipFromLine1: string;
  shipFromLine2: string;
  shipFromCity: string;
  shipFromRegion: string;
  shipFromPostalCode: string;
  shipFromCountry: string;
  defaultShippingMethod: string;
  defaultHandlingDays: number | null;
  termsAccepted: boolean;
  payoutProviderConfigured: boolean;
  stripeDetailsSubmitted: boolean;
  stripeChargesEnabled: boolean;
  stripePayoutsEnabled: boolean;
  stripeAccountModeCurrent: boolean;
};

export type PublicListing = {
  id: string;
  productId: string;
  variantId: string;
  productSlug?: string;
  productName?: string;
  variantLabel?: string;
  priceCents: number;
  currency: string;
  condition: string;
  note: string | null;
  sellerSlug: string;
  sellerDisplayName: string;
  payoutVerified: boolean;
  sellerRating: number | null;
  imageUrls: string[];
  createdAt: string;
  shipFromCity: string;
  shipFromRegion: string;
  shipFromCountry: string;
  shippingMethod: string;
  handlingTimeDays: number | null;
};

export type PublicSeller = {
  slug: string;
  displayName: string;
  avatarUrl: string | null;
  bio: string | null;
  memberSince: string;
  payoutVerified: boolean;
  completedSalesCount: number;
  reviewCount: number;
  ratingAverage: number | null;
  activeListingCount: number;
  listings: PublicListing[];
  reviews: SellerReview[];
};

export type SellerReview = {
  id: string;
  rating: number;
  comment: string | null;
  createdAt: string;
};

export type SellerDashboardSummary = {
  pendingPayoutCents: number;
  paidOutCents: number;
  failedPayoutCents: number;
  completedSalesCount: number;
  ratingAverage: number | null;
  reviews: SellerReview[];
};

export type MissingListingRequest = {
  id: string;
  suggestionId: string;
  productName: string;
  priceCents: number;
  condition: string;
  requestStatus: string;
  suggestionStatus: string;
  createdAt: string;
};

function cleanSlug(value: string) {
  return value.trim().toLowerCase().replace(/\s+/g, "-");
}

function requireText(value: unknown, label: string, max = 100) {
  const clean = String(value ?? "").trim();
  if (!clean || clean.length > max) throw new Error(`Enter a valid ${label}.`);
  return clean;
}

async function signedListingUrls(paths: string[]): Promise<string[]> {
  if (paths.length === 0) return [];
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data, error } = await supabaseAdmin.storage
    .from("listing-media")
    .createSignedUrls(paths, 60 * 60);
  if (error) return [];
  return (data ?? [])
    .map((item) => item.signedUrl)
    .filter((url): url is string => typeof url === "string" && url.length > 0);
}

function variantLabel(
  value: { size?: string | null; color?: string | null; edition?: string | null } | null,
) {
  const parts = [value?.size, value?.color, value?.edition].filter(Boolean);
  return parts.length > 0 ? parts.join(" · ") : "One variation";
}

export const getSellerSetup = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<SellerSetup> => {
    const client = context.supabase as any;
    const [{ data, error }, { data: member }, { data: isAdmin }] = await Promise.all([
      client
        .from("seller_profiles")
        .select(
          "slug,bio,status,ship_from_name,ship_from_phone,ship_from_line1,ship_from_line2,ship_from_city,ship_from_region,ship_from_postal_code,ship_from_country,default_shipping_method,default_handling_days,terms_version,terms_accepted_at,stripe_account_id,stripe_account_mode,stripe_details_submitted,stripe_charges_enabled,stripe_payouts_enabled",
        )
        .eq("user_id", context.userId)
        .maybeSingle(),
      client
        .from("profiles")
        .select("display_name,avatar_url")
        .eq("id", context.userId)
        .maybeSingle(),
      client.rpc("has_role", { _user_id: context.userId, _role: "admin" }),
    ]);
    if (error) throw new Error(error.message);
    const stripeAccountModeCurrent = Boolean(
      data?.stripe_account_id && stripeAccountMatchesCurrentMode(data?.stripe_account_mode),
    );
    return {
      exists: Boolean(data),
      isAdmin: isAdmin === true,
      displayName: member?.display_name ?? "",
      avatarUrl: member?.avatar_url ?? "",
      slug: data?.slug ?? "",
      bio: data?.bio ?? "",
      status: data?.status ?? "draft",
      shipFromName: data?.ship_from_name ?? "",
      shipFromPhone: data?.ship_from_phone ?? "",
      shipFromLine1: data?.ship_from_line1 ?? "",
      shipFromLine2: data?.ship_from_line2 ?? "",
      shipFromCity: data?.ship_from_city ?? "",
      shipFromRegion: data?.ship_from_region ?? "",
      shipFromPostalCode: data?.ship_from_postal_code ?? "",
      shipFromCountry: data?.ship_from_country ?? "US",
      defaultShippingMethod: data?.default_shipping_method ?? "",
      defaultHandlingDays:
        data?.default_handling_days == null ? null : Number(data.default_handling_days),
      termsAccepted:
        data?.terms_version === SELLER_TERMS_VERSION && Boolean(data?.terms_accepted_at),
      payoutProviderConfigured: stripeConnectConfigured(),
      stripeDetailsSubmitted: stripeAccountModeCurrent && data?.stripe_details_submitted === true,
      stripeChargesEnabled: stripeAccountModeCurrent && data?.stripe_charges_enabled === true,
      stripePayoutsEnabled: stripeAccountModeCurrent && data?.stripe_payouts_enabled === true,
      stripeAccountModeCurrent,
    };
  });

export const submitMissingProductListing = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (input: {
      name: string;
      brandText?: string | null;
      collectionText?: string | null;
      categoryId?: string | null;
      resortCodes: string[];
      releaseNotes?: string | null;
      proposedVariations?: string | null;
      priceCents: number;
      itemCondition: string;
      sellerNote?: string | null;
      parcelLengthIn?: number | null;
      parcelWidthIn?: number | null;
      parcelHeightIn?: number | null;
      parcelWeightLb?: number | null;
      evidencePaths: string[];
      publicMediaPaths: string[];
    }) => {
      const name = String(input.name ?? "").trim();
      if (name.length < 3 || name.length > 160) {
        throw new Error("Give the product a name between 3 and 160 characters.");
      }
      const resortCodes = (input.resortCodes ?? [])
        .map((code) => String(code).trim().toUpperCase())
        .filter(Boolean);
      if (resortCodes.length === 0) throw new Error("Choose at least one park resort.");
      const priceCents = Math.round(Number(input.priceCents));
      if (!Number.isFinite(priceCents) || priceCents < 100 || priceCents > 5_000_000) {
        throw new Error("Enter a listing price between $1 and $50,000.");
      }
      if (!listingConditions.includes(input.itemCondition as (typeof listingConditions)[number])) {
        throw new Error("Choose the item condition.");
      }
      const evidencePaths = (input.evidencePaths ?? []).filter(Boolean).slice(0, 8);
      const publicMediaPaths = (input.publicMediaPaths ?? []).filter(Boolean).slice(0, 8);
      if (!evidencePaths.length || !publicMediaPaths.length) {
        throw new Error("Add at least one exact-item photo.");
      }
      const sellerNote = String(input.sellerNote ?? "").trim();
      if (sellerNote.length > 500) throw new Error("Seller notes must be 500 characters or fewer.");
      const positive = (value: number | null | undefined) => {
        if (value == null) return null;
        const number = Number(value);
        return Number.isFinite(number) && number > 0 ? number : null;
      };
      return {
        name,
        brandText:
          String(input.brandText ?? "")
            .trim()
            .slice(0, 120) || null,
        collectionText:
          String(input.collectionText ?? "")
            .trim()
            .slice(0, 120) || null,
        categoryId: String(input.categoryId ?? "").trim() || null,
        resortCodes,
        releaseNotes:
          String(input.releaseNotes ?? "")
            .trim()
            .slice(0, 600) || null,
        proposedVariations:
          String(input.proposedVariations ?? "")
            .trim()
            .slice(0, 600) || null,
        priceCents,
        itemCondition: input.itemCondition as (typeof listingConditions)[number],
        sellerNote: sellerNote || null,
        parcelLengthIn: positive(input.parcelLengthIn),
        parcelWidthIn: positive(input.parcelWidthIn),
        parcelHeightIn: positive(input.parcelHeightIn),
        parcelWeightLb: positive(input.parcelWeightLb),
        evidencePaths,
        publicMediaPaths,
      };
    },
  )
  .handler(async ({ data, context }) => {
    const client = context.supabase as any;
    const { data: suggestionId, error } = await client.rpc("submit_missing_product_listing", {
      _name: data.name,
      _brand_text: data.brandText,
      _collection_text: data.collectionText,
      _category_id: data.categoryId,
      _resort_codes: data.resortCodes,
      _release_notes: data.releaseNotes,
      _proposed_variations: data.proposedVariations,
      _price_cents: data.priceCents,
      _item_condition: data.itemCondition,
      _seller_note: data.sellerNote,
      _parcel_length_in: data.parcelLengthIn,
      _parcel_width_in: data.parcelWidthIn,
      _parcel_height_in: data.parcelHeightIn,
      _parcel_weight_lb: data.parcelWeightLb,
      _evidence_paths: data.evidencePaths,
      _public_media_paths: data.publicMediaPaths,
    });
    if (error) throw new Error(error.message);
    return { suggestionId: suggestionId as string };
  });

export const getMyMissingListingRequests = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<MissingListingRequest[]> => {
    const client = context.supabase as any;
    const { data, error } = await client
      .from("seller_listing_requests")
      .select(
        "id,suggestion_id,price_cents,item_condition,status,created_at,product_suggestions(name,status)",
      )
      .eq("seller_id", context.userId)
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return (data ?? []).map((row: any) => ({
      id: row.id,
      suggestionId: row.suggestion_id,
      productName: row.product_suggestions?.name ?? "Requested product",
      priceCents: Number(row.price_cents),
      condition: row.item_condition,
      requestStatus: row.status,
      suggestionStatus: row.product_suggestions?.status ?? "submitted",
      createdAt: row.created_at,
    }));
  });

export const saveSellerSetup = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (input: {
      slug: string;
      bio: string;
      shipFromName: string;
      shipFromPhone: string;
      shipFromLine1: string;
      shipFromLine2?: string;
      shipFromCity: string;
      shipFromRegion: string;
      shipFromPostalCode: string;
      shipFromCountry?: string;
      defaultShippingMethod: string;
      defaultHandlingDays: number;
      acceptTerms: boolean;
      displayName: string;
      avatarUrl?: string;
    }) => {
      const slug = cleanSlug(input.slug);
      if (!/^[a-z0-9][a-z0-9-]{2,29}$/.test(slug)) {
        throw new Error("Seller handle must be 3–30 lowercase letters, numbers or hyphens.");
      }
      const bio = String(input.bio ?? "").trim();
      if (bio.length > 280) throw new Error("Bio must be 280 characters or fewer.");
      const displayName = requireText(input.displayName, "seller display name", 80);
      const avatarUrl = String(input.avatarUrl ?? "").trim();
      if (avatarUrl && !avatarUrl.includes("/storage/v1/object/public/seller-avatars/")) {
        throw new Error("Upload the seller photo through ParkVault.");
      }
      if (!input.acceptTerms) throw new Error("Accept the seller and photo-display terms.");
      const defaultShippingMethod = String(input.defaultShippingMethod ?? "");
      if (!sellerShippingMethods.some((method) => method.value === defaultShippingMethod)) {
        throw new Error("Choose a default shipping method.");
      }
      const defaultHandlingDays = Math.round(Number(input.defaultHandlingDays));
      if (
        !Number.isFinite(defaultHandlingDays) ||
        defaultHandlingDays < 1 ||
        defaultHandlingDays > 5
      ) {
        throw new Error("Choose a handling time between 1 and 5 business days.");
      }
      return {
        slug,
        bio,
        displayName,
        avatarUrl,
        shipFromName: requireText(input.shipFromName, "ship-from name", 100),
        shipFromPhone: requireText(input.shipFromPhone, "phone number", 30),
        shipFromLine1: requireText(input.shipFromLine1, "street address", 120),
        shipFromLine2: String(input.shipFromLine2 ?? "")
          .trim()
          .slice(0, 120),
        shipFromCity: requireText(input.shipFromCity, "city", 80),
        shipFromRegion: requireText(input.shipFromRegion, "state", 40),
        shipFromPostalCode: requireText(input.shipFromPostalCode, "ZIP code", 20),
        shipFromCountry: String(input.shipFromCountry ?? "US")
          .trim()
          .toUpperCase()
          .slice(0, 2),
        defaultShippingMethod,
        defaultHandlingDays,
        acceptTerms: true,
      };
    },
  )
  .handler(async ({ data, context }) => {
    const client = context.supabase as any;
    const { error } = await client.rpc("save_seller_profile", {
      _slug: data.slug,
      _bio: data.bio,
      _ship_from_name: data.shipFromName,
      _ship_from_phone: data.shipFromPhone,
      _ship_from_line1: data.shipFromLine1,
      _ship_from_line2: data.shipFromLine2,
      _ship_from_city: data.shipFromCity,
      _ship_from_region: data.shipFromRegion,
      _ship_from_postal_code: data.shipFromPostalCode,
      _ship_from_country: data.shipFromCountry,
      _default_shipping_method: data.defaultShippingMethod,
      _default_handling_days: data.defaultHandlingDays,
      _accept_terms: true,
    });
    if (error) throw new Error(error.message);
    const memberUpdate = await client
      .from("profiles")
      .update({ display_name: data.displayName, avatar_url: data.avatarUrl || null })
      .eq("id", context.userId);
    if (memberUpdate.error) throw new Error(memberUpdate.error.message);
    return { ok: true as const, slug: data.slug };
  });

export const getSellerDashboardSummary = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<SellerDashboardSummary> => {
    const client = context.supabase as any;
    const [
      { data: payouts, error: payoutError },
      { data: reviews, error: reviewError },
      { count },
    ] = await Promise.all([
      client.from("order_payouts").select("amount_cents,status").eq("payee_id", context.userId),
      client
        .from("order_reviews")
        .select("id,rating,comment,created_at")
        .eq("subject_id", context.userId)
        .order("created_at", { ascending: false })
        .limit(20),
      client
        .from("orders")
        .select("id", { count: "exact", head: true })
        .eq("seller_id", context.userId)
        .eq("status", "completed"),
    ]);
    if (payoutError) throw new Error(payoutError.message);
    if (reviewError) throw new Error(reviewError.message);
    const rows = payouts ?? [];
    const reviewRows = (reviews ?? []).map((row: any) => ({
      id: row.id,
      rating: Number(row.rating),
      comment: row.comment,
      createdAt: row.created_at,
    }));
    const ratingAverage = reviewRows.length
      ? reviewRows.reduce((sum: number, row: SellerReview) => sum + row.rating, 0) /
        reviewRows.length
      : null;
    return {
      pendingPayoutCents: rows
        .filter((row: any) => row.status === "pending" || row.status === "processing")
        .reduce((sum: number, row: any) => sum + Number(row.amount_cents), 0),
      paidOutCents: rows
        .filter((row: any) => row.status === "completed")
        .reduce((sum: number, row: any) => sum + Number(row.amount_cents), 0),
      failedPayoutCents: rows
        .filter((row: any) => row.status === "failed" || row.status === "reversed")
        .reduce((sum: number, row: any) => sum + Number(row.amount_cents), 0),
      completedSalesCount: Number(count ?? 0),
      ratingAverage,
      reviews: reviewRows,
    };
  });

export const startStripeSellerOnboarding = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<{ url: string }> => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const admin = supabaseAdmin as any;
    const [{ data: profile, error }, { data: shopperProfile, error: shopperError }] =
      await Promise.all([
        admin
          .from("seller_profiles")
          .select("stripe_account_id,stripe_account_mode,status")
          .eq("user_id", context.userId)
          .maybeSingle(),
        admin
          .from("shopper_service_profiles")
          .select("stripe_account_id,stripe_account_mode")
          .eq("shopper_id", context.userId)
          .maybeSingle(),
      ]);
    if (error) throw new Error(error.message);
    if (shopperError) throw new Error(shopperError.message);
    if (!profile || profile.status !== "active") throw new Error("Complete seller setup first.");

    const currentMode = stripeConnectMode();
    const candidates = [profile, shopperProfile].filter(Boolean) as Array<{
      stripe_account_id: string | null;
      stripe_account_mode: string | null;
    }>;
    const candidate =
      candidates.find(
        (item) => item.stripe_account_id && item.stripe_account_mode === currentMode,
      ) ?? candidates.find((item) => item.stripe_account_id && !item.stripe_account_mode);
    let accountId = candidate?.stripe_account_id ?? null;
    let account: Awaited<ReturnType<typeof getParkVaultConnectedAccount>> | null = null;
    if (accountId) {
      try {
        account = await getParkVaultConnectedAccount(accountId);
        if (!connectedAccountMatchesCurrentMode(account)) {
          accountId = null;
          account = null;
        }
      } catch (connectError) {
        if (!isUnusableConnectedAccountError(connectError)) throw connectError;
        accountId = null;
      }
    }
    if (!accountId) {
      const email = String((context.claims as { email?: string } | null)?.email ?? "");
      const created = await createParkVaultConnectedAccount({
        email,
        userId: context.userId,
        role: "seller",
        productDescription: "Resale of authentic theme-park merchandise",
      });
      accountId = created.id;
      account = await getParkVaultConnectedAccount(accountId);
    }

    if (!account) account = await getParkVaultConnectedAccount(accountId);
    const status = {
      stripe_account_id: accountId,
      stripe_account_mode: currentMode,
      stripe_details_submitted: account.details_submitted,
      stripe_charges_enabled: account.charges_enabled,
      stripe_payouts_enabled: account.payouts_enabled,
      stripe_status_checked_at: new Date().toISOString(),
    };
    const updates = [admin.from("seller_profiles").update(status).eq("user_id", context.userId)];
    if (shopperProfile) {
      updates.push(
        admin.from("shopper_service_profiles").update(status).eq("shopper_id", context.userId),
      );
    }
    const saved = await Promise.all(updates);
    const saveError = saved.find((result) => result.error)?.error;
    if (saveError) throw new Error(saveError.message);

    const link = await createParkVaultOnboardingLink({
      accountId,
      returnPath: "/seller-setup",
    });
    return { url: link.url };
  });

export const refreshStripeSellerStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const admin = supabaseAdmin as any;
    const { data: profile } = await admin
      .from("seller_profiles")
      .select("stripe_account_id,stripe_account_mode")
      .eq("user_id", context.userId)
      .maybeSingle();
    if (!profile?.stripe_account_id) return { configured: false as const };
    const currentMode = stripeConnectMode();
    const reset = {
      stripe_account_id: null,
      stripe_account_mode: null,
      stripe_details_submitted: false,
      stripe_charges_enabled: false,
      stripe_payouts_enabled: false,
      stripe_status_checked_at: new Date().toISOString(),
    };
    const clearStaleAccount = async () => {
      const updates = await Promise.all([
        admin.from("seller_profiles").update(reset).eq("user_id", context.userId),
        admin.from("shopper_service_profiles").update(reset).eq("shopper_id", context.userId),
      ]);
      const error = updates.find((result) => result.error)?.error;
      if (error) throw new Error(error.message);
      return {
        configured: false as const,
        reconnectRequired: true as const,
        detailsSubmitted: false,
        chargesEnabled: false,
        payoutsEnabled: false,
      };
    };
    if (currentMode && profile.stripe_account_mode !== currentMode) {
      return clearStaleAccount();
    }
    let account: Awaited<ReturnType<typeof getParkVaultConnectedAccount>>;
    try {
      account = await getParkVaultConnectedAccount(profile.stripe_account_id);
    } catch (connectError) {
      if (!isUnusableConnectedAccountError(connectError)) throw connectError;
      return clearStaleAccount();
    }
    if (!connectedAccountMatchesCurrentMode(account)) return clearStaleAccount();
    const status = {
      stripe_account_id: profile.stripe_account_id,
      stripe_account_mode: currentMode,
      stripe_details_submitted: account.details_submitted,
      stripe_charges_enabled: account.charges_enabled,
      stripe_payouts_enabled: account.payouts_enabled,
      stripe_status_checked_at: new Date().toISOString(),
    };
    const updates = await Promise.all([
      admin.from("seller_profiles").update(status).eq("user_id", context.userId),
      admin.from("shopper_service_profiles").update(status).eq("shopper_id", context.userId),
    ]);
    const error = updates.find((result) => result.error)?.error;
    if (error) throw new Error(error.message);
    return {
      configured: true as const,
      detailsSubmitted: account.details_submitted,
      chargesEnabled: account.charges_enabled,
      payoutsEnabled: account.payouts_enabled,
    };
  });

async function shapePublicListings(rows: any[]): Promise<PublicListing[]> {
  return Promise.all(
    rows.map(async (row) => ({
      id: row.id,
      productId: row.product_id,
      variantId: row.variant_id,
      priceCents: Number(row.price_cents),
      currency: row.currency,
      condition: row.item_condition,
      note: row.seller_note,
      sellerSlug: row.seller_slug,
      sellerDisplayName: row.seller_display_name,
      payoutVerified: row.payout_verified === true,
      sellerRating: row.seller_rating == null ? null : Number(row.seller_rating),
      imageUrls: await signedListingUrls((row.media_paths ?? []) as string[]),
      createdAt: row.created_at,
      shipFromCity: row.ship_from_city ?? "",
      shipFromRegion: row.ship_from_region ?? "",
      shipFromCountry: row.ship_from_country ?? "US",
      shippingMethod: row.default_shipping_method ?? "",
      handlingTimeDays: row.ship_by_days == null ? null : Number(row.ship_by_days),
    })),
  );
}

export const getActiveListingsForVariant = createServerFn({ method: "GET" })
  .inputValidator((input: { variantId: string }) => ({ variantId: String(input.variantId) }))
  .handler(async ({ data }): Promise<PublicListing[]> => {
    const client = publicServerClient() as any;
    const { data: rows, error } = await client
      .from("active_seller_listings")
      .select("*")
      .eq("variant_id", data.variantId)
      .order("price_cents", { ascending: true })
      .limit(24);
    if (error) return [];
    return shapePublicListings(rows ?? []);
  });

export const getPublicSeller = createServerFn({ method: "GET" })
  .inputValidator((input: { slug: string }) => ({ slug: cleanSlug(input.slug) }))
  .handler(async ({ data }): Promise<PublicSeller | null> => {
    const client = publicServerClient() as any;
    const { data: seller, error } = await client
      .from("seller_storefronts")
      .select("*")
      .eq("slug", data.slug)
      .maybeSingle();
    if (error || !seller) return null;
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const admin = supabaseAdmin as any;
    const [{ data: askRows }, { data: reviewRows }] = await Promise.all([
      admin
        .from("asks")
        .select(
          "id,product_id,variant_id,price_cents,currency,item_condition,seller_note,created_at,ship_by_days,products(slug,name),product_variants(size,color,edition),listing_media(storage_path,position)",
        )
        .eq("seller_id", seller.user_id)
        .eq("status", "active")
        .not("approved_at", "is", null)
        .eq("is_demo", false)
        .gt("expires_at", new Date().toISOString())
        .gt("evidence_count", 0)
        .gt("public_media_count", 0)
        .order("created_at", { ascending: false }),
      client
        .from("order_reviews")
        .select("id,rating,comment,created_at")
        .eq("subject_id", seller.user_id)
        .order("created_at", { ascending: false })
        .limit(20),
    ]);
    const listings: PublicListing[] = await Promise.all(
      (askRows ?? []).map(async (row: any) => ({
        id: row.id,
        productId: row.product_id,
        variantId: row.variant_id,
        productSlug: row.products?.slug ?? "",
        productName: row.products?.name ?? "Unknown product",
        variantLabel: variantLabel(row.product_variants),
        priceCents: Number(row.price_cents),
        currency: row.currency,
        condition: row.item_condition,
        note: row.seller_note,
        sellerSlug: seller.slug,
        sellerDisplayName: seller.display_name ?? seller.slug,
        payoutVerified: seller.payout_verified === true,
        sellerRating: seller.rating_average == null ? null : Number(seller.rating_average),
        imageUrls: await signedListingUrls(
          [...(row.listing_media ?? [])]
            .sort((a: any, b: any) => a.position - b.position)
            .map((item: any) => item.storage_path),
        ),
        createdAt: row.created_at,
        shipFromCity: seller.ship_from_city ?? "",
        shipFromRegion: seller.ship_from_region ?? "",
        shipFromCountry: seller.ship_from_country ?? "US",
        shippingMethod: seller.default_shipping_method ?? "",
        handlingTimeDays: row.ship_by_days == null ? null : Number(row.ship_by_days),
      })),
    );
    return {
      slug: seller.slug,
      displayName: seller.display_name ?? seller.slug,
      avatarUrl: seller.avatar_url,
      bio: seller.bio,
      memberSince: seller.member_since,
      payoutVerified: seller.payout_verified === true,
      completedSalesCount: Number(seller.completed_sales_count ?? 0),
      reviewCount: Number(seller.review_count ?? 0),
      ratingAverage: seller.rating_average == null ? null : Number(seller.rating_average),
      activeListingCount: Number(seller.active_listing_count ?? 0),
      listings,
      reviews: (reviewRows ?? []).map((row: any) => ({
        id: row.id,
        rating: Number(row.rating),
        comment: row.comment,
        createdAt: row.created_at,
      })),
    };
  });

export type ListingEditor = {
  id: string;
  productSlug: string;
  productName: string;
  variantLabel: string;
  status: string;
  approvedAt: string | null;
  priceCents: number;
  condition: string;
  note: string;
  parcelLengthIn: string;
  parcelWidthIn: string;
  parcelHeightIn: string;
  parcelWeightLb: string;
  imageUrls: string[];
};

export const getListingEditor = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { listingId: string }) => ({ listingId: String(input.listingId) }))
  .handler(async ({ data, context }): Promise<ListingEditor | null> => {
    const client = context.supabase as any;
    const { data: row, error } = await client
      .from("asks")
      .select(
        "id,status,approved_at,price_cents,item_condition,seller_note,parcel_length_in,parcel_width_in,parcel_height_in,parcel_weight_lb,products(slug,name),product_variants(size,color,edition),listing_media(storage_path,position)",
      )
      .eq("id", data.listingId)
      .eq("seller_id", context.userId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!row) return null;
    const paths = [...(row.listing_media ?? [])]
      .sort((a: any, b: any) => a.position - b.position)
      .map((item: any) => item.storage_path);
    return {
      id: row.id,
      productSlug: row.products?.slug ?? "",
      productName: row.products?.name ?? "Unknown product",
      variantLabel: variantLabel(row.product_variants),
      status: row.status,
      approvedAt: row.approved_at ?? null,
      priceCents: Number(row.price_cents),
      condition: row.item_condition,
      note: row.seller_note ?? "",
      parcelLengthIn: row.parcel_length_in == null ? "" : String(row.parcel_length_in),
      parcelWidthIn: row.parcel_width_in == null ? "" : String(row.parcel_width_in),
      parcelHeightIn: row.parcel_height_in == null ? "" : String(row.parcel_height_in),
      parcelWeightLb: row.parcel_weight_lb == null ? "" : String(row.parcel_weight_lb),
      imageUrls: await signedListingUrls(paths),
    };
  });

function optionalPositive(value: unknown) {
  if (value === "" || value == null) return null;
  const number = Number(value);
  if (!Number.isFinite(number) || number <= 0 || number > 500)
    throw new Error("Enter valid package measurements.");
  return number;
}

export const updateSellerListing = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (input: {
      listingId: string;
      priceCents: number;
      condition: string;
      note: string;
      parcelLengthIn?: number | string | null;
      parcelWidthIn?: number | string | null;
      parcelHeightIn?: number | string | null;
      parcelWeightLb?: number | string | null;
      publicMediaPaths?: string[];
    }) => {
      const priceCents = Math.round(Number(input.priceCents));
      if (!Number.isFinite(priceCents) || priceCents < 100 || priceCents > 5_000_000)
        throw new Error("Enter a valid listing price.");
      const condition = String(input.condition);
      if (!["new_with_tags", "new_without_tags", "used_excellent", "used_good"].includes(condition))
        throw new Error("Choose the condition.");
      const note = String(input.note ?? "").trim();
      if (note.length > 500) throw new Error("Seller note is too long.");
      return {
        listingId: String(input.listingId),
        priceCents,
        condition,
        note,
        parcelLengthIn: optionalPositive(input.parcelLengthIn),
        parcelWidthIn: optionalPositive(input.parcelWidthIn),
        parcelHeightIn: optionalPositive(input.parcelHeightIn),
        parcelWeightLb: optionalPositive(input.parcelWeightLb),
        publicMediaPaths: (input.publicMediaPaths ?? []).slice(0, 8),
      };
    },
  )
  .handler(async ({ data, context }) => {
    const client = context.supabase as any;
    const { error } = await client.rpc("update_ask", {
      _ask_id: data.listingId,
      _price_cents: data.priceCents,
      _item_condition: data.condition,
      _seller_note: data.note,
      _parcel_length_in: data.parcelLengthIn,
      _parcel_width_in: data.parcelWidthIn,
      _parcel_height_in: data.parcelHeightIn,
      _parcel_weight_lb: data.parcelWeightLb,
    });
    if (error) throw new Error(error.message);
    if (data.publicMediaPaths.length > 0) {
      const replaced = await client.rpc("replace_listing_media", {
        _ask_id: data.listingId,
        _paths: data.publicMediaPaths,
      });
      if (replaced.error) throw new Error(replaced.error.message);
    }
    return { ok: true as const };
  });

export const relistSellerListing = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { listingId: string }) => ({ listingId: String(input.listingId) }))
  .handler(async ({ data, context }) => {
    const client = context.supabase as any;
    const { error } = await client.rpc("relist_ask", { _ask_id: data.listingId });
    if (error) throw new Error(error.message);
    return { ok: true as const };
  });

export type ShippingRate = {
  id: string;
  carrier: string;
  service: string;
  amountCents: number;
  currency: string;
  estimatedDays: number | null;
};

function shippoToken() {
  return process.env["SHIPPO_API_TOKEN"] ?? "";
}

async function shippoRequest<T>(path: string, body: unknown): Promise<T> {
  const token = shippoToken();
  if (!token) throw new Error("Prepaid labels are not configured on this deployment yet.");
  const response = await fetch(`https://api.goshippo.com${path}`, {
    method: "POST",
    headers: {
      Authorization: `ShippoToken ${token}`,
      "Content-Type": "application/json",
      "SHIPPO-API-VERSION": "2018-02-08",
    },
    body: JSON.stringify(body),
  });
  const payload = (await response.json()) as T & {
    detail?: string;
    messages?: { text?: string }[];
  };
  if (!response.ok)
    throw new Error(
      payload.detail ?? payload.messages?.[0]?.text ?? "Shipping provider request failed.",
    );
  return payload;
}

export const getShippingRates = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (input: {
      orderId: string;
      lengthIn: number;
      widthIn: number;
      heightIn: number;
      weightLb: number;
    }) => ({
      orderId: String(input.orderId),
      lengthIn: optionalPositive(input.lengthIn)!,
      widthIn: optionalPositive(input.widthIn)!,
      heightIn: optionalPositive(input.heightIn)!,
      weightLb: optionalPositive(input.weightLb)!,
    }),
  )
  .handler(async ({ data, context }): Promise<{ quoteId: string; rates: ShippingRate[] }> => {
    const client = context.supabase as any;
    const [{ data: order }, { data: from }, { data: to }, { data: captured }] = await Promise.all([
      client
        .from("orders")
        .select("id,order_number,seller_id")
        .eq("id", data.orderId)
        .maybeSingle(),
      client
        .from("seller_profiles")
        .select(
          "ship_from_name,ship_from_phone,ship_from_line1,ship_from_line2,ship_from_city,ship_from_region,ship_from_postal_code,ship_from_country",
        )
        .eq("user_id", context.userId)
        .maybeSingle(),
      client
        .from("order_addresses")
        .select("recipient_name,line1,line2,city,region,postal_code,country")
        .eq("order_id", data.orderId)
        .maybeSingle(),
      client.rpc("order_payment_captured", { _order_id: data.orderId }),
    ]);
    if (!order || order.seller_id !== context.userId)
      throw new Error("Only the seller can create a label.");
    if (captured !== true) throw new Error("Payment must be captured before buying a label.");
    if (!from || !to) throw new Error("The ship-from or buyer address is not ready.");

    const shipment = await shippoRequest<any>("/shipments", {
      address_from: {
        name: from.ship_from_name,
        phone: from.ship_from_phone,
        street1: from.ship_from_line1,
        street2: from.ship_from_line2 || undefined,
        city: from.ship_from_city,
        state: from.ship_from_region,
        zip: from.ship_from_postal_code,
        country: from.ship_from_country,
      },
      address_to: {
        name: to.recipient_name,
        street1: to.line1,
        street2: to.line2 || undefined,
        city: to.city,
        state: to.region,
        zip: to.postal_code,
        country: to.country,
      },
      parcels: [
        {
          length: String(data.lengthIn),
          width: String(data.widthIn),
          height: String(data.heightIn),
          distance_unit: "in",
          weight: String(data.weightLb),
          mass_unit: "lb",
        },
      ],
      metadata: `ParkVault ${order.order_number}`,
      async: false,
    });
    const rates: ShippingRate[] = (shipment.rates ?? [])
      .filter((rate: any) => rate.object_id && rate.amount)
      .map((rate: any) => ({
        id: rate.object_id,
        carrier: rate.provider ?? "Carrier",
        service: rate.servicelevel?.name ?? rate.servicelevel?.token ?? "Shipping service",
        amountCents: Math.round(Number(rate.amount) * 100),
        currency: rate.currency ?? "USD",
        estimatedDays: rate.estimated_days == null ? null : Number(rate.estimated_days),
      }))
      .sort((a: ShippingRate, b: ShippingRate) => a.amountCents - b.amountCents)
      .slice(0, 12);
    if (rates.length === 0) throw new Error("No shipping rates were returned for this package.");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const admin = supabaseAdmin as any;
    const saved = await admin
      .from("shipping_quotes")
      .insert({
        order_id: data.orderId,
        seller_id: context.userId,
        provider: "shippo",
        provider_shipment_id: shipment.object_id,
        rates,
      })
      .select("id")
      .single();
    if (saved.error) throw new Error(saved.error.message);
    return { quoteId: saved.data.id, rates };
  });

export const purchaseShippingLabel = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { quoteId: string; rateId: string }) => ({
    quoteId: String(input.quoteId),
    rateId: String(input.rateId),
  }))
  .handler(async ({ data, context }) => {
    const client = context.supabase as any;
    const { data: quote, error } = await client
      .from("shipping_quotes")
      .select("id,order_id,seller_id,rates,expires_at")
      .eq("id", data.quoteId)
      .eq("seller_id", context.userId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!quote || new Date(quote.expires_at).getTime() <= Date.now())
      throw new Error("That rate quote expired. Get new rates.");
    const rate = (quote.rates as ShippingRate[]).find((item) => item.id === data.rateId);
    if (!rate) throw new Error("Choose a rate from the current quote.");

    const reserved = await client.rpc("reserve_shipping_label_purchase", {
      _quote_id: quote.id,
      _rate_id: rate.id,
      _rate_cents: rate.amountCents,
    });
    if (reserved.error) throw new Error(reserved.error.message);
    const reservation = reserved.data as {
      state?: "reserved" | "pending" | "existing";
      labelUrl?: string;
      trackingNumber?: string;
    } | null;
    if (reservation?.state === "existing") {
      return {
        labelUrl: String(reservation.labelUrl ?? ""),
        trackingNumber: String(reservation.trackingNumber ?? ""),
      };
    }
    if (reservation?.state !== "reserved") {
      throw new Error(
        "A label purchase is already being processed for this order. ParkVault support must reconcile it before another label can be purchased.",
      );
    }

    const transaction = await shippoRequest<any>("/transactions", {
      rate: rate.id,
      async: false,
      label_file_type: "PDF_4x6",
      metadata: `ParkVault ${quote.order_id}`,
    });
    if (
      transaction.status !== "SUCCESS" ||
      !transaction.label_url ||
      !transaction.tracking_number
    ) {
      throw new Error(transaction.messages?.[0]?.text ?? "The label could not be created.");
    }
    const recorded = await client.rpc("complete_shipping_label_purchase", {
      _quote_id: quote.id,
      _rate_id: rate.id,
      _carrier: rate.carrier,
      _tracking_number: transaction.tracking_number,
      _provider: "shippo",
      _provider_reference: transaction.object_id,
      _label_url: transaction.label_url,
      _tracking_url: transaction.tracking_url_provider ?? "",
      _service_level: rate.service,
      _rate_cents: rate.amountCents,
    });
    if (recorded.error) throw new Error(recorded.error.message);
    const { emailOrderShipped } = await import("./email-notifications.server");
    await emailOrderShipped(
      quote.order_id as string,
      rate.carrier as string,
      transaction.tracking_number as string,
    );
    return {
      labelUrl: transaction.label_url as string,
      trackingNumber: transaction.tracking_number as string,
    };
  });
