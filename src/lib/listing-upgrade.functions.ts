/* eslint-disable @typescript-eslint/no-explicit-any -- upgrade tables are added by the linked migration */
import { getRequest } from "@tanstack/react-start/server";
import { createServerFn } from "@tanstack/react-start";
import type Stripe from "stripe";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import {
  expireListingUpgradeCheckout,
  finalizeListingUpgradeCheckout,
  gemStateOrigin,
  getStripe,
} from "./stripe-marketplace.server";

export type ListingUpgradeOption = {
  id: string;
  code: string;
  name: string;
  description: string;
  amountCents: number;
  durationDays: number;
};

export type ListingUpgradePurchase = {
  id: string;
  listingId: string;
  listingTitle: string;
  upgradeName: string;
  amountCents: number;
  status: string;
  checkoutSessionId: string | null;
  receiptUrl: string | null;
  paidAt: string | null;
  createdAt: string;
};

const gemStateCheckoutBranding: Stripe.Checkout.SessionCreateParams.BrandingSettings = {
  display_name: "Gem State Classifieds",
  background_color: "#f3eae0",
  button_color: "#14544b",
  border_style: "rounded",
};

function option(row: any): ListingUpgradeOption {
  return {
    id: row.id,
    code: row.code,
    name: row.name,
    description: row.description,
    amountCents: Number(row.amount_cents),
    durationDays: Number(row.duration_days ?? 0),
  };
}

export const getListingUpgradeOptions = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async (): Promise<ListingUpgradeOption[]> => {
    const { data, error } = await (supabaseAdmin as any)
      .from("listing_upgrade_catalog")
      .select("id,code,name,description,amount_cents,duration_days")
      .eq("active", true)
      .order("amount_cents", { ascending: true });
    if (error) throw new Error(error.message);
    return (data ?? []).map(option);
  });

export const getSellerBillingHistory = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<ListingUpgradePurchase[]> => {
    const { data, error } = await (supabaseAdmin as any)
      .from("listing_upgrade_purchases")
      .select(
        "id,listing_id,amount_cents,status,stripe_checkout_session_id,receipt_url,paid_at,created_at,listing_upgrade_catalog(name),asks(products(name))",
      )
      .eq("user_id", context.userId)
      .order("created_at", { ascending: false })
      .limit(100);
    if (error) throw new Error(error.message);
    return (data ?? []).map((row: any) => ({
      id: row.id,
      listingId: row.listing_id,
      listingTitle: row.asks?.products?.name ?? "Your listing",
      upgradeName: row.listing_upgrade_catalog?.name ?? "Listing upgrade",
      amountCents: Number(row.amount_cents),
      status: row.status,
      checkoutSessionId: row.stripe_checkout_session_id ?? null,
      receiptUrl: row.receipt_url ?? null,
      paidAt: row.paid_at ?? null,
      createdAt: row.created_at,
    }));
  });

export const reconcileListingUpgradeCheckout = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: { purchaseId: string; cancelled: boolean }) => ({
    purchaseId: String(input.purchaseId),
    cancelled: Boolean(input.cancelled),
  }))
  .handler(async ({ data, context }): Promise<"paid" | "canceled" | "pending" | "unavailable"> => {
    const admin = supabaseAdmin as any;
    const { data: purchase, error } = await admin
      .from("listing_upgrade_purchases")
      .select("id,user_id,status,stripe_checkout_session_id")
      .eq("id", data.purchaseId)
      .eq("user_id", context.userId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!purchase?.stripe_checkout_session_id) return "unavailable";
    if (purchase.status === "paid") return "paid";
    if (["canceled", "failed", "refunded"].includes(purchase.status))
      return purchase.status === "canceled" ? "canceled" : "unavailable";

    const stripe = getStripe();
    const session = await stripe.checkout.sessions.retrieve(purchase.stripe_checkout_session_id);
    if (data.cancelled) {
      if (session.status === "open") await stripe.checkout.sessions.expire(session.id);
      await expireListingUpgradeCheckout(session);
      return "canceled";
    }
    if (session.payment_status === "paid" || session.status === "complete") {
      await finalizeListingUpgradeCheckout(session);
      return "paid";
    }
    if (session.status === "expired") {
      await expireListingUpgradeCheckout(session);
      return "canceled";
    }
    return "pending";
  });

export const createListingUpgradeCheckout = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: { listingId: string; upgradeCode: string }) => ({
    listingId: String(input.listingId),
    upgradeCode: String(input.upgradeCode),
  }))
  .handler(async ({ data, context }): Promise<{ url: string }> => {
    const admin = supabaseAdmin as any;
    const [{ data: listing, error: listingError }, { data: upgrade, error: upgradeError }] =
      await Promise.all([
        admin
          .from("asks")
          .select("id,seller_id,status,approved_at,expires_at,product_id")
          .eq("id", data.listingId)
          .maybeSingle(),
        admin
          .from("listing_upgrade_catalog")
          .select("id,code,name,description,amount_cents,duration_days")
          .eq("code", data.upgradeCode)
          .eq("active", true)
          .maybeSingle(),
      ]);
    if (listingError) throw new Error(listingError.message);
    if (upgradeError) throw new Error(upgradeError.message);
    if (!listing || listing.seller_id !== context.userId)
      throw new Error("You can only upgrade your own listings.");
    if (!upgrade) throw new Error("That listing upgrade is not available.");
    if (listing.status !== "active" || !listing.approved_at)
      throw new Error("Only approved active listings can be upgraded.");

    const pending = await admin
      .from("listing_upgrade_purchases")
      .select("id,amount_cents,stripe_checkout_session_id")
      .eq("user_id", context.userId)
      .eq("listing_id", data.listingId)
      .eq("upgrade_id", upgrade.id)
      .eq("status", "pending")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (pending.error) throw new Error(pending.error.message);
    if (pending.data?.stripe_checkout_session_id) {
      const existing = await getStripe().checkout.sessions.retrieve(
        pending.data.stripe_checkout_session_id,
      );
      if (existing.status === "open" && existing.url) return { url: existing.url };
      await admin
        .from("listing_upgrade_purchases")
        .update({ status: "canceled" })
        .eq("id", pending.data.id)
        .eq("status", "pending");
    }

    const { data: purchase, error: purchaseError } = await admin
      .from("listing_upgrade_purchases")
      .insert({
        user_id: context.userId,
        listing_id: data.listingId,
        upgrade_id: upgrade.id,
        amount_cents: Number(upgrade.amount_cents),
      })
      .select("id")
      .single();
    if (purchaseError) throw new Error(purchaseError.message);

    const request = getRequest();
    const origin = gemStateOrigin(request?.url);
    const metadata = {
      gemstate_purpose: "listing_upgrade",
      gemstate_purchase_id: purchase.id,
      gemstate_listing_id: data.listingId,
      gemstate_upgrade_code: upgrade.code,
    };
    try {
      const session = await getStripe().checkout.sessions.create(
        {
          mode: "payment",
          branding_settings: gemStateCheckoutBranding,
          line_items: [
            {
              quantity: 1,
              price_data: {
                currency: "usd",
                unit_amount: Number(upgrade.amount_cents),
                product_data: { name: upgrade.name, description: upgrade.description },
              },
            },
          ],
          metadata,
          payment_intent_data: { metadata },
          success_url: `${origin}/account?section=billing&checkout=success&purchase=${purchase.id}`,
          cancel_url: `${origin}/account?section=billing&checkout=cancelled&purchase=${purchase.id}`,
          expires_at: Math.floor(Date.now() / 1000) + 30 * 60,
        },
        { idempotencyKey: `gemstate-listing-upgrade-${purchase.id}` },
      );
      const { error: saveError } = await admin
        .from("listing_upgrade_purchases")
        .update({ stripe_checkout_session_id: session.id })
        .eq("id", purchase.id)
        .eq("status", "pending");
      if (saveError) throw new Error(saveError.message);
      return { url: session.url! };
    } catch (error) {
      await admin
        .from("listing_upgrade_purchases")
        .update({ status: "failed" })
        .eq("id", purchase.id)
        .eq("status", "pending");
      throw error;
    }
  });
