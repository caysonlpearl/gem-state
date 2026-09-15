/* eslint-disable @typescript-eslint/no-explicit-any -- payment rows are newer than generated Supabase types */
import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import type Stripe from "stripe";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { serverEnv } from "./runtime-env.server";
import { getStripe, parkVaultOrigin, stripeCheckoutReady } from "./stripe-marketplace.server";
import { stripeAccountMatchesCurrentMode } from "./stripe-connect.server";
import { automaticTaxForStripeKey } from "./stripe-tax-policy";
import { receiptShipping } from "./receipt-tax.server";

export type CheckoutAddress = {
  recipientName: string;
  line1: string;
  line2?: string;
  city: string;
  region: string;
  postalCode: string;
  country: string;
};

export type CheckoutShippingRate = {
  id: string;
  carrier: string;
  service: string;
  amountCents: number;
  currency: string;
  estimatedDays: number | null;
};

type ParcelDimensions = {
  length: number;
  width: number;
  height: number;
  weight: number;
};

const parkVaultCheckoutBranding: Stripe.Checkout.SessionCreateParams.BrandingSettings = {
  display_name: "ParkVault",
  background_color: "#14544a",
  button_color: "#c8601f",
  border_style: "rounded",
};

const categoryParcelPresets: Record<string, ParcelDimensions> = {
  apparel: { length: 14, width: 10, height: 4, weight: 2 },
  "ears-headwear": { length: 14, width: 12, height: 8, weight: 2 },
  bags: { length: 18, width: 14, height: 8, weight: 4 },
  pins: { length: 8, width: 6, height: 3, weight: 1 },
  plush: { length: 18, width: 14, height: 10, weight: 4 },
  "popcorn-buckets-sippers": { length: 18, width: 14, height: 12, weight: 5 },
  drinkware: { length: 12, width: 10, height: 8, weight: 4 },
  "figures-figurines": { length: 18, width: 14, height: 10, weight: 5 },
  "toys-playsets": { length: 18, width: 14, height: 10, weight: 5 },
  "ornaments-seasonal-decor": { length: 12, width: 10, height: 8, weight: 3 },
  "home-decor": { length: 18, width: 14, height: 10, weight: 5 },
  "magicbands-wearable-tech": { length: 8, width: 6, height: 3, weight: 1 },
  "jewelry-watches": { length: 8, width: 6, height: 3, weight: 1 },
  "art-prints-posters": { length: 20, width: 16, height: 4, weight: 4 },
  "stationery-books": { length: 12, width: 10, height: 4, weight: 3 },
  "attraction-collectibles": { length: 18, width: 14, height: 10, weight: 5 },
  "other-collectibles": { length: 16, width: 12, height: 8, weight: 4 },
};

async function parcelForListing(admin: any, ask: any): Promise<ParcelDimensions> {
  const entered = {
    length: Number(ask.parcel_length_in),
    width: Number(ask.parcel_width_in),
    height: Number(ask.parcel_height_in),
    weight: Number(ask.parcel_weight_lb),
  };
  if (Object.values(entered).every((value) => Number.isFinite(value) && value > 0)) {
    return entered;
  }

  const { data: product } = await admin
    .from("products")
    .select("categories(slug)")
    .eq("id", ask.product_id)
    .maybeSingle();
  const category = Array.isArray(product?.categories)
    ? product.categories[0]?.slug
    : product?.categories?.slug;
  return (
    categoryParcelPresets[String(category ?? "")] ?? {
      length: 16,
      width: 12,
      height: 8,
      weight: 4,
    }
  );
}

function validateAddress(input: CheckoutAddress): CheckoutAddress {
  const required = (value: string, label: string, max = 120) => {
    const clean = String(value ?? "").trim();
    if (!clean || clean.length > max) throw new Error(`Enter a valid ${label}.`);
    return clean;
  };
  return {
    recipientName: required(input.recipientName, "recipient name", 100),
    line1: required(input.line1, "street address"),
    line2: String(input.line2 ?? "")
      .trim()
      .slice(0, 120),
    city: required(input.city, "city", 80),
    region: required(input.region, "state", 40),
    postalCode: required(input.postalCode, "ZIP code", 20),
    country: String(input.country || "US")
      .trim()
      .toUpperCase()
      .slice(0, 2),
  };
}

function addressSnapshot(address: CheckoutAddress) {
  return {
    recipient_name: address.recipientName,
    line1: address.line1,
    line2: address.line2 || "",
    city: address.city,
    region: address.region,
    postal_code: address.postalCode,
    country: address.country,
  };
}

async function shippoShipment(body: unknown) {
  const token = serverEnv("SHIPPO_API_TOKEN");
  if (!token) throw new Error("Live delivery pricing is not configured yet.");
  const response = await fetch("https://api.goshippo.com/shipments", {
    method: "POST",
    headers: {
      Authorization: `ShippoToken ${token}`,
      "Content-Type": "application/json",
      "SHIPPO-API-VERSION": "2018-02-08",
    },
    body: JSON.stringify(body),
  });
  const payload = (await response.json()) as any;
  if (!response.ok)
    throw new Error(payload.detail ?? payload.messages?.[0]?.text ?? "Could not price delivery.");
  return payload;
}

function sandboxShippingRate(): CheckoutShippingRate | null {
  const stripeSecret = serverEnv("STRIPE_SECRET_KEY").trim();
  if (!stripeSecret.startsWith("sk_test_")) return null;
  return {
    id: "gemstate_flat_ground",
    carrier: "Gem State Classifieds",
    service: "Tracked ground delivery",
    amountCents: 995,
    currency: "USD",
    estimatedDays: 5,
  };
}

/**
 * TAX
 *
 * Stripe Tax calculates, collects and reports sales tax at checkout. It needs
 * two things configured once in Stripe: the ParkVault origin address and the
 * jurisdictions ParkVault is registered to collect in. Until then Stripe only
 * charges tax where a registration exists.
 *
 * Automatic Tax requires that head-office address even in test mode, so it
 * stays off while the sandbox secret key is in use.
 */
const automaticTaxEnabled = () => automaticTaxForStripeKey(serverEnv("STRIPE_SECRET_KEY"));

/** Stripe tax codes. Every amount we charge is priced tax-exclusive. */
const taxCodes = {
  /** Physical merchandise. */
  goods: "txcd_99999999",
  /** Mandatory marketplace fee charged on the sale of goods — taxed with the goods. */
  marketplaceFee: "txcd_99999999",
  /** Delivery / shipping charges. */
  shipping: "txcd_92010001",
} as const;

export const getCheckoutReadiness = createServerFn({ method: "GET" }).handler(async () => ({
  ready: stripeCheckoutReady(),
}));

export const getCheckoutShippingRates = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { askId: string; address: CheckoutAddress }) => ({
    askId: String(input.askId),
    address: validateAddress(input.address),
  }))
  .handler(
    async ({ data, context }): Promise<{ quoteId: string; rates: CheckoutShippingRate[] }> => {
      if (!stripeCheckoutReady()) {
        throw new Error(
          "Checkout is not fully configured yet — the Stripe secret key and webhook secret are required.",
        );
      }
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      const admin = supabaseAdmin as any;
      const { data: ask, error } = await admin
        .from("asks")
        .select(
          "id,seller_id,product_id,parcel_length_in,parcel_width_in,parcel_height_in,parcel_weight_lb,status,approved_at",
        )
        .eq("id", data.askId)
        .maybeSingle();
      if (error || !ask || ask.status !== "active" || !ask.approved_at)
        throw new Error("That listing is no longer available.");
      const parcel = await parcelForListing(admin, ask);
      const { data: from } = await admin
        .from("seller_profiles")
        .select(
          "ship_from_name,ship_from_phone,ship_from_line1,ship_from_line2,ship_from_city,ship_from_region,ship_from_postal_code,ship_from_country,default_shipping_method",
        )
        .eq("user_id", ask.seller_id)
        .maybeSingle();
      if (!from) throw new Error("The seller shipping profile is incomplete.");
      const testRate = sandboxShippingRate();
      const shipment = serverEnv("SHIPPO_API_TOKEN")
        ? await shippoShipment({
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
              name: data.address.recipientName,
              street1: data.address.line1,
              street2: data.address.line2 || undefined,
              city: data.address.city,
              state: data.address.region,
              zip: data.address.postalCode,
              country: data.address.country,
            },
            parcels: [
              {
                length: String(parcel.length),
                width: String(parcel.width),
                height: String(parcel.height),
                distance_unit: "in",
                weight: String(parcel.weight),
                mass_unit: "lb",
              },
            ],
            metadata: `ParkVault checkout ${data.askId}`,
            async: false,
          })
        : null;
      if (!shipment && !testRate) {
        throw new Error(
          "Live delivery pricing needs a Shippo API token before checkout can start.",
        );
      }
      const rates = testRate
        ? [testRate]
        : (shipment?.rates ?? [])
            .filter((rate: any) => rate.object_id && rate.amount)
            .map((rate: any): CheckoutShippingRate => ({
              id: rate.object_id,
              carrier: rate.provider ?? "Carrier",
              service: rate.servicelevel?.name ?? rate.servicelevel?.token ?? "Tracked delivery",
              amountCents: Math.round(Number(rate.amount) * 100),
              currency: rate.currency ?? "USD",
              estimatedDays: rate.estimated_days == null ? null : Number(rate.estimated_days),
            }))
            .filter((rate: CheckoutShippingRate) => rate.currency === "USD")
            .sort(
              (a: CheckoutShippingRate, b: CheckoutShippingRate) => a.amountCents - b.amountCents,
            )
            .slice(0, 5);
      if (!rates.length)
        throw new Error("No tracked delivery rates were returned for this address.");
      const saved = await admin
        .from("checkout_shipping_quotes")
        .insert({
          buyer_id: context.userId,
          ask_id: data.askId,
          address: addressSnapshot(data.address),
          rates,
          provider_shipment_id: shipment?.object_id ?? "parkvault_sandbox",
        })
        .select("id")
        .single();
      if (saved.error) throw new Error(saved.error.message);
      return { quoteId: saved.data.id, rates };
    },
  );

async function loadQuote(userId: string, askId: string, quoteId: string, rateId: string) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const admin = supabaseAdmin as any;
  const { data: quote } = await admin
    .from("checkout_shipping_quotes")
    .select("*")
    .eq("id", quoteId)
    .eq("buyer_id", userId)
    .eq("ask_id", askId)
    .gt("expires_at", new Date().toISOString())
    .maybeSingle();
  if (!quote) throw new Error("That delivery quote expired. Get fresh rates.");
  const rate = (quote.rates as CheckoutShippingRate[]).find((item) => item.id === rateId);
  if (!rate) throw new Error("Choose a delivery rate from the current quote.");
  return { admin, quote, rate };
}

function customerEmail(context: any) {
  return String((context.claims as { email?: string } | null)?.email ?? "") || undefined;
}

async function createCheckout(params: {
  context: any;
  purpose: "purchase" | "offer" | "counter" | "sourcing" | "sourcing_balance";
  merchandiseCents: number;
  buyerFeeCents: number;
  quoteId: string;
  rate: CheckoutShippingRate;
  shippingAddress: ReturnType<typeof addressSnapshot>;
  orderId?: string;
  offerId?: string;
  checkoutAttempt?: string;
  productName: string;
  captureMethod: "automatic" | "manual";
}) {
  const request = getRequest();
  const origin = parkVaultOrigin(request?.url);
  const stripe = getStripe();
  const metadata: Record<string, string> = {
    parkvault_purpose: params.purpose,
    parkvault_quote_id: params.quoteId,
    parkvault_shipping_rate: JSON.stringify(params.rate),
  };
  if (params.orderId) metadata["parkvault_order_id"] = params.orderId;
  if (params.offerId) metadata["parkvault_offer_id"] = params.offerId;
  if (params.checkoutAttempt) metadata["parkvault_checkout_attempt"] = params.checkoutAttempt;
  const successPath = params.orderId
    ? `/orders/${params.orderId}?checkout=success`
    : "/buying?checkout=offer-authorized";
  const cancelPath = params.orderId
    ? `/orders/${params.orderId}?checkout=cancelled`
    : "/buying?checkout=cancelled";
  const checkoutReference = params.orderId ?? params.offerId ?? params.quoteId;
  const checkoutAttemptSuffix = params.checkoutAttempt ? `-${params.checkoutAttempt}` : "";
  const shipping = receiptShipping(params.shippingAddress);
  // ParkVault already priced delivery to this address. Use one order-scoped
  // Customer so Stripe Tax and fulfillment see the same immutable address;
  // Checkout must not ask for a second, potentially different destination.
  const customerParams: Stripe.CustomerCreateParams = {
    shipping,
    address: shipping.address,
    metadata: {
      parkvault_checkout_reference: checkoutReference,
      parkvault_quote_id: params.quoteId,
    },
  };
  const email = customerEmail(params.context);
  if (email) customerParams.email = email;
  const customer = await stripe.customers.create(customerParams, {
    idempotencyKey: `parkvault-checkout-customer-${params.purpose}-${checkoutReference}-${params.quoteId}`,
  });
  return stripe.checkout.sessions.create(
    {
      mode: "payment",
      // Itemized credit notes keep receipt reductions and Stripe tax reports aligned.
      // User-approved post-payment invoice fee applies only to Park Shopper orders.
      ...(params.purpose === "sourcing" ? { invoice_creation: { enabled: true } } : {}),
      branding_settings: parkVaultCheckoutBranding,
      customer: customer.id,
      customer_update: { address: "never", name: "never", shipping: "never" },
      line_items: [
        {
          quantity: 1,
          price_data: {
            currency: "usd",
            unit_amount: params.merchandiseCents,
            tax_behavior: "exclusive",
            product_data: {
              name: params.productName,
              tax_code: taxCodes.goods,
              metadata: { parkvault_component: "merchandise" },
              description:
                params.purpose === "sourcing" || params.purpose === "sourcing_balance"
                  ? "Park Shopper sourcing job"
                  : "Exact-item ParkVault listing",
            },
          },
        },
        {
          quantity: 1,
          price_data: {
            currency: "usd",
            unit_amount: params.buyerFeeCents,
            tax_behavior: "exclusive",
            product_data: {
              tax_code: taxCodes.marketplaceFee,
              metadata: { parkvault_component: "platform_fee" },
              name:
                params.purpose === "sourcing"
                  ? "ParkVault sourcing & protection"
                  : "ParkVault buyer protection",
            },
          },
        },
      ],
      shipping_options: [
        {
          shipping_rate_data: {
            type: "fixed_amount",
            display_name: `${params.rate.carrier} ${params.rate.service}`,
            fixed_amount: { amount: params.rate.amountCents, currency: "usd" },
            tax_behavior: "exclusive",
            tax_code: taxCodes.shipping,
            ...(params.rate.estimatedDays
              ? {
                  delivery_estimate: {
                    minimum: {
                      unit: "business_day",
                      value: Math.max(1, params.rate.estimatedDays - 1),
                    },
                    maximum: { unit: "business_day", value: params.rate.estimatedDays + 1 },
                  },
                }
              : {}),
          },
        },
      ],
      automatic_tax: { enabled: automaticTaxEnabled() },

      payment_method_types: ["card"],
      payment_intent_data: {
        capture_method: params.captureMethod,
        shipping,
        transfer_group: params.orderId ? `PV-${params.orderId}` : `PV-OFFER-${params.offerId}`,
        description: `ParkVault ${params.purpose}`,
        metadata,
      },
      metadata,
      expires_at: Math.floor(Date.now() / 1000) + 30 * 60,
      success_url: `${origin}${successPath}`,
      cancel_url: `${origin}${cancelPath}`,
    },
    {
      idempotencyKey: `parkvault-checkout-${params.purpose}-${checkoutReference}-${params.quoteId}${checkoutAttemptSuffix}`,
    },
  );
}

class CheckoutReservationSyncError extends Error {}

async function persistCheckoutReservation(
  admin: any,
  orderId: string,
  session: Stripe.Checkout.Session,
) {
  const saved = await admin
    .from("orders")
    .update({
      stripe_checkout_session_id: session.id,
      stripe_payment_status: "checkout_open",
      checkout_expires_at: new Date((session.expires_at ?? 0) * 1000).toISOString(),
    })
    .eq("id", orderId)
    .select("id")
    .maybeSingle();
  if (!saved.error && saved.data?.id) return;

  // Never release the exact item while a usable Stripe Session exists. If the
  // session cannot be expired, retain the reservation for webhook/operator
  // reconciliation instead of risking payment after the item is relisted.
  try {
    const expired = await getStripe().checkout.sessions.expire(session.id);
    if (expired.status !== "expired") throw new Error("Stripe Session is still payable");
  } catch {
    throw new CheckoutReservationSyncError(
      "Checkout started but its reservation could not be synchronized. The item remains reserved for ParkVault support review.",
    );
  }
  throw new Error(saved.error?.message ?? "Checkout reservation was not found.");
}

async function persistOfferCheckout(
  admin: any,
  offerId: string,
  checkoutAttempt: string,
  session: Stripe.Checkout.Session,
  rate: CheckoutShippingRate,
) {
  const saved = await admin
    .from("listing_offers")
    .update({
      stripe_checkout_session_id: session.id,
      stripe_payment_status: "checkout_open",
      stripe_checkout_attempt: null,
      shipping_cents: rate.amountCents,
      shipping_rate_snapshot: rate,
    })
    .eq("id", offerId)
    .eq("stripe_checkout_attempt", checkoutAttempt)
    .select("id")
    .maybeSingle();
  if (!saved.error && saved.data?.id) return;

  try {
    const expired = await getStripe().checkout.sessions.expire(session.id);
    if (expired.status !== "expired") throw new Error("Stripe Session is still payable");
  } catch {
    throw new CheckoutReservationSyncError(
      "Offer Checkout started but could not be synchronized. No checkout link was released; ParkVault will reconcile the session before the offer can continue.",
    );
  }
  throw new Error(saved.error?.message ?? "Offer reservation was not found.");
}

export const startExactListingCheckout = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { askId: string; quoteId: string; rateId: string }) => ({
    askId: String(input.askId),
    quoteId: String(input.quoteId),
    rateId: String(input.rateId),
  }))
  .handler(async ({ data, context }) => {
    const { admin, quote, rate } = await loadQuote(
      context.userId,
      data.askId,
      data.quoteId,
      data.rateId,
    );
    const { data: ask } = await admin
      .from("asks")
      .select("price_cents,currency,seller_id,status,products(name)")
      .eq("id", data.askId)
      .maybeSingle();
    if (!ask) throw new Error("That listing is no longer available.");
    if (ask.seller_id === context.userId)
      throw new Error("This is your own listing, so it cannot be purchased from this account.");
    if (ask.status !== "active")
      throw new Error("This listing is no longer active. Refresh the page for current listings.");
    const { data: totals, error: totalsError } = await admin.rpc("compute_order_totals", {
      _merchandise_cents: ask.price_cents,
      _currency: ask.currency,
    });
    if (totalsError) throw new Error(totalsError.message);
    const { data: orderId, error } = await admin.rpc("reserve_exact_ask_for_stripe", {
      _ask_id: data.askId,
      _buyer_id: context.userId,
      _merchandise_cents: ask.price_cents,
      _shipping_cents: rate.amountCents,
      _shipping_address: quote.address,
      _shipping_rate: rate,
    });
    if (error) throw new Error(error.message);
    try {
      const session = await createCheckout({
        context,
        purpose: "purchase",
        merchandiseCents: ask.price_cents,
        buyerFeeCents: Number(totals.buyer_fee_cents),
        quoteId: data.quoteId,
        rate,
        shippingAddress: quote.address,
        orderId,
        productName: ask.products?.name ?? "ParkVault merchandise",
        captureMethod: "automatic",
      });
      await persistCheckoutReservation(admin, orderId as string, session);
      return { url: session.url!, orderId: orderId as string };
    } catch (checkoutError) {
      if (!(checkoutError instanceof CheckoutReservationSyncError)) {
        await admin.rpc("release_stripe_checkout_order", {
          _order_id: orderId,
          _note: "Checkout could not be started.",
        });
      }
      throw checkoutError;
    }
  });

export const startListingOfferCheckout = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (input: { askId: string; amountCents: number; quoteId: string; rateId: string }) => ({
      askId: String(input.askId),
      amountCents: Math.round(Number(input.amountCents)),
      quoteId: String(input.quoteId),
      rateId: String(input.rateId),
    }),
  )
  .handler(async ({ data, context }) => {
    const { admin, quote, rate } = await loadQuote(
      context.userId,
      data.askId,
      data.quoteId,
      data.rateId,
    );
    const { data: offerId, error } = await (context.supabase as any).rpc(
      "prepare_stripe_listing_offer",
      { _ask_id: data.askId, _amount_cents: data.amountCents },
    );
    if (error) throw new Error(error.message);
    const { data: checkoutAttempt, error: attemptError } = await admin.rpc(
      "begin_listing_offer_checkout",
      { _offer_id: offerId },
    );
    if (attemptError || !checkoutAttempt) {
      throw new Error(attemptError?.message ?? "Offer Checkout could not be reserved.");
    }
    try {
      const { data: offer, error: offerError } = await admin
        .from("listing_offers")
        .select("buyer_fee_cents,asks(products(name))")
        .eq("id", offerId)
        .single();
      if (offerError || !offer) {
        throw new Error(offerError?.message ?? "That offer is no longer available.");
      }
      const session = await createCheckout({
        context,
        purpose: "offer",
        merchandiseCents: data.amountCents,
        buyerFeeCents: Number(offer.buyer_fee_cents),
        quoteId: data.quoteId,
        rate,
        shippingAddress: quote.address,
        offerId,
        checkoutAttempt: String(checkoutAttempt),
        productName: offer.asks?.products?.name ?? "ParkVault merchandise",
        captureMethod: "manual",
      });
      await persistOfferCheckout(admin, offerId as string, String(checkoutAttempt), session, rate);
      return { url: session.url!, offerId: offerId as string };
    } catch (checkoutError) {
      if (!(checkoutError instanceof CheckoutReservationSyncError)) {
        await admin.rpc("fail_listing_offer_checkout", {
          _offer_id: offerId,
          _attempt: checkoutAttempt,
        });
      }
      throw checkoutError;
    }
  });

export const reconcileMyListingOfferCheckouts = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const admin = supabaseAdmin as any;
    const { data: offers, error } = await admin
      .from("listing_offers")
      .select("id")
      .eq("buyer_id", context.userId)
      .eq("status", "pending")
      .eq("payment_authorized", false)
      .not("stripe_checkout_session_id", "is", null)
      .limit(20);
    if (error) throw new Error(error.message);

    const { reconcileListingOfferCheckout } = await import("./stripe-marketplace.server");
    let authorized = 0;
    for (const offer of offers ?? []) {
      try {
        const result = await reconcileListingOfferCheckout(offer.id, context.userId);
        if (result === "authorized") authorized += 1;
      } catch {
        // The webhook may still be processing or Stripe may be temporarily
        // unavailable; leave the offer for the next page load or webhook retry.
      }
    }
    return { authorized };
  });

export const startCounterofferCheckout = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { offerId: string; quoteId: string; rateId: string }) => ({
    offerId: String(input.offerId),
    quoteId: String(input.quoteId),
    rateId: String(input.rateId),
  }))
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const admin = supabaseAdmin as any;
    const { data: offer } = await admin
      .from("listing_offers")
      .select("*,asks(products(name))")
      .eq("id", data.offerId)
      .eq("buyer_id", context.userId)
      .eq("status", "countered")
      .maybeSingle();
    if (!offer?.seller_counter_cents) throw new Error("That counteroffer is no longer available.");
    const { quote, rate } = await loadQuote(
      context.userId,
      offer.ask_id,
      data.quoteId,
      data.rateId,
    );
    const { data: totals } = await admin.rpc("compute_order_totals", {
      _merchandise_cents: offer.seller_counter_cents,
      _currency: offer.currency,
    });
    const { data: orderId, error } = await admin.rpc("reserve_exact_ask_for_stripe", {
      _ask_id: offer.ask_id,
      _buyer_id: context.userId,
      _merchandise_cents: offer.seller_counter_cents,
      _shipping_cents: rate.amountCents,
      _shipping_address: quote.address,
      _shipping_rate: rate,
      _offer_id: offer.id,
    });
    if (error) throw new Error(error.message);
    try {
      const session = await createCheckout({
        context,
        purpose: "counter",
        merchandiseCents: offer.seller_counter_cents,
        buyerFeeCents: Number(totals.buyer_fee_cents),
        quoteId: data.quoteId,
        rate,
        shippingAddress: quote.address,
        orderId,
        offerId: offer.id,
        productName: offer.asks?.products?.name ?? "ParkVault merchandise",
        captureMethod: "automatic",
      });
      await persistCheckoutReservation(admin, orderId as string, session);
      return { url: session.url!, orderId: orderId as string };
    } catch (checkoutError) {
      if (!(checkoutError instanceof CheckoutReservationSyncError)) {
        await admin.rpc("release_stripe_checkout_order", {
          _order_id: orderId,
          _note: "Counteroffer checkout could not be started.",
        });
      }
      throw checkoutError;
    }
  });

export async function cancelOfferAuthorization(paymentIntentId: string | null | undefined) {
  if (!paymentIntentId) return;
  try {
    await getStripe().paymentIntents.cancel(paymentIntentId);
  } catch {
    /* already captured/cancelled */
  }
}

export async function captureAuthorizedOffer(offerId: string, sellerId: string) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const admin = supabaseAdmin as any;
  const { data: reserved, error: reserveError } = await admin.rpc(
    "reserve_authorized_offer_for_capture",
    { _offer_id: offerId, _seller_id: sellerId },
  );
  if (reserveError) throw new Error(reserveError.message);

  const reservation = reserved as {
    order_id?: string;
    payment_intent_id?: string;
    amount_total?: number;
  } | null;
  const orderId = String(reservation?.order_id ?? "");
  const paymentIntentId = String(reservation?.payment_intent_id ?? "");
  if (!orderId || !paymentIntentId) {
    throw new Error("ParkVault could not create the offer capture reservation.");
  }

  const stripe = getStripe();
  let intent: Stripe.PaymentIntent;
  try {
    intent = await stripe.paymentIntents.capture(
      paymentIntentId,
      {},
      { idempotencyKey: `parkvault-offer-capture-${offerId}-${orderId}` },
    );
  } catch (captureError) {
    let current: Stripe.PaymentIntent;
    try {
      current = await stripe.paymentIntents.retrieve(paymentIntentId, {
        expand: ["latest_charge"],
      });
    } catch {
      throw new Error(
        "The item is safely reserved, but Stripe's capture status could not be confirmed. ParkVault support must review this order before retrying.",
      );
    }

    if (current.status === "succeeded") {
      intent = current;
    } else if (current.status === "requires_capture") {
      throw new Error(
        "Stripe did not complete the capture. The exact item is still reserved; use Retry capture on this offer.",
        { cause: captureError },
      );
    } else if (
      current.status === "canceled" ||
      current.status === "requires_payment_method" ||
      current.status === "requires_confirmation" ||
      current.status === "requires_action"
    ) {
      const { error: releaseError } = await admin.rpc(
        "release_authorized_offer_capture_reservation",
        {
          _offer_id: offerId,
          _order_id: orderId,
          _note: "The buyer authorization can no longer be captured.",
          _authorization_still_valid: false,
          _payment_status: current.status,
        },
      );
      if (releaseError) {
        throw new Error(
          `The authorization failed, but ParkVault could not release the listing reservation: ${releaseError.message}`,
        );
      }
      throw new Error("The buyer authorization can no longer be captured. Ask for a new offer.");
    } else {
      throw new Error(
        "The item is safely reserved while Stripe finishes processing the capture. Do not retry this offer yet.",
      );
    }
  }

  if (intent.id !== paymentIntentId || intent.status !== "succeeded") {
    throw new Error("The item is safely reserved, but Stripe has not confirmed the capture yet.");
  }
  const charge =
    typeof intent.latest_charge === "string"
      ? intent.latest_charge
      : (intent.latest_charge?.id ?? "");
  const { data: completedOrderId, error } = await admin.rpc("complete_captured_stripe_offer", {
    _offer_id: offerId,
    _charge: charge,
    _amount_total: intent.amount_received,
  });
  if (error)
    throw new Error(
      `Payment was captured and the exact listing remains reserved, but the order needs operator attention: ${error.message}`,
    );
  if (String(completedOrderId) !== orderId) {
    throw new Error("Payment was captured, but Stripe settled a different order reservation.");
  }
  const { emailOfferOutcome, emailOrderPaid } = await import("./email-notifications.server");
  await emailOfferOutcome(offerId, "accepted");
  await emailOrderPaid(orderId);
  return orderId;
}

export const acceptSecuredListingOffer = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { offerId: string }) => ({ offerId: String(input.offerId) }))
  .handler(async ({ data, context }) => ({
    orderId: await captureAuthorizedOffer(data.offerId, context.userId),
  }));

/**
 * Called when the buyer returns to their order from ParkVault Checkout.
 *
 * Only a party to the order can run it (RLS scopes the read), and settlement
 * itself is delegated to the same trusted routine the Stripe webhook uses.
 */
export const confirmOrderCheckout = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { orderId: string }) => ({ orderId: String(input.orderId) }))
  .handler(async ({ data, context }): Promise<{ state: "paid" | "pending" | "unavailable" }> => {
    const { data: order, error } = await context.supabase
      .from("orders")
      .select("id,buyer_id")
      .eq("id", data.orderId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!order || order.buyer_id !== context.userId) return { state: "unavailable" };

    const { reconcileOrderCheckout } = await import("./stripe-marketplace.server");
    try {
      return { state: await reconcileOrderCheckout(data.orderId) };
    } catch {
      // A Stripe outage must never break the buyer's confirmation page; the
      // webhook still settles the order.
      return { state: "pending" };
    }
  });

export const confirmSourcingBalanceCheckout = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { orderId: string }) => ({ orderId: String(input.orderId) }))
  .handler(async ({ data, context }): Promise<{ state: "paid" | "pending" | "unavailable" }> => {
    const { reconcileSourcingBalanceCheckout } = await import("./stripe-marketplace.server");
    try {
      return { state: await reconcileSourcingBalanceCheckout(data.orderId, context.userId) };
    } catch {
      return { state: "pending" };
    }
  });

/* ------------------------------------------------- Park Shopper: pay first */

/**
 * Delivery rates for a Park Shopper job.
 *
 * The parcel comes from the product's category preset and the ship-from
 * address comes from the shopper's own shipping setup — resolved inside the
 * database from the opaque option reference, so no shopper identity or address
 * is ever exposed to the browser.
 */
export const getSourcingShippingRates = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { variantId: string; optionRef: string; address: CheckoutAddress }) => ({
    variantId: String(input.variantId),
    optionRef: String(input.optionRef),
    address: validateAddress(input.address),
  }))
  .handler(
    async ({ data, context }): Promise<{ quoteId: string; rates: CheckoutShippingRate[] }> => {
      if (!stripeCheckoutReady()) {
        throw new Error(
          "Checkout is not fully configured yet — the Stripe secret key and webhook secret are required.",
        );
      }
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      const admin = supabaseAdmin as any;
      const { data: ctx, error: ctxError } = await admin.rpc("sourcing_option_shipment_context", {
        _variant_id: data.variantId,
        _option_ref: data.optionRef,
      });
      if (ctxError) throw new Error(ctxError.message);
      if (!ctx)
        throw new Error("That shopper is not available to source this variation right now.");
      const from = ctx.ship_from as Record<string, string | null>;
      const parcel =
        categoryParcelPresets[String(ctx.category_slug ?? "")] ??
        ({ length: 16, width: 12, height: 8, weight: 4 } as ParcelDimensions);

      const testRate = sandboxShippingRate();
      const shipment = serverEnv("SHIPPO_API_TOKEN")
        ? await shippoShipment({
            address_from: {
              name: from["name"],
              phone: from["phone"],
              street1: from["line1"],
              street2: from["line2"] || undefined,
              city: from["city"],
              state: from["region"],
              zip: from["postal_code"],
              country: from["country"] ?? "US",
            },
            address_to: {
              name: data.address.recipientName,
              street1: data.address.line1,
              street2: data.address.line2 || undefined,
              city: data.address.city,
              state: data.address.region,
              zip: data.address.postalCode,
              country: data.address.country,
            },
            parcels: [
              {
                length: String(parcel.length),
                width: String(parcel.width),
                height: String(parcel.height),
                distance_unit: "in",
                weight: String(parcel.weight),
                mass_unit: "lb",
              },
            ],
            metadata: `ParkVault sourcing ${data.variantId}`,
            async: false,
          })
        : null;
      if (!shipment && !testRate) {
        throw new Error(
          "Live delivery pricing needs a Shippo API token before checkout can start.",
        );
      }
      const rates = testRate
        ? [testRate]
        : (shipment?.rates ?? [])
            .filter((rate: any) => rate.object_id && rate.amount)
            .map((rate: any): CheckoutShippingRate => ({
              id: rate.object_id,
              carrier: rate.provider ?? "Carrier",
              service: rate.servicelevel?.name ?? rate.servicelevel?.token ?? "Tracked delivery",
              amountCents: Math.round(Number(rate.amount) * 100),
              currency: rate.currency ?? "USD",
              estimatedDays: rate.estimated_days == null ? null : Number(rate.estimated_days),
            }))
            .filter((rate: CheckoutShippingRate) => rate.currency === "USD")
            .sort(
              (a: CheckoutShippingRate, b: CheckoutShippingRate) => a.amountCents - b.amountCents,
            )
            .slice(0, 5);
      if (!rates.length)
        throw new Error("No tracked delivery rates were returned for this address.");

      const saved = await admin
        .from("checkout_shipping_quotes")
        .insert({
          buyer_id: context.userId,
          ask_id: null,
          variant_id: data.variantId,
          option_ref: data.optionRef,
          address: addressSnapshot(data.address),
          rates,
          provider_shipment_id: shipment?.object_id ?? "parkvault_sandbox",
        })
        .select("id")
        .single();
      if (saved.error) throw new Error(saved.error.message);
      return { quoteId: saved.data.id, rates };
    },
  );

/**
 * Park Shopper checkout. The buyer pays first: the item reference price, the
 * shopper's service fee, the ParkVault buyer fee and tracked delivery. The
 * shopper is only notified once Stripe confirms the payment.
 */
export const startSourcingCheckout = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (input: {
      variantId: string;
      optionRef: string;
      maxPurchaseCents: number;
      quoteId: string;
      rateId: string;
    }) => {
      const max = Math.round(Number(input.maxPurchaseCents));
      if (!Number.isFinite(max) || max < 100 || max > 5_000_000) {
        throw new Error("Approve a maximum purchase cost between $1.00 and $50,000.");
      }
      return {
        variantId: String(input.variantId),
        optionRef: String(input.optionRef),
        maxPurchaseCents: max,
        quoteId: String(input.quoteId),
        rateId: String(input.rateId),
      };
    },
  )
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const admin = supabaseAdmin as any;
    const { data: quote } = await admin
      .from("checkout_shipping_quotes")
      .select("*")
      .eq("id", data.quoteId)
      .eq("buyer_id", context.userId)
      .eq("variant_id", data.variantId)
      .gt("expires_at", new Date().toISOString())
      .maybeSingle();
    if (!quote) throw new Error("That delivery quote expired. Get fresh rates.");
    const rate = (quote.rates as CheckoutShippingRate[]).find((item) => item.id === data.rateId);
    if (!rate) throw new Error("Choose a delivery rate from the current quote.");

    const { data: orderId, error } = await admin.rpc("reserve_sourcing_order_for_stripe", {
      _variant_id: data.variantId,
      _option_ref: data.optionRef,
      _buyer_id: context.userId,
      _max_purchase_cents: data.maxPurchaseCents,
      _shipping_cents: rate.amountCents,
      _shipping_address: quote.address,
      _shipping_rate: rate,
    });
    if (error) throw new Error(error.message);

    try {
      const { data: order } = await admin
        .from("orders")
        .select("seller_id,merchandise_cents,buyer_fee_cents,products(name)")
        .eq("id", orderId)
        .single();
      const { requireShopperPayoutReady } = await import("./shopper-payout-readiness.server");
      await requireShopperPayoutReady(admin, order.seller_id);
      const session = await createCheckout({
        context,
        purpose: "sourcing",
        merchandiseCents: Number(order.merchandise_cents),
        buyerFeeCents: Number(order.buyer_fee_cents),
        quoteId: data.quoteId,
        rate,
        shippingAddress: quote.address,
        orderId,
        productName: order.products?.name ?? "ParkVault merchandise",
        captureMethod: "automatic",
      });
      await persistCheckoutReservation(admin, orderId as string, session);
      return { url: session.url!, orderId: orderId as string };
    } catch (checkoutError) {
      if (!(checkoutError instanceof CheckoutReservationSyncError)) {
        await admin.rpc("release_sourcing_checkout_order", {
          _order_id: orderId,
          _note: "Checkout could not be started, so no payment was taken.",
        });
      }
      throw checkoutError;
    }
  });

/** A separate post-delivery tip. The full selected amount is transferred to the shopper. */
export const startSourcingTipCheckout = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { orderId: string; amountCents: number }) => {
    const amountCents = Math.round(Number(input.amountCents));
    if (!Number.isFinite(amountCents) || amountCents < 100 || amountCents > 50_000) {
      throw new Error("Choose a tip between $1 and $500.");
    }
    return { orderId: String(input.orderId), amountCents };
  })
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const admin = supabaseAdmin as any;
    const { data: order } = await admin
      .from("orders")
      .select("id,buyer_id,seller_id,origin,status,currency,products(name)")
      .eq("id", data.orderId)
      .maybeSingle();
    if (
      !order ||
      order.buyer_id !== context.userId ||
      order.origin !== "sourcing_shopper" ||
      !["delivered", "completed"].includes(order.status)
    ) {
      throw new Error("Tips become available after a Park Shopper order is delivered.");
    }
    const { data: shopper } = await admin
      .from("shopper_service_profiles")
      .select("stripe_account_id,stripe_account_mode,stripe_payouts_enabled")
      .eq("shopper_id", order.seller_id)
      .maybeSingle();
    if (
      !shopper?.stripe_account_id ||
      !shopper.stripe_payouts_enabled ||
      !stripeAccountMatchesCurrentMode(shopper.stripe_account_mode)
    ) {
      throw new Error("This shopper's payout account is not ready for tips.");
    }
    const { data: prior } = await admin
      .from("sourcing_tips")
      .select("status,amount_cents,stripe_checkout_session_id")
      .eq("order_id", data.orderId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (prior?.status === "succeeded") throw new Error("You already tipped this shopper.");
    if (prior?.status === "pending" && prior.stripe_checkout_session_id) {
      const session = await getStripe().checkout.sessions.retrieve(
        prior.stripe_checkout_session_id,
      );
      if (session.status === "open" && session.url) {
        if (Number(prior.amount_cents) === data.amountCents) return { url: session.url };
        throw new Error("A different tip checkout is already open. Cancel it or let it expire.");
      }
      if (session.status === "complete")
        throw new Error("Your tip payment is processing. Please wait.");
      if (session.status === "expired") {
        const expired = await admin
          .from("sourcing_tips")
          .update({ status: "failed" })
          .eq("stripe_checkout_session_id", session.id)
          .eq("status", "pending");
        if (expired.error) throw new Error("Could not reconcile the expired tip checkout.");
      }
    }

    const request = getRequest();
    const origin = parkVaultOrigin(request?.url);
    const metadata = {
      parkvault_purpose: "sourcing_tip",
      parkvault_order_id: data.orderId,
      parkvault_tip_cents: String(data.amountCents),
    };
    const tipParams: Stripe.Checkout.SessionCreateParams = {
      mode: "payment",
      branding_settings: parkVaultCheckoutBranding,
      ...(customerEmail(context) ? { customer_email: customerEmail(context) as string } : {}),
      line_items: [
        {
          quantity: 1,
          price_data: {
            currency: String(order.currency ?? "USD").toLowerCase(),
            unit_amount: data.amountCents,
            tax_behavior: "exclusive",
            product_data: {
              name: "Tip for your Park Shopper",
              description: "100% of this tip goes to your shopper",
            },
          },
        },
      ],
      // A voluntary gratuity is not a taxable sale, so no tax is calculated.
      automatic_tax: { enabled: false },
      payment_method_types: ["card"],

      payment_intent_data: { metadata },
      metadata,
      success_url: `${origin}/orders/${data.orderId}?tip=success`,
      cancel_url: `${origin}/orders/${data.orderId}?tip=cancelled`,
      expires_at: Math.floor(Date.now() / 1000) + 30 * 60,
    };
    const reserved = await admin.rpc("begin_sourcing_tip_checkout", {
      _order_id: data.orderId,
      _buyer_id: context.userId,
      _amount_cents: data.amountCents,
      _params: tipParams,
    });
    if (reserved.error) throw new Error(reserved.error.message);
    const tip = reserved.data;
    if (tip.stripe_checkout_session_id) {
      const existing = await getStripe().checkout.sessions.retrieve(tip.stripe_checkout_session_id);
      if (existing.status === "open" && existing.url) return { url: existing.url };
      throw new Error("Your previous tip checkout is being reconciled. Please refresh.");
    }
    // Keep the exact first request and key across concurrent clicks and network retries.
    // Never recreate an uncertain session after Stripe's idempotency retention window.
    if (Date.now() - new Date(tip.created_at).getTime() > 23 * 60 * 60 * 1000) {
      throw new Error("This tip checkout needs operator reconciliation before retrying.");
    }
    const session = await getStripe().checkout.sessions.create(tip.stripe_create_params, {
      idempotencyKey: `parkvault-tip-checkout-${tip.id}`,
    });
    const saved = await admin
      .from("sourcing_tips")
      .update({ stripe_checkout_session_id: session.id })
      .eq("id", tip.id)
      .eq("status", "pending")
      .is("stripe_checkout_session_id", null);
    if (saved.error) throw new Error(saved.error.message);
    return { url: session.url! };
  });

/**
 * The shopper paid more in park than the reference estimate, but stayed inside
 * the buyer's approved maximum. The buyer pays exactly that difference — no
 * the fee adjustment tied to the actual receipt price and no new shipping.
 */
export const startSourcingBalanceCheckout = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { orderId: string }) => ({ orderId: String(input.orderId) }))
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const admin = supabaseAdmin as any;
    const { data: order } = await admin
      .from("orders")
      .select("id,buyer_id,origin,payment_authorized,products(name)")
      .eq("id", data.orderId)
      .maybeSingle();
    if (!order || order.buyer_id !== context.userId || order.origin !== "sourcing_shopper") {
      throw new Error("That shopping job is not available.");
    }
    if (!order.payment_authorized) throw new Error("This job has not been paid for yet.");
    const request = getRequest();
    const origin = parkVaultOrigin(request?.url);
    const stripe = getStripe();
    type Reservation = {
      checkout_id: string;
      attempt: number;
      session_id: string | null;
      status: string;
      amount_cents: number;
      currency: string;
    };
    const begin = async () => {
      const result = await admin.rpc("begin_sourcing_balance_checkout", {
        _order_id: data.orderId,
        _buyer_id: context.userId,
      });
      if (result.error) throw new Error(result.error.message);
      return result.data as Reservation;
    };

    let reservation = await begin();
    if (reservation.session_id) {
      const existing = await stripe.checkout.sessions.retrieve(reservation.session_id);
      if (existing.status === "open" && existing.url) return { url: existing.url };
      if (existing.status === "complete") {
        return { url: `${origin}/orders/${data.orderId}?checkout=balance-paid` };
      }
      const expired = await admin.rpc("expire_sourcing_balance_checkout", {
        _session_id: existing.id,
      });
      if (expired.error) throw new Error(expired.error.message);
      reservation = await begin();
    }

    const balance = Number(reservation.amount_cents ?? 0);
    if (balance <= 0) throw new Error("There is no balance to pay on this job.");
    const metadata = {
      parkvault_purpose: "sourcing_balance",
      parkvault_order_id: String(data.orderId),
      parkvault_balance_checkout_id: reservation.checkout_id,
      parkvault_balance_attempt: String(reservation.attempt),
    };
    const { data: originalAddress, error: addressError } = await admin
      .from("order_addresses")
      .select("recipient_name,line1,line2,city,region,postal_code,country")
      .eq("order_id", data.orderId)
      .single();
    if (addressError || !originalAddress)
      throw new Error("Original shipping address is unavailable.");
    // An order-scoped customer fixes tax location to the original delivery address.
    // Billing details entered later cannot overwrite this saved shipping address.
    const taxCustomer = await stripe.customers.create(
      {
        shipping: receiptShipping(originalAddress),
        metadata: { parkvault_order_id: data.orderId, parkvault_purpose: "receipt_balance" },
      },
      {
        idempotencyKey: `parkvault-balance-customer-${reservation.checkout_id}-${reservation.attempt}`,
      },
    );
    const proposedParams: Stripe.Checkout.SessionCreateParams = {
      mode: "payment",
      branding_settings: parkVaultCheckoutBranding,
      customer: taxCustomer.id,
      line_items: [
        {
          quantity: 1,
          price_data: {
            currency: String(reservation.currency ?? "USD").toLowerCase(),
            unit_amount: balance,
            tax_behavior: "exclusive",
            product_data: {
              name: `Approved balance — ${order.products?.name ?? "ParkVault merchandise"}`,
              tax_code: taxCodes.goods,
              description: "Difference between the estimate and the price your shopper paid",
            },
          },
        },
      ],
      // The saved customer shipping address controls tax, not the card billing address.
      billing_address_collection: "required",
      automatic_tax: { enabled: automaticTaxEnabled() },

      payment_method_types: ["card"],
      payment_intent_data: {
        capture_method: "automatic",
        description: "ParkVault sourcing balance",
        metadata,
      },
      metadata,
      expires_at: Math.floor(Date.now() / 1000) + 30 * 60,
      success_url: `${origin}/orders/${data.orderId}?checkout=balance-paid`,
      cancel_url: `${origin}/orders/${data.orderId}?checkout=cancelled`,
    };
    // Freeze the entire request, including expiry and return URLs. Stripe
    // rejects same-key retries when even one parameter differs.
    const prepared = await admin.rpc("prepare_sourcing_balance_checkout", {
      _checkout_id: reservation.checkout_id,
      _order_id: data.orderId,
      _buyer_id: context.userId,
      _attempt: reservation.attempt,
      _params: proposedParams,
    });
    if (prepared.error) throw new Error(prepared.error.message);
    const session = await stripe.checkout.sessions.create(
      prepared.data as Stripe.Checkout.SessionCreateParams,
      {
        idempotencyKey: `parkvault-sourcing-balance-${reservation.checkout_id}-${reservation.attempt}`,
      },
    );
    const recorded = await admin.rpc("record_sourcing_balance_checkout", {
      _checkout_id: reservation.checkout_id,
      _order_id: data.orderId,
      _buyer_id: context.userId,
      _attempt: reservation.attempt,
      _session_id: session.id,
      _expires_at: new Date(session.expires_at * 1000).toISOString(),
    });
    if (recorded.error) {
      // A concurrent request or webhook may already be using this same
      // session. Preserve it for an idempotent retry; never expire it here.
      throw new Error(recorded.error.message);
    }
    return { url: session.url! };
  });

/**
 * The shopper could not find the item. The buyer's payment is refunded in full
 * automatically — there is no operator step and no partial outcome.
 */
export const reportSourcingUnavailable = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { orderId: string; note?: string }) => ({
    orderId: String(input.orderId),
    note: String(input.note ?? "").slice(0, 400),
  }))
  .handler(async ({ data, context }) => {
    const { error } = await (context.supabase as any).rpc("shopper_mark_unavailable", {
      _order_id: data.orderId,
      _note: data.note || null,
    });
    if (error) throw new Error(error.message);

    const { emailSourcingUpdate } = await import("./email-notifications.server");
    await emailSourcingUpdate(data.orderId, "unavailable");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const admin = supabaseAdmin as any;
    const { data: order } = await admin
      .from("orders")
      .select("stripe_payment_intent_id,total_cents")
      .eq("id", data.orderId)
      .maybeSingle();
    if (!order?.stripe_payment_intent_id) {
      return { refunded: false as const };
    }
    try {
      const refund = await getStripe().refunds.create({
        payment_intent: order.stripe_payment_intent_id,
      });
      await admin.rpc("finalize_sourcing_refund", {
        _order_id: data.orderId,
        _refund_reference: refund.id,
        _amount_cents: Number(refund.amount ?? order.total_cents),
      });
      return { refunded: true as const };
    } catch {
      // The job is already marked unavailable and the buyer is notified; the
      // refund is retried by an operator rather than silently lost.
      return { refunded: false as const };
    }
  });
