/* eslint-disable @typescript-eslint/no-explicit-any -- the generated Supabase client types lag the applied seller migration until the next linked type generation */
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
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

/**
 * Phase 6.5 — approved-shopper service profiles and dynamic sourcing options.
 *
 * A sourcing option is calculated on demand from an approved shopper's
 * service profile, their location coverage, their live availability window,
 * their flat fee, and the append-only park price evidence for the exact
 * variation. Nothing is stored as a permanent listing. Custom buyer sourcing
 * requests and shopper quotes are a separate flow — see `sourcing.functions.ts`.
 *
 * Identity boundary: options are addressed by an opaque per-variation
 * reference, never by a shopper id. Fees, reference prices, coverage and the
 * buyer maximum are recomputed and frozen in the database on creation, so a
 * member cannot spoof a shopper, a fee, a coverage area or a variation.
 */

export type SourcingOption = {
  /** Opaque, per-variation reference. Never a shopper or profile id. */
  optionRef: string;
  shopperLabel: string;
  /** Public profile photo URL, null when the shopper has not set one. */
  avatarUrl: string | null;
  /** Public shopper profile slug, null when unpublished. */
  profileSlug: string | null;
  feeCents: number;
  currency: string;
  coverageLabel: string;
  purchaseWindowDays: number;
  availableUntil: string;
  completedOrders: number;
  cancelledOrders: number;
  capacityRemaining: number;
  referencePriceCents: number | null;
  referenceObservedAt: string | null;
  referenceLocation: string | null;
  referenceConfidence: string;
  isPriceable: boolean;
  estimatedBuyerTotalCents: number | null;
  /** Reputation, never identity: null with no reviews/history yet. */
  avgRating: number | null;
  reviewCount: number;
  satisfactionPct: number | null;
  /** True only while the shopper's own "go live" window is open — informational, never gates listing. */
  isLiveNow: boolean;
};

export type ServiceProfile = {
  flatFeeCents: number;
  purchaseWindowDays: number;
  maxActiveOrders: number;
  offerAcrossCatalog: boolean;
  available: boolean;
  availableUntil: string | null;
  coverage: { resortIds: string[]; parkIds: string[]; locationIds: string[] };
  activeOrders: number;
  completedOrders: number;
  cancelledOrders: number;
  payoutProviderConfigured: boolean;
  stripeDetailsSubmitted: boolean;
  stripeChargesEnabled: boolean;
  stripePayoutsEnabled: boolean;
  stripeAccountModeCurrent: boolean;
};

/* ------------------------------------------------------------- sourcing options */

/**
 * Sourcing options for one exact variation, computed at view time.
 *
 * Runs through the service layer rather than the browser client so no
 * signed-out or signed-in caller can reach the underlying function directly.
 */
export const getSourcingOptions = createServerFn({ method: "GET" })
  .inputValidator((input: { variantId: string }) => ({
    variantId: String(input.variantId).slice(0, 40),
  }))
  .handler(async ({ data }): Promise<SourcingOption[]> => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: rows, error } = await supabaseAdmin.rpc("sourcing_options", {
      _variant_id: data.variantId,
    });
    if (error) {
      console.error("getSourcingOptions failed", error.message);
      throw new Error("Could not load shoppers available to source.");
    }
    return (rows ?? []).map((r) => ({
      optionRef: r.option_ref as string,
      shopperLabel: r.shopper_label as string,
      avatarUrl: (r.avatar_url as string | null) ?? null,
      profileSlug: (r.profile_slug as string | null) ?? null,
      feeCents: r.fee_cents as number,
      currency: r.currency as string,
      coverageLabel: r.coverage_label as string,
      purchaseWindowDays: r.purchase_window_days as number,
      availableUntil: r.available_until as string,
      completedOrders: r.completed_orders as number,
      cancelledOrders: r.cancelled_orders as number,
      capacityRemaining: r.capacity_remaining as number,
      referencePriceCents: r.reference_price_cents as number | null,
      referenceObservedAt: r.reference_observed_at as string | null,
      referenceLocation: r.reference_location as string | null,
      referenceConfidence: (r.reference_confidence as string | null) ?? "none",
      isPriceable: Boolean(r.is_priceable),
      estimatedBuyerTotalCents: r.estimated_buyer_total_cents as number | null,
      avgRating: r.avg_rating as number | null,
      reviewCount: (r.review_count as number | null) ?? 0,
      satisfactionPct: r.satisfaction_pct as number | null,
      isLiveNow: Boolean(r.is_live_now),
    }));
  });

// The old unpaid sourcing request path is retired: buyers now pay through
// Stripe first (see startSourcingCheckout), and a shopper is only assigned once
// that payment is captured.

/* -------------------------------------------------------------- service profile */

export const getMyServiceProfile = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<ServiceProfile | null> => {
    const { supabase, userId } = context;
    const { data: profile, error } = await (supabase as any)
      .from("shopper_service_profiles")
      .select(
        "id, flat_fee_cents, purchase_window_days, max_active_orders, offer_across_catalog, available, available_until, stripe_account_id, stripe_account_mode, stripe_details_submitted, stripe_charges_enabled, stripe_payouts_enabled",
      )
      .eq("shopper_id", userId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!profile) return null;

    const [
      { data: coverage, error: coverageError },
      { data: assignments, error: assignmentError },
    ] = await Promise.all([
      supabase
        .from("shopper_coverage")
        .select("resort_id, park_id, location_id")
        .eq("profile_id", profile.id),
      supabase.from("sourcing_assignments").select("status").eq("shopper_id", userId),
    ]);
    if (coverageError) throw new Error(coverageError.message);
    if (assignmentError) throw new Error(assignmentError.message);

    const rows = assignments ?? [];
    const stripeAccountModeCurrent = Boolean(
      profile.stripe_account_id && stripeAccountMatchesCurrentMode(profile.stripe_account_mode),
    );
    return {
      flatFeeCents: profile.flat_fee_cents,
      purchaseWindowDays: profile.purchase_window_days,
      maxActiveOrders: profile.max_active_orders,
      offerAcrossCatalog: profile.offer_across_catalog,
      // Availability is only live while its expiry is in the future — it can
      // never remain switched on indefinitely.
      available:
        profile.available &&
        profile.available_until != null &&
        new Date(profile.available_until) > new Date(),
      availableUntil: profile.available_until,
      coverage: {
        resortIds: (coverage ?? []).map((c) => c.resort_id).filter(Boolean) as string[],
        parkIds: (coverage ?? []).map((c) => c.park_id).filter(Boolean) as string[],
        locationIds: (coverage ?? []).map((c) => c.location_id).filter(Boolean) as string[],
      },
      activeOrders: rows.filter((r) => r.status === "assigned").length,
      completedOrders: rows.filter((r) => r.status === "completed").length,
      cancelledOrders: rows.filter((r) => r.status === "cancelled" || r.status === "unavailable")
        .length,
      payoutProviderConfigured: stripeConnectConfigured(),
      stripeDetailsSubmitted: stripeAccountModeCurrent && profile.stripe_details_submitted === true,
      stripeChargesEnabled: stripeAccountModeCurrent && profile.stripe_charges_enabled === true,
      stripePayoutsEnabled: stripeAccountModeCurrent && profile.stripe_payouts_enabled === true,
      stripeAccountModeCurrent,
    };
  });

export const saveServiceProfile = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (input: {
      flatFeeCents: number;
      purchaseWindowDays: number;
      maxActiveOrders: number;
      offerAcrossCatalog: boolean;
      resortIds?: string[];
      parkIds?: string[];
      locationIds?: string[];
    }) => {
      const fee = Math.round(Number(input.flatFeeCents));
      if (!Number.isFinite(fee) || fee < 1_000 || fee > 2_500) {
        throw new Error("Choose shopper earnings between $10 and $25.");
      }
      const window = Math.round(Number(input.purchaseWindowDays));
      if (!Number.isFinite(window) || window < 1 || window > 30) {
        throw new Error("Enter an expected purchase window between 1 and 30 days.");
      }
      const max = Math.round(Number(input.maxActiveOrders));
      if (!Number.isFinite(max) || max < 1 || max > 25) {
        throw new Error("Enter a simultaneous order limit between 1 and 25.");
      }
      const ids = (list?: string[]) =>
        (list ?? []).filter((v) => typeof v === "string" && v.length > 0).slice(0, 60);
      const resortIds = ids(input.resortIds);
      const parkIds = ids(input.parkIds);
      const locationIds = ids(input.locationIds);
      if (resortIds.length + parkIds.length + locationIds.length === 0) {
        throw new Error("Select at least one resort, park, district or store you cover.");
      }
      return {
        flatFeeCents: fee,
        purchaseWindowDays: window,
        maxActiveOrders: max,
        offerAcrossCatalog: Boolean(input.offerAcrossCatalog),
        resortIds,
        parkIds,
        locationIds,
      };
    },
  )
  .handler(async ({ data, context }) => {
    const { error } = await (context.supabase as any).rpc("save_shopper_service_profile", {
      _flat_fee_cents: data.flatFeeCents,
      _purchase_window_days: data.purchaseWindowDays,
      _max_active_orders: data.maxActiveOrders,
      _offer_across_catalog: data.offerAcrossCatalog,
      _resort_ids: data.resortIds,
      _park_ids: data.parkIds,
      _location_ids: data.locationIds,
    });
    if (error) throw new Error(error.message);
    return { ok: true as const };
  });

/* ------------------------------------------------------------ Stripe Connect */

export const startStripeShopperOnboarding = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<{ url: string }> => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const admin = supabaseAdmin as any;
    const [{ data: profile, error }, { data: sellerProfile, error: sellerError }] =
      await Promise.all([
        admin
          .from("shopper_service_profiles")
          .select("stripe_account_id,stripe_account_mode")
          .eq("shopper_id", context.userId)
          .maybeSingle(),
        admin
          .from("seller_profiles")
          .select("stripe_account_id,stripe_account_mode")
          .eq("user_id", context.userId)
          .maybeSingle(),
      ]);
    if (error) throw new Error(error.message);
    if (sellerError) throw new Error(sellerError.message);
    if (!profile) throw new Error("Set up your sourcing service profile first.");

    // A member has one ParkVault payout identity even when they are both a
    // seller and an in-park shopper. Prefer the established seller account so
    // Stripe never creates a second Express login for the shopper role.
    const currentMode = stripeConnectMode();
    const candidates = [sellerProfile, profile].filter(Boolean) as Array<{
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
        role: "shopper",
        productDescription:
          "Approved Park Shopper service — sourcing theme-park merchandise on behalf of buyers",
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
    const updates = [
      admin.from("shopper_service_profiles").update(status).eq("shopper_id", context.userId),
    ];
    if (sellerProfile) {
      updates.push(admin.from("seller_profiles").update(status).eq("user_id", context.userId));
    }
    const saved = await Promise.all(updates);
    const saveError = saved.find((result) => result.error)?.error;
    if (saveError) throw new Error(saveError.message);

    const link = await createParkVaultOnboardingLink({
      accountId,
      returnPath: "/shopper-payouts",
    });
    return { url: link.url };
  });

export const refreshStripeShopperStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const admin = supabaseAdmin as any;
    const { data: profile } = await admin
      .from("shopper_service_profiles")
      .select("stripe_account_id,stripe_account_mode")
      .eq("shopper_id", context.userId)
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
        admin.from("shopper_service_profiles").update(reset).eq("shopper_id", context.userId),
        admin.from("seller_profiles").update(reset).eq("user_id", context.userId),
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
      admin.from("shopper_service_profiles").update(status).eq("shopper_id", context.userId),
      admin.from("seller_profiles").update(status).eq("user_id", context.userId),
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

export const setAvailability = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { available: boolean; hours?: number }) => {
    const hours = Math.round(Number(input.hours ?? 8));
    if (input.available && (!Number.isFinite(hours) || hours < 1 || hours > 72)) {
      throw new Error("Availability must expire between 1 and 72 hours from now.");
    }
    return { available: Boolean(input.available), hours };
  })
  .handler(async ({ data, context }) => {
    const { data: until, error } = await context.supabase.rpc("set_shopper_availability", {
      _available: data.available,
      _hours: data.hours,
    });
    if (error) throw new Error(error.message);
    return { availableUntil: (until as string | null) ?? null };
  });

/* ------------------------------------------------------- sourcing assignments */

export type MySourcingAssignment = {
  orderId: string;
  productName: string;
  variantLabel: string;
  role: "buyer" | "shopper";
  shopperFeeCents: number;
  referencePriceCents: number;
  buyerMaxPurchaseCents: number;
  coverageLabel: string;
  purchaseDeadline: string;
  status: string;
  createdAt: string;
};

export const getMySourcingAssignments = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<MySourcingAssignment[]> => {
    const { supabase, userId } = context;
    const { data, error } = await supabase
      .from("sourcing_assignments")
      .select(
        "order_id, buyer_id, shopper_id, shopper_fee_cents, reference_price_cents, buyer_max_purchase_cents, coverage_label, purchase_deadline, status, created_at, product_variants(size, color, edition, products(name))",
      )
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);

    return (data ?? []).map((row) => {
      const variant = row.product_variants as {
        size: string | null;
        color: string | null;
        edition: string | null;
        products: { name: string } | null;
      } | null;
      const parts = [variant?.size, variant?.color, variant?.edition].filter(Boolean) as string[];
      return {
        orderId: row.order_id,
        productName: variant?.products?.name ?? "Unknown product",
        variantLabel: parts.length > 0 ? parts.join(" · ") : "One variation",
        role: row.buyer_id === userId ? ("buyer" as const) : ("shopper" as const),
        shopperFeeCents: row.shopper_fee_cents,
        referencePriceCents: row.reference_price_cents,
        buyerMaxPurchaseCents: row.buyer_max_purchase_cents,
        coverageLabel: row.coverage_label,
        purchaseDeadline: row.purchase_deadline,
        status: row.status,
        createdAt: row.created_at,
      };
    });
  });

/* -------------------------------------------------- public shopper profile */

export type ShopperPublicProfileDraft = {
  slug: string;
  displayName: string;
  avatarUrl: string;
  bio: string;
  publicLocation: string;
};

export type PublicShopper = {
  slug: string;
  displayName: string;
  avatarUrl: string | null;
  bio: string | null;
  publicLocation: string | null;
  homeResort: string | null;
  memberSince: string;
  completedOrders: number;
  ratingAverage: number | null;
  reviewCount: number;
  flatFeeCents: number | null;
  currency: string;
  purchaseWindowDays: number | null;
  availableNow: boolean;
  reviews: { id: string; rating: number; comment: string | null; createdAt: string }[];
};

/** The signed-in shopper's own editable public profile. */
export const getMyShopperPublicProfile = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<ShopperPublicProfileDraft> => {
    const client = context.supabase as any;
    const [{ data: sp }, { data: member }] = await Promise.all([
      client
        .from("shopper_service_profiles")
        .select("slug,bio,public_location,avatar_url")
        .eq("shopper_id", context.userId)
        .maybeSingle(),
      client
        .from("profiles")
        .select("display_name,avatar_url")
        .eq("id", context.userId)
        .maybeSingle(),
    ]);
    return {
      slug: sp?.slug ?? "",
      displayName: member?.display_name ?? "",
      avatarUrl: sp?.avatar_url ?? member?.avatar_url ?? "",
      bio: sp?.bio ?? "",
      publicLocation: sp?.public_location ?? "",
    };
  });

export const saveShopperPublicProfile = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: ShopperPublicProfileDraft) => {
    const slug = String(input.slug ?? "")
      .trim()
      .toLowerCase();
    if (!/^[a-z0-9][a-z0-9-]{2,29}$/.test(slug)) {
      throw new Error("Shopper handle must be 3–30 lowercase letters, numbers or hyphens.");
    }
    const displayName = String(input.displayName ?? "").trim();
    if (displayName.length < 2 || displayName.length > 80) {
      throw new Error("Display name must be 2–80 characters.");
    }
    const bio = String(input.bio ?? "").trim();
    if (bio.length > 280) throw new Error("Bio must be 280 characters or fewer.");
    const publicLocation = String(input.publicLocation ?? "").trim();
    if (publicLocation.length > 100) throw new Error("Location must be 100 characters or fewer.");
    const avatarUrl = String(input.avatarUrl ?? "").trim();
    if (avatarUrl && !avatarUrl.includes("/storage/v1/object/public/shopper-avatars/")) {
      throw new Error("Upload the shopper photo through ParkVault.");
    }
    return { slug, displayName, bio, publicLocation, avatarUrl };
  })
  .handler(async ({ data, context }) => {
    const { error } = await (context.supabase as any).rpc("save_shopper_public_profile", {
      _slug: data.slug,
      _display_name: data.displayName,
      _avatar_url: data.avatarUrl || null,
      _bio: data.bio || null,
      _public_location: data.publicLocation || null,
    });
    if (error) throw new Error(error.message);
    return { ok: true as const, slug: data.slug };
  });

/** Public, unauthenticated shopper profile page read. */
export const getPublicShopper = createServerFn({ method: "GET" })
  .inputValidator((input: { slug: string }) => ({
    slug: String(input.slug ?? "")
      .trim()
      .toLowerCase()
      .slice(0, 40),
  }))
  .handler(async ({ data }): Promise<PublicShopper | null> => {
    const { publicServerClient } = await import("@/lib/supabase-public.server");
    const client = publicServerClient() as any;
    const { data: row, error } = await client.rpc("public_shopper_profile", { _slug: data.slug });
    if (error || !row) return null;
    return {
      slug: row.slug,
      displayName: row.display_name,
      avatarUrl: row.avatar_url ?? null,
      bio: row.bio ?? null,
      publicLocation: row.public_location ?? null,
      homeResort: row.home_resort ?? null,
      memberSince: row.member_since,
      completedOrders: Number(row.completed_orders ?? 0),
      ratingAverage: row.rating_average == null ? null : Number(row.rating_average),
      reviewCount: Number(row.review_count ?? 0),
      flatFeeCents: row.flat_fee_cents == null ? null : Number(row.flat_fee_cents),
      currency: row.currency ?? "USD",
      purchaseWindowDays:
        row.purchase_window_days == null ? null : Number(row.purchase_window_days),
      availableNow: row.available_now === true,
      reviews: (row.reviews ?? []).map((r: any) => ({
        id: r.id,
        rating: Number(r.rating),
        comment: r.comment ?? null,
        createdAt: r.created_at,
      })),
    };
  });

/* ------------------------------------------------- Park Shopper: paid jobs */

export type ShopperJob = {
  orderId: string;
  orderNumber: string;
  productSlug: string;
  productName: string;
  variantLabel: string;
  imageSrc: string | null;
  status: string;
  coverageLabel: string;
  purchaseDeadline: string;
  currency: string;
  /** What ParkVault reimburses for the item itself. */
  itemBudgetCents: number;
  /** The hard ceiling the buyer approved. */
  buyerMaxPurchaseCents: number;
  shopperFeeCents: number;
  platformServiceFeeCents: number;
  /** Actual item reimbursement + 100% of the shopper's selected earnings. */
  payoutCents: number;
  actualCostCents: number | null;
  balanceDueCents: number;
  refundDueCents: number;
  shoppingStartedAt: string | null;
  purchaseConfirmedAt: string | null;
  createdAt: string;
};

/**
 * The signed-in shopper's paid jobs.
 *
 * Only orders the buyer has already paid for appear here: a shopper never sees
 * a job, an address or a buyer until ParkVault has the money.
 */
export const getMyShopperJobs = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<ShopperJob[]> => {
    const client = context.supabase as any;
    const { data, error } = await client
      .from("sourcing_assignments")
      .select(
        "order_id,status,coverage_label,purchase_deadline,currency,shopper_fee_cents,platform_service_fee_cents,buyer_max_purchase_cents,reference_price_cents,actual_cost_cents,balance_due_cents,refund_due_cents,shopping_started_at,purchase_confirmed_at,created_at," +
          "orders!inner(id,order_number,status,payment_authorized,payout_cents,merchandise_cents,fee_snapshot,product_id,products(slug,name),product_variants(size,color,edition))",
      )
      .eq("shopper_id", context.userId)
      .eq("orders.payment_authorized", true)
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);

    const rows = (data ?? []) as any[];
    const productIds = Array.from(
      new Set(rows.map((row) => row.orders?.product_id).filter(Boolean) as string[]),
    );

    // Canonical catalog imagery only — never private seller/shopper evidence.
    const images = new Map<string, string>();
    if (productIds.length > 0) {
      const { data: imgs } = await client
        .from("product_images")
        .select("product_id,storage_path,position,kind")
        .in("product_id", productIds)
        .eq("kind", "canonical")
        .order("position", { ascending: true })
        .limit(200);
      for (const img of (imgs ?? []) as any[]) {
        if (img.storage_path && !images.has(img.product_id)) {
          images.set(
            img.product_id,
            /^(https?:\/\/|\/)/.test(img.storage_path)
              ? img.storage_path
              : `/api/public/catalog-media/${img.storage_path}`,
          );
        }
      }
    }

    return rows.map((row) => {
      const order = row.orders ?? {};
      const variant = order.product_variants ?? null;
      const parts = [variant?.size, variant?.color, variant?.edition].filter(Boolean) as string[];
      const snapshot = (order.fee_snapshot ?? {}) as Record<string, unknown>;
      const itemBudget =
        Number(snapshot["item_cost_basis_cents"] ?? 0) ||
        Number(order.merchandise_cents ?? 0) - Number(row.shopper_fee_cents ?? 0);
      const slug = order.products?.slug ?? "";
      return {
        orderId: row.order_id,
        orderNumber: order.order_number ?? "",
        productSlug: slug,
        productName: order.products?.name ?? "Unknown product",
        variantLabel: parts.length > 0 ? parts.join(" · ") : "One variation",
        imageSrc: images.get(order.product_id) ?? null,
        status: order.status,
        coverageLabel: row.coverage_label,
        purchaseDeadline: row.purchase_deadline,
        currency: row.currency,
        itemBudgetCents: itemBudget,
        buyerMaxPurchaseCents: row.buyer_max_purchase_cents,
        shopperFeeCents: row.shopper_fee_cents,
        platformServiceFeeCents: Number(row.platform_service_fee_cents ?? 0),
        payoutCents: Number(order.payout_cents ?? 0),
        actualCostCents: row.actual_cost_cents ?? null,
        balanceDueCents: Number(row.balance_due_cents ?? 0),
        refundDueCents: Number(row.refund_due_cents ?? 0),
        shoppingStartedAt: row.shopping_started_at ?? null,
        purchaseConfirmedAt: row.purchase_confirmed_at ?? null,
        createdAt: row.created_at,
      };
    });
  });

/** "I'm shopping for this" — visible to the buyer as progress. */
export const startShopping = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { orderId: string }) => ({ orderId: String(input.orderId) }))
  .handler(async ({ data, context }) => {
    const { data: order } = await context.supabase
      .from("orders")
      .select("seller_id")
      .eq("id", data.orderId)
      .maybeSingle();
    if (order?.seller_id !== context.userId) throw new Error("This is not your shopping job.");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { requireShopperPayoutReady } = await import("./shopper-payout-readiness.server");
    await requireShopperPayoutReady(supabaseAdmin, context.userId);
    const { error } = await (context.supabase as any).rpc("shopper_start_shopping", {
      _order_id: data.orderId,
    });
    if (error) throw new Error(error.message);
    const { emailSourcingUpdate } = await import("./email-notifications.server");
    await emailSourcingUpdate(data.orderId, "started");
    return { ok: true as const };
  });

/** "I bought it" — the real price paid plus the receipt, capped by the buyer's approved maximum. */
export const confirmSourcingPurchase = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { orderId: string; actualCostCents: number; receiptPath: string }) => {
    const cents = Math.round(Number(input.actualCostCents));
    if (!Number.isFinite(cents) || cents < 1 || cents > 5_000_000) {
      throw new Error("Enter what you actually paid for the item.");
    }
    const receiptPath = String(input.receiptPath ?? "");
    if (!receiptPath) throw new Error("Attach a photo of your receipt.");
    return { orderId: String(input.orderId), actualCostCents: cents, receiptPath };
  })
  .handler(async ({ data, context }) => {
    const { prepareReceiptTaxQuote } = await import("./receipt-tax-quote.server");
    await prepareReceiptTaxQuote(context.userId, data);
    const { data: result, error } = await (context.supabase as any).rpc(
      "shopper_confirm_purchase",
      {
        _order_id: data.orderId,
        _actual_cost_cents: data.actualCostCents,
        _receipt_path: data.receiptPath,
      },
    );
    if (error) throw new Error(error.message);
    const payload = (result ?? {}) as { balance_due_cents?: number; refund_due_cents?: number; already_confirmed?: boolean };
    const refundDueCents = Number(payload.refund_due_cents ?? 0);
    let refundIssued = false;
    if (refundDueCents > 0) {
      try {
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { getStripe } = await import("./stripe-marketplace.server");
        const admin = supabaseAdmin as any;
        const { data: order } = await admin
          .from("orders")
          .select("stripe_payment_intent_id,stripe_checkout_session_id,merchandise_cents,buyer_fee_cents,shipping_cents,tax_cents")
          .eq("id", data.orderId)
          .maybeSingle();
        if (order?.stripe_payment_intent_id) {
          const { refundReceiptReduction } = await import("./receipt-tax.server");
          const refund = await refundReceiptReduction(getStripe(), {
            orderId: data.orderId, actualCostCents: data.actualCostCents,
            paymentIntentId: order.stripe_payment_intent_id, amountCents: refundDueCents,
            checkoutId: order.stripe_checkout_session_id, merchandise: order.merchandise_cents,
            fee: order.buyer_fee_cents, shipping: order.shipping_cents, finalTaxCents: order.tax_cents,
          });
          const { error: refundError } = await admin.rpc("finalize_sourcing_refund", {
            _order_id: data.orderId,
            _refund_reference: refund.id,
            _amount_cents: refundDueCents,
          });
          if (refundError) throw new Error(refundError.message);
          refundIssued = true;
        }
      } catch (refundError) {
        // The receipt and payout correction are already safely recorded. Keep
        // the refund marked due so it can be retried without telling the
        // shopper that their purchase confirmation failed.
        console.error("Automatic sourcing refund is still pending", refundError);
      }
    }
    const balanceDueCents = Number(payload.balance_due_cents ?? 0);
    const { emailSourcingUpdate } = await import("./email-notifications.server");
    if (!payload.already_confirmed) await emailSourcingUpdate(
      data.orderId,
      balanceDueCents > 0 ? "balance_due" : "purchased",
      balanceDueCents > 0 ? balanceDueCents : undefined,
    );
    return {
      balanceDueCents,
      refundDueCents,
      refundIssued,
    };
  });

/** Whether this shopper can be shown to buyers yet (shipping setup is required). */
export const getShopperShippingReadiness = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<{ ready: boolean }> => {
    const { data } = await (context.supabase as any)
      .from("seller_profiles")
      .select(
        "ship_from_name,ship_from_line1,ship_from_city,ship_from_region,ship_from_postal_code",
      )
      .eq("user_id", context.userId)
      .maybeSingle();
    const ready = Boolean(
      data?.ship_from_name &&
      data?.ship_from_line1 &&
      data?.ship_from_city &&
      data?.ship_from_region &&
      data?.ship_from_postal_code,
    );
    return { ready };
  });

export type SourcingProgress = {
  status: string;
  shoppingStartedAt: string | null;
  purchaseConfirmedAt: string | null;
  balanceDueCents: number;
  refundDueCents: number;
  refundCompletedAt: string | null;
  tipCents: number;
  tipStatus: string | null;
  actualCostCents: number | null;
  buyerMaxPurchaseCents: number;
  purchaseDeadline: string;
  shopperLabel: string;
  profileSlug: string | null;
  avatarUrl: string | null;
};

/** Progress on a Park Shopper job, for either party on the order. RLS scopes it. */
export const getSourcingProgress = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { orderId: string }) => ({ orderId: String(input.orderId) }))
  .handler(async ({ data, context }): Promise<SourcingProgress | null> => {
    const { data: row, error } = await (context.supabase as any)
      .from("sourcing_assignments")
      .select(
        "status,shopping_started_at,purchase_confirmed_at,balance_due_cents,refund_due_cents,refund_completed_at,actual_cost_cents,buyer_max_purchase_cents,purchase_deadline,shopper_id",
      )
      .eq("order_id", data.orderId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!row) return null;
    // Presentation only; a missing profile row just falls back to a neutral label.
    const { data: presented } = await (context.supabase as any)
      .from("shopper_service_profiles")
      .select("slug,avatar_url")
      .eq("shopper_id", row.shopper_id)
      .maybeSingle();
    const { data: tip } = await (context.supabase as any)
      .from("sourcing_tips")
      .select("amount_cents,status")
      .eq("order_id", data.orderId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    return {
      status: row.status,
      shoppingStartedAt: row.shopping_started_at ?? null,
      purchaseConfirmedAt: row.purchase_confirmed_at ?? null,
      balanceDueCents: Number(row.balance_due_cents ?? 0),
      refundDueCents: Number(row.refund_due_cents ?? 0),
      refundCompletedAt: row.refund_completed_at ?? null,
      tipCents: tip?.status === "succeeded" ? Number(tip.amount_cents ?? 0) : 0,
      tipStatus: tip?.status ?? null,
      actualCostCents: row.actual_cost_cents ?? null,
      buyerMaxPurchaseCents: Number(row.buyer_max_purchase_cents ?? 0),
      purchaseDeadline: row.purchase_deadline,
      shopperLabel: "Your Park Shopper",
      profileSlug: presented?.slug ?? null,
      avatarUrl: presented?.avatar_url ?? null,
    };
  });
