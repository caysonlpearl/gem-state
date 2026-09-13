/* eslint-disable @typescript-eslint/no-explicit-any -- generated Supabase types lag the migration that adds sourcing tips */
import Stripe from "stripe";

import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { serverEnv } from "./runtime-env.server";
import { stripeAccountMatchesCurrentMode } from "./stripe-connect.server";

let stripeInstance: Stripe | null = null;
let stripeInstanceSecret = "";

export function getStripe(secretOverride?: string) {
  const secret = secretOverride ?? serverEnv("STRIPE_SECRET_KEY");
  if (!secret) throw new Error("ParkVault Checkout is not configured yet.");
  if (!stripeInstance || stripeInstanceSecret !== secret) {
    stripeInstance = new Stripe(secret, { appInfo: { name: "ParkVault", version: "1.0.0" } });
    stripeInstanceSecret = secret;
  }
  return stripeInstance;
}

function runtimeSecret(runtimeEnv: unknown, name: string) {
  if (runtimeEnv && typeof runtimeEnv === "object") {
    const value = (runtimeEnv as Record<string, unknown>)[name];
    if (typeof value === "string") return value;
  }
  return serverEnv(name);
}

function runtimeSecretCandidates(runtimeEnv: unknown, name: string) {
  const values: string[] = [];
  if (runtimeEnv && typeof runtimeEnv === "object") {
    const runtimeValue = (runtimeEnv as Record<string, unknown>)[name];
    if (typeof runtimeValue === "string") values.push(runtimeValue);
  }
  const processValue = serverEnv(name);
  if (processValue) values.push(processValue);

  return [
    ...new Set(
      values.flatMap((value) => {
        const trimmed = value.trim();
        const unquoted =
          trimmed.length >= 2 &&
          ((trimmed.startsWith('"') && trimmed.endsWith('"')) ||
            (trimmed.startsWith("'") && trimmed.endsWith("'")))
            ? trimmed.slice(1, -1)
            : trimmed;
        return [value, trimmed, unquoted].filter(Boolean);
      }),
    ),
  ];
}

export function parkVaultOrigin(requestUrl?: string) {
  const configured = serverEnv("PARKVAULT_SITE_URL");
  const requestOrigin = requestUrl ? new URL(requestUrl).origin : "";
  const stripeSecret = serverEnv("STRIPE_SECRET_KEY").trim();
  const requestHost = requestOrigin ? new URL(requestOrigin).hostname : "";
  const isLovablePreview =
    requestHost === "preview--parkvault.lovable.app" ||
    (requestHost.endsWith(".lovable.app") && requestHost.includes("preview"));

  // Test checkouts started from the Lovable preview must return to that same preview.
  // Live Stripe sessions still use the configured production origin, and arbitrary
  // request hosts are never allowed to override the configured site URL.
  const origin =
    stripeSecret.startsWith("sk_test_") && isLovablePreview
      ? requestOrigin
      : configured || requestOrigin;
  if (!origin.startsWith("https://"))
    throw new Error("ParkVault Checkout requires the live HTTPS URL.");
  return origin.replace(/\/$/, "");
}

export function stripeCheckoutReady() {
  return Boolean(
    serverEnv("STRIPE_SECRET_KEY") &&
    (serverEnv("STRIPE_WEBHOOK_SECRET") || serverEnv("STRIPE_CONNECT_WEBHOOK_SECRET")),
  );
}

type AddressSnapshot = {
  recipient_name: string;
  line1: string;
  line2: string;
  city: string;
  region: string;
  postal_code: string;
  country: string;
};

function sessionAddress(session: Stripe.Checkout.Session, fallback: AddressSnapshot) {
  const legacySession = session as unknown as {
    shipping_details?: {
      name?: string | null;
      address?: Stripe.Address | null;
    } | null;
  };
  const details = legacySession.shipping_details ?? session.collected_information?.shipping_details;
  const address = details?.address;
  if (!address) return fallback;
  return {
    recipient_name: details?.name || fallback.recipient_name,
    line1: address.line1 || fallback.line1,
    line2: address.line2 || "",
    city: address.city || fallback.city,
    region: address.state || fallback.region,
    postal_code: address.postal_code || fallback.postal_code,
    country: address.country || fallback.country,
  };
}

async function retrievePaymentIntent(stripe: Stripe, id: string) {
  return stripe.paymentIntents.retrieve(id, { expand: ["latest_charge"] });
}

function latestCharge(paymentIntent: Stripe.PaymentIntent) {
  return typeof paymentIntent.latest_charge === "string"
    ? paymentIntent.latest_charge
    : (paymentIntent.latest_charge?.id ?? "");
}

function captureBefore(paymentIntent: Stripe.PaymentIntent) {
  const charge =
    typeof paymentIntent.latest_charge === "string" ? null : paymentIntent.latest_charge;
  const card = charge?.payment_method_details?.card;
  const timestamp = card?.capture_before;
  return timestamp
    ? new Date(timestamp * 1000).toISOString()
    : new Date(Date.now() + 4 * 864e5).toISOString();
}

async function releaseCompetingOfferAuthorizations(
  stripe: Stripe,
  orderId: string,
  acceptedOfferId = "",
) {
  const admin = supabaseAdmin as any;
  const { data: order, error: orderError } = await admin
    .from("orders")
    .select("ask_id")
    .eq("id", orderId)
    .maybeSingle();
  if (orderError) throw new Error(orderError.message);
  if (!order?.ask_id) return;

  let offersQuery = admin
    .from("listing_offers")
    .select("id,stripe_checkout_session_id,stripe_payment_intent_id")
    .eq("ask_id", order.ask_id)
    .eq("stripe_payment_status", "cancel_pending");
  if (acceptedOfferId) offersQuery = offersQuery.neq("id", acceptedOfferId);
  const { data: offers, error: offersError } = await offersQuery;
  if (offersError) throw new Error(offersError.message);

  for (const offer of offers ?? []) {
    let paymentIntentId = String(offer.stripe_payment_intent_id ?? "");
    const sessionId = String(offer.stripe_checkout_session_id ?? "");
    if (!paymentIntentId && sessionId) {
      const session = await stripe.checkout.sessions.retrieve(sessionId);
      if (session.status === "open") {
        await stripe.checkout.sessions.expire(session.id);
      }
      paymentIntentId =
        typeof session.payment_intent === "string"
          ? session.payment_intent
          : (session.payment_intent?.id ?? "");
    }
    if (!paymentIntentId) {
      const saved = await admin
        .from("listing_offers")
        .update({ payment_authorized: false, stripe_payment_status: "canceled" })
        .eq("id", offer.id)
        .eq("stripe_payment_status", "cancel_pending");
      if (saved.error) throw new Error(saved.error.message);
      continue;
    }
    const intent = await stripe.paymentIntents.retrieve(paymentIntentId);
    if (intent.status === "succeeded") {
      throw new Error(
        `Competing offer ${offer.id} was already captured; operator review required.`,
      );
    }
    if (intent.status !== "canceled") {
      await stripe.paymentIntents.cancel(
        intent.id,
        {},
        { idempotencyKey: `parkvault-losing-offer-release-${intent.id}` },
      );
    }
    const saved = await admin
      .from("listing_offers")
      .update({ payment_authorized: false, stripe_payment_status: "canceled" })
      .eq("id", offer.id)
      .eq("stripe_payment_status", "cancel_pending");
    if (saved.error) throw new Error(saved.error.message);
  }
}

async function finalizeCheckoutSession(stripe: Stripe, session: Stripe.Checkout.Session) {
  // Generated database types are refreshed after migrations are applied.
  const admin = supabaseAdmin as any;
  const purpose = session.metadata?.["parkvault_purpose"] ?? "";
  const orderId = session.metadata?.["parkvault_order_id"] ?? "";
  const offerId = session.metadata?.["parkvault_offer_id"] ?? "";
  const quoteId = session.metadata?.["parkvault_quote_id"] ?? "";
  if (!session.payment_intent) return;

  if (purpose === "sourcing_tip" && orderId) {
    const tipIntent = await retrievePaymentIntent(stripe, String(session.payment_intent));
    if (tipIntent.status !== "succeeded") return;
    const amountCents = Number(session.amount_total ?? tipIntent.amount ?? 0);
    const expectedCents = Number(session.metadata?.["parkvault_tip_cents"] ?? 0);
    if (amountCents < 100 || amountCents !== expectedCents) {
      throw new Error("Tip total does not match ParkVault checkout.");
    }
    let tipQuery = admin
      .from("sourcing_tips")
      .select("id,shopper_id,status,stripe_transfer_id")
      .eq("order_id", orderId);
    const tipId = session.metadata?.["parkvault_tip_id"];
    tipQuery = tipId
      ? tipQuery.eq("id", tipId)
      : tipQuery.eq("stripe_checkout_session_id", session.id);
    const { data: tip } = await tipQuery.maybeSingle();
    if (!tip) throw new Error("Tip checkout was not found.");
    const claimed = await admin.rpc("claim_sourcing_tip_payment", {
      _tip_id: tip.id,
      _order_id: orderId,
      _session_id: session.id,
      _intent_id: tipIntent.id,
      _amount_cents: amountCents,
    });
    if (claimed.error) throw new Error(claimed.error.message);
    if (!claimed.data) {
      await stripe.refunds.create(
        {
          payment_intent: tipIntent.id,
          metadata: { parkvault_order_id: orderId, parkvault_purpose: "duplicate_tip_refund" },
        },
        { idempotencyKey: `parkvault-duplicate-tip-refund-${tipIntent.id}` },
      );
      return;
    }
    if (tip.status === "succeeded" && tip.stripe_transfer_id) return;
    const { data: shopper } = await admin
      .from("shopper_service_profiles")
      .select("stripe_account_id,stripe_account_mode,stripe_payouts_enabled")
      .eq("shopper_id", tip.shopper_id)
      .maybeSingle();
    if (
      !shopper?.stripe_account_id ||
      !shopper.stripe_payouts_enabled ||
      !stripeAccountMatchesCurrentMode(shopper.stripe_account_mode)
    ) {
      throw new Error("The shopper's Stripe payout account is not ready.");
    }
    const { sendOrderTransfer } = await import("./stripe-payout.server");
    const transfer = await sendOrderTransfer(stripe, {
      orderId,
      orderNumber: `PV-TIP-${tip.id}`,
      amountCents,
      currency: String(session.currency ?? "usd"),
      destination: shopper.stripe_account_id,
      ...(latestCharge(tipIntent) ? { sourceCharge: latestCharge(tipIntent) } : {}),
      live: session.livemode,
      checkoutSessionId: session.id,
      primaryPaymentIntentId: tipIntent.id,
      paymentIntentIds: [tipIntent.id],
      transferIdempotencyKey: `parkvault-sourcing-tip-${session.id}`,
    });
    const { error } = await admin.rpc("finalize_sourcing_tip", {
      _order_id: orderId,
      _checkout_session: session.id,
      _payment_intent: tipIntent.id,
      _transfer: transfer.id,
      _amount_cents: amountCents,
    });
    if (error) throw new Error(error.message);
    return;
  }

  if (purpose === "sourcing_balance" && orderId) {
    const balanceIntent = await retrievePaymentIntent(stripe, String(session.payment_intent));
    if (balanceIntent.status !== "succeeded") return;
    const amountCents = Number(session.amount_total ?? balanceIntent.amount ?? 0);
    const { data: outcome, error } = await admin.rpc("finalize_sourcing_balance_payment", {
      _order_id: orderId,
      _checkout_session: session.id,
      _payment_intent: balanceIntent.id,
      _charge: latestCharge(balanceIntent),
      _amount_cents: amountCents,
      _tax_cents: Number(session.total_details?.amount_tax ?? 0),
    });
    if (error) throw new Error(error.message);
    if (outcome === "duplicate") {
      const requestedRefund = await stripe.refunds.create(
        {
          payment_intent: balanceIntent.id,
          amount: amountCents,
          metadata: {
            parkvault_order_id: orderId,
            parkvault_purpose: "duplicate_sourcing_balance_refund",
          },
        },
        { idempotencyKey: `parkvault-duplicate-balance-refund-${session.id}` },
      );
      const refund = await stripe.refunds.retrieve(requestedRefund.id);
      if (refund.status !== "succeeded") {
        throw new Error(
          `Stripe duplicate-payment refund ${refund.id} is ${refund.status ?? "pending"}; retry the webhook after Stripe finishes it.`,
        );
      }
      const recorded = await admin.rpc("record_duplicate_sourcing_balance_refund", {
        _order_id: orderId,
        _checkout_session: session.id,
        _payment_intent: balanceIntent.id,
        _refund_id: refund.id,
        _amount_cents: Number(refund.amount ?? amountCents),
      });
      if (recorded.error) throw new Error(recorded.error.message);
    }
    return;
  }
  if (!quoteId) return;

  const { data: quote } = await supabaseAdmin
    .from("checkout_shipping_quotes")
    .select("address,rates")
    .eq("id", quoteId)
    .maybeSingle();
  if (!quote) throw new Error("Stripe checkout shipping quote not found.");
  const paymentIntent = await retrievePaymentIntent(stripe, String(session.payment_intent));
  const taxCents = Number(session.total_details?.amount_tax ?? 0);
  const amountTotal = Number(session.amount_total ?? paymentIntent.amount ?? 0);
  const rate = JSON.parse(session.metadata?.["parkvault_shipping_rate"] ?? "{}") as Record<
    string,
    unknown
  >;
  const fallback = quote.address as AddressSnapshot;
  const address = sessionAddress(session, fallback);

  if (purpose === "offer") {
    if (paymentIntent.status !== "requires_capture") return;
    const { error } = await supabaseAdmin.rpc("finalize_stripe_offer_authorization", {
      _offer_id: offerId,
      _checkout_session: session.id,
      _payment_intent: paymentIntent.id,
      _charge: latestCharge(paymentIntent),
      _shipping_cents: Number(rate["amountCents"] ?? 0),
      _tax_cents: taxCents,
      _amount_total: amountTotal,
      _authorization_expires_at: captureBefore(paymentIntent),
      _address: address as unknown as never,
      _shipping_rate: rate as unknown as never,
    });
    if (error) throw new Error(error.message);
    return;
  }

  if (purpose === "sourcing" && orderId) {
    if (paymentIntent.status !== "succeeded") return;
    const { error } = await supabaseAdmin.rpc("finalize_stripe_order_payment", {
      _order_id: orderId,
      _checkout_session: session.id,
      _payment_intent: paymentIntent.id,
      _charge: latestCharge(paymentIntent),
      _amount_total: amountTotal,
      _tax_cents: taxCents,
      _payment_status: paymentIntent.status,
    });
    if (error) throw new Error(error.message);
    const { emailOrderPaid } = await import("./email-notifications.server");
    await emailOrderPaid(orderId);
    return;
  }

  if ((purpose === "purchase" || purpose === "counter") && orderId) {
    if (paymentIntent.status !== "succeeded") return;
    const { error } = await supabaseAdmin.rpc("finalize_stripe_order_payment", {
      _order_id: orderId,
      _checkout_session: session.id,
      _payment_intent: paymentIntent.id,
      _charge: latestCharge(paymentIntent),
      _amount_total: amountTotal,
      _tax_cents: taxCents,
      _payment_status: paymentIntent.status,
      ...(offerId ? { _offer_id: offerId } : {}),
    });
    if (error) throw new Error(error.message);
    await releaseCompetingOfferAuthorizations(stripe, orderId, offerId);
    const { emailOrderPaid } = await import("./email-notifications.server");
    await emailOrderPaid(orderId);
  }
}

async function expireCheckoutSession(session: Stripe.Checkout.Session) {
  // Generated database types are refreshed after migrations are applied.
  const admin = supabaseAdmin as any;
  const orderId = session.metadata?.["parkvault_order_id"] ?? "";
  const offerId = session.metadata?.["parkvault_offer_id"] ?? "";
  if (orderId && (session.metadata?.["parkvault_purpose"] ?? "") === "sourcing_tip") {
    await admin
      .from("sourcing_tips")
      .update({ status: "failed" })
      .eq("order_id", orderId)
      .eq("stripe_checkout_session_id", session.id)
      .eq("status", "pending");
    return;
  }
  if (orderId && (session.metadata?.["parkvault_purpose"] ?? "") === "sourcing") {
    await supabaseAdmin.rpc("release_sourcing_checkout_order", {
      _order_id: orderId,
      _note: "ParkVault Checkout expired before payment was completed.",
    });
    return;
  }
  if (orderId && (session.metadata?.["parkvault_purpose"] ?? "") === "sourcing_balance") {
    await admin.rpc("expire_sourcing_balance_checkout", {
      _session_id: session.id,
    });
    return;
  }
  if (orderId) {
    await supabaseAdmin.rpc("release_stripe_checkout_order", {
      _order_id: orderId,
      _note: "ParkVault Checkout expired before payment was completed.",
    });
  }
  if (offerId) {
    await supabaseAdmin
      .from("listing_offers")
      .update({ stripe_payment_status: "checkout_expired", payment_authorized: false })
      .eq("id", offerId)
      .eq("payment_authorized", false);
  }
}

async function syncConnectedAccount(account: Stripe.Account) {
  const status = {
    stripe_details_submitted: account.details_submitted,
    stripe_charges_enabled: account.charges_enabled,
    stripe_payouts_enabled: account.payouts_enabled,
    stripe_status_checked_at: new Date().toISOString(),
  };
  await Promise.all([
    supabaseAdmin.from("seller_profiles").update(status).eq("stripe_account_id", account.id),
    supabaseAdmin
      .from("shopper_service_profiles")
      .update(status)
      .eq("stripe_account_id", account.id),
  ]);
}

async function releaseFailedOfferCapture(intent: Stripe.PaymentIntent) {
  const admin = supabaseAdmin as any;
  const offerId = intent.metadata?.["parkvault_offer_id"] ?? "";
  if (!offerId || intent.metadata?.["parkvault_purpose"] !== "offer") return;

  const { data: order } = await admin
    .from("orders")
    .select("id")
    .eq("stripe_payment_intent_id", intent.id)
    .eq("status", "awaiting_payment")
    .maybeSingle();

  if (order?.id) {
    const { error } = await admin.rpc("release_authorized_offer_capture_reservation", {
      _offer_id: offerId,
      _order_id: order.id,
      _note: "Stripe confirmed that the buyer authorization can no longer be captured.",
      _authorization_still_valid: false,
      _payment_status: intent.status,
    });
    if (error) throw new Error(error.message);
    return;
  }

  await admin
    .from("listing_offers")
    .update({ payment_authorized: false, stripe_payment_status: intent.status })
    .eq("id", offerId)
    .neq("status", "accepted");
}

export async function handleStripeWebhook(request: Request, runtimeEnv?: unknown) {
  const secrets = [
    ...runtimeSecretCandidates(runtimeEnv, "STRIPE_WEBHOOK_SECRET"),
    ...runtimeSecretCandidates(runtimeEnv, "STRIPE_CONNECT_WEBHOOK_SECRET"),
  ];
  if (!secrets.length) return new Response("Webhook not configured", { status: 503 });
  const stripeSecret = runtimeSecret(runtimeEnv, "STRIPE_SECRET_KEY");
  if (!stripeSecret) return new Response("Stripe API not configured", { status: 503 });
  const stripe = getStripe(stripeSecret);
  const signature = request.headers.get("stripe-signature");
  if (!signature) return new Response("Missing signature", { status: 400 });
  const rawBody = await request.text();
  let event: Stripe.Event | null = null;
  for (const secret of secrets) {
    try {
      event = await stripe.webhooks.constructEventAsync(rawBody, signature, secret);
      break;
    } catch {
      // Stripe assigns a different signing secret to each webhook destination.
    }
  }
  if (!event) return new Response("Invalid signature", { status: 400 });

  const inserted = await supabaseAdmin
    .from("stripe_webhook_events")
    .insert({ stripe_event_id: event.id, event_type: event.type })
    .select("id")
    .maybeSingle();
  if (inserted.error?.code === "23505") {
    const { data: prior } = await supabaseAdmin
      .from("stripe_webhook_events")
      .select("processed_at")
      .eq("stripe_event_id", event.id)
      .maybeSingle();
    if (prior?.processed_at) return new Response("ok");
  }
  // A failed first delivery already owns the log row. Stripe's retry must be
  // allowed to process that same event again instead of getting stuck on the
  // unique event id forever.
  if (inserted.error && inserted.error.code !== "23505") {
    return new Response("Webhook log unavailable", { status: 500 });
  }

  try {
    switch (event.type) {
      case "checkout.session.completed":
      case "checkout.session.async_payment_succeeded":
        await finalizeCheckoutSession(stripe, event.data.object as Stripe.Checkout.Session);
        break;
      case "checkout.session.expired":
        await expireCheckoutSession(event.data.object as Stripe.Checkout.Session);
        break;
      case "account.updated":
        await syncConnectedAccount(event.data.object as Stripe.Account);
        break;
      case "payment_intent.succeeded": {
        const intent = event.data.object as Stripe.PaymentIntent;
        const offerId = intent.metadata?.["parkvault_offer_id"] ?? "";
        if (intent.metadata?.["parkvault_purpose"] === "offer" && offerId) {
          const { data: orderId, error } = await supabaseAdmin.rpc(
            "complete_captured_stripe_offer",
            {
              _offer_id: offerId,
              _charge: latestCharge(intent),
              _amount_total: intent.amount_received,
            },
          );
          if (error) throw new Error(error.message);
          await releaseCompetingOfferAuthorizations(stripe, orderId as string, offerId);
          const { emailOfferOutcome, emailOrderPaid } =
            await import("./email-notifications.server");
          await emailOfferOutcome(offerId, "accepted");
          await emailOrderPaid(orderId as string);
        }
        break;
      }
      case "payment_intent.canceled": {
        const intent = event.data.object as Stripe.PaymentIntent;
        await releaseFailedOfferCapture(intent);
        break;
      }
      case "payment_intent.payment_failed": {
        const intent = event.data.object as Stripe.PaymentIntent;
        await releaseFailedOfferCapture(intent);
        break;
      }
      default:
        break;
    }
    await supabaseAdmin
      .from("stripe_webhook_events")
      .update({ processed_at: new Date().toISOString() })
      .eq("stripe_event_id", event.id);
    return new Response("ok");
  } catch (error) {
    await supabaseAdmin
      .from("stripe_webhook_events")
      .update({ error: error instanceof Error ? error.message.slice(0, 1000) : "Unknown error" })
      .eq("stripe_event_id", event.id);
    return new Response("Webhook processing failed", { status: 500 });
  }
}

/**
 * Buyer-facing confirmation path.
 *
 * Stripe's webhook remains the primary settlement signal. When the buyer
 * returns from Checkout we retrieve their session directly and run the same
 * `finalize_stripe_order_payment` routine, so a delayed or undelivered webhook
 * never leaves a paid buyer looking at "awaiting payment". Both paths converge
 * on one paid order: the function returns early once the order is already
 * settled, and the underlying SQL is guarded by a payment-intent match.
 */
export async function reconcileOrderCheckout(
  orderId: string,
): Promise<"paid" | "pending" | "unavailable"> {
  const { data: order } = await supabaseAdmin
    .from("orders")
    .select("id,status,payment_authorized,stripe_checkout_session_id")
    .eq("id", orderId)
    .maybeSingle();
  if (!order) return "unavailable";
  if (order.payment_authorized) return "paid";
  const sessionId = (order as { stripe_checkout_session_id?: string | null })
    .stripe_checkout_session_id;
  if (!sessionId) return "pending";

  const stripe = getStripe();
  const session = await stripe.checkout.sessions.retrieve(sessionId);
  if (session.payment_status !== "paid" && session.status !== "complete") return "pending";
  await finalizeCheckoutSession(stripe, session);

  const { data: settled } = await supabaseAdmin
    .from("orders")
    .select("payment_authorized")
    .eq("id", orderId)
    .maybeSingle();
  return settled?.payment_authorized ? "paid" : "pending";
}

/**
 * Buyer-return fallback for a Park Shopper receipt-balance payment. The
 * webhook is primary, but this closes the same payment if the webhook is late.
 */
export async function reconcileSourcingBalanceCheckout(
  orderId: string,
  buyerId: string,
): Promise<"paid" | "pending" | "unavailable"> {
  const admin = supabaseAdmin as any;
  const [{ data: order }, { data: assignment }, { data: checkout }] = await Promise.all([
    admin.from("orders").select("id,buyer_id,origin").eq("id", orderId).maybeSingle(),
    admin
      .from("sourcing_assignments")
      .select("balance_due_cents")
      .eq("order_id", orderId)
      .maybeSingle(),
    admin
      .from("sourcing_balance_checkouts")
      .select("stripe_checkout_session_id")
      .eq("order_id", orderId)
      .maybeSingle(),
  ]);
  if (!order || order.buyer_id !== buyerId || order.origin !== "sourcing_shopper") {
    return "unavailable";
  }
  if (Number(assignment?.balance_due_cents ?? 0) <= 0) return "paid";
  if (!checkout?.stripe_checkout_session_id) return "pending";

  const stripe = getStripe();
  const session = await stripe.checkout.sessions.retrieve(checkout.stripe_checkout_session_id);
  if (session.payment_status !== "paid" && session.status !== "complete") return "pending";
  await finalizeCheckoutSession(stripe, session);
  const { data: settled } = await admin
    .from("sourcing_assignments")
    .select("balance_due_cents")
    .eq("order_id", orderId)
    .maybeSingle();
  return Number(settled?.balance_due_cents ?? 0) <= 0 ? "paid" : "pending";
}
