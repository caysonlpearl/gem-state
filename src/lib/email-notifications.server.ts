/**
 * Server-only email notifications.
 *
 * Every in-app notification a member cares about has a matching email here.
 * Sends are best-effort: a failing email never breaks the order, listing or
 * offer action that triggered it. Suppression, retries and unsubscribe are
 * handled by the platform — nothing about that is stored in ParkVault.
 */

import { sendTemplateEmail } from "./email-templates/send-email";

export type OrderEmailContext = {
  orderId: string;
  orderNumber: string;
  buyerId: string | null;
  sellerId: string | null;
  origin: string;
  currency: string;
  totalCents: number;
  payoutCents: number;
  isDemo: boolean;
  itemName: string;
  orderPath: string;
};

async function admin() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin as any;
}

/** Resolves a member's login email. Returns null when it cannot be read. */
async function memberEmail(userId: string | null | undefined): Promise<string | null> {
  if (!userId) return null;
  try {
    const client = await admin();
    const { data, error } = await client.auth.admin.getUserById(userId);
    if (error) return null;
    const email = data?.user?.email;
    return typeof email === "string" && email.includes("@") ? email : null;
  } catch {
    return null;
  }
}

/** Order facts every order email needs, resolved once with privileged access. */
export async function loadOrderEmailContext(orderId: string): Promise<OrderEmailContext | null> {
  try {
    const client = await admin();
    const { data: order } = await client
      .from("orders")
      .select(
        "id, order_number, buyer_id, seller_id, origin, currency, total_cents, payout_cents, is_demo, product_id, variant_id",
      )
      .eq("id", orderId)
      .maybeSingle();
    if (!order) return null;

    let itemName = "";
    if (order.product_id) {
      const { data: product } = await client
        .from("products")
        .select("name")
        .eq("id", order.product_id)
        .maybeSingle();
      itemName = product?.name ?? "";
    }
    if (order.variant_id) {
      const { data: variant } = await client
        .from("product_variants")
        .select("sku_label")
        .eq("id", order.variant_id)
        .maybeSingle();
      const label = variant?.sku_label ?? "";
      if (label && itemName) itemName = `${itemName} — ${label}`;
    }

    return {
      orderId: order.id,
      orderNumber: order.order_number,
      buyerId: order.buyer_id ?? null,
      sellerId: order.seller_id ?? null,
      origin: String(order.origin ?? ""),
      currency: String(order.currency ?? "USD"),
      totalCents: Number(order.total_cents ?? 0),
      payoutCents: Number(order.payout_cents ?? 0),
      isDemo: order.is_demo === true,
      itemName,
      orderPath: `/orders/${order.id}`,
    };
  } catch (error) {
    console.error("Could not load order email context", error);
    return null;
  }
}

/** Sends one template to one member. Never throws. */
export async function emailMember(
  userId: string | null | undefined,
  templateName: string,
  templateData: Record<string, unknown>,
  idempotencyKey: string,
  options?: { replyTo?: string },
): Promise<void> {
  try {
    const to = await memberEmail(userId);
    if (!to) return;
    await sendTemplateEmail(templateName, to, {
      templateData,
      idempotencyKey,
      ...(options?.replyTo ? { replyTo: options.replyTo } : {}),
    });
  } catch (error) {
    // Delivery problems are platform-side; the in-app notification already
    // recorded the event, so the member is never left without the update.
    console.error(`Notification email '${templateName}' was not delivered`, error);
  }
}

/** Sends a preference-aware alert for a two-way marketplace conversation. */
export async function emailMarketplaceMessage(
  conversationId: string,
  senderId: string,
  messageId?: string,
): Promise<void> {
  try {
    const client = await admin();
    const { data: conversation } = await client
      .from("conversations")
      .select("id,buyer_id,seller_id,listing_id,asks(products(name))")
      .eq("id", conversationId)
      .maybeSingle();
    if (!conversation) return;

    const recipientId = conversation.buyer_id === senderId ? conversation.seller_id : conversation.buyer_id;
    const { data: preferences } = await client
      .from("account_notification_preferences")
      .select("message_alerts")
      .eq("user_id", recipientId)
      .maybeSingle();
    if (preferences?.message_alerts === false) return;

    let latestMessageQuery = client
      .from("conversation_messages")
      .select("id,body")
    const { data: latestMessage } = await (messageId
      ? latestMessageQuery.eq("id", messageId).maybeSingle()
      : latestMessageQuery
          .eq("conversation_id", conversationId)
          .eq("sender_id", senderId)
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle());

    await emailMember(
      recipientId,
      "marketplace-message",
      {
        itemName: conversation.asks?.products?.name ?? "Marketplace listing",
        message: latestMessage?.body ?? "You have a new marketplace message.",
        conversationPath: `/account?section=messages&conversation=${conversationId}`,
      },
      `conversation-message-${latestMessage?.id ?? `${conversationId}-${senderId}`}`,
    );
  } catch (error) {
    console.error("Marketplace message email was not delivered", error);
  }
}

/** Sends a preference-aware alert for a new saved-search match. */
export async function emailSavedSearchMatch(
  userId: string,
  data: { searchName: string; itemName: string; price?: string; listingPath: string },
  matchId: string,
): Promise<void> {
  try {
    const client = await admin();
    const { data: preferences } = await client
      .from("account_notification_preferences")
      .select("saved_search_matches")
      .eq("user_id", userId)
      .maybeSingle();
    if (preferences?.saved_search_matches === false) return;
    await emailMember(userId, "saved-search-match", data, `saved-search-match-${matchId}`);
  } catch (error) {
    console.error("Saved-search email was not delivered", error);
  }
}

/** Seller email when a buyer sends a message about an exact classified listing. */
export async function emailListingInquiry(inquiryId: string): Promise<void> {
  try {
    const client = await admin();
    const { data: inquiry } = await client
      .from("listing_inquiries")
      .select("id,seller_id,buyer_name,buyer_email,message,listing_id,asks(products(name))")
      .eq("id", inquiryId)
      .maybeSingle();
    if (!inquiry?.seller_id) return;

    const listingTitle = inquiry.asks?.products?.name ?? "your listing";
    await emailMember(
      inquiry.seller_id,
      "listing-inquiry-received",
      {
        itemName: listingTitle,
        buyerName: inquiry.buyer_name,
        message: inquiry.message,
      },
      `listing-inquiry-${inquiry.id}`,
      { replyTo: inquiry.buyer_email },
    );
  } catch (error) {
    console.error("Listing inquiry email was not delivered", error);
  }
}

/** Emails both sides of a paid order: buyer receipt plus seller/shopper job. */
export async function emailOrderPaid(orderId: string): Promise<void> {
  const ctx = await loadOrderEmailContext(orderId);
  if (!ctx || ctx.isDemo) return;
  const sourcing = ctx.origin.startsWith("sourcing");

  await emailMember(
    ctx.buyerId,
    "purchase-confirmed",
    {
      itemName: ctx.itemName,
      orderNumber: ctx.orderNumber,
      totalCents: ctx.totalCents,
      currency: ctx.currency,
      orderPath: ctx.orderPath,
    },
    `purchase-confirmed-${ctx.orderId}`,
  );

  if (sourcing) {
    const client = await admin();
    const { data: assignment } = await client
      .from("sourcing_assignments")
      .select("shopper_fee_cents, buyer_max_purchase_cents")
      .eq("order_id", ctx.orderId)
      .maybeSingle();
    await emailMember(
      ctx.sellerId,
      "shopping-job",
      {
        itemName: ctx.itemName,
        orderNumber: ctx.orderNumber,
        feeCents: Number(assignment?.shopper_fee_cents ?? 0) || undefined,
        maxSpendCents: Number(assignment?.buyer_max_purchase_cents ?? 0) || undefined,
        currency: ctx.currency,
        orderPath: "/shopper",
      },
      `shopping-job-${ctx.orderId}`,
    );
    return;
  }

  await emailMember(
    ctx.sellerId,
    "item-sold",
    {
      itemName: ctx.itemName,
      orderNumber: ctx.orderNumber,
      payoutCents: ctx.payoutCents,
      currency: ctx.currency,
      orderPath: ctx.orderPath,
    },
    `item-sold-${ctx.orderId}`,
  );
}

/** Buyer email when tracking is recorded. */
export async function emailOrderShipped(
  orderId: string,
  carrier: string,
  trackingNumber: string,
): Promise<void> {
  const ctx = await loadOrderEmailContext(orderId);
  if (!ctx || ctx.isDemo) return;
  await emailMember(
    ctx.buyerId,
    "order-shipped",
    {
      itemName: ctx.itemName,
      orderNumber: ctx.orderNumber,
      carrier,
      trackingNumber,
      orderPath: ctx.orderPath,
    },
    `order-shipped-${ctx.orderId}-${trackingNumber}`,
  );
}

/** Seller / shopper email when the buyer confirms the item arrived. */
export async function emailDeliveryConfirmed(orderId: string): Promise<void> {
  const ctx = await loadOrderEmailContext(orderId);
  if (!ctx || ctx.isDemo) return;
  await emailMember(
    ctx.sellerId,
    "delivery-confirmed",
    {
      itemName: ctx.itemName,
      orderNumber: ctx.orderNumber,
      payoutCents: ctx.payoutCents,
      currency: ctx.currency,
      orderPath: ctx.orderPath,
    },
    `delivery-confirmed-${ctx.orderId}`,
  );
}

/** Dispute opened / resolved — the counterparty and the member who is informed. */
export async function emailDisputeUpdate(
  orderId: string,
  stage: "opened" | "resolved",
  outcome?: string,
): Promise<void> {
  const ctx = await loadOrderEmailContext(orderId);
  if (!ctx || ctx.isDemo) return;
  const payload = {
    stage,
    itemName: ctx.itemName,
    orderNumber: ctx.orderNumber,
    ...(outcome ? { outcome } : {}),
    orderPath: ctx.orderPath,
  };
  await emailMember(
    ctx.buyerId,
    "dispute-update",
    payload,
    `dispute-${stage}-buyer-${ctx.orderId}`,
  );
  await emailMember(
    ctx.sellerId,
    "dispute-update",
    payload,
    `dispute-${stage}-seller-${ctx.orderId}`,
  );
}

/** Buyer email as a park-sourcing job moves along. */
export async function emailSourcingUpdate(
  orderId: string,
  stage: "started" | "purchased" | "balance_due" | "unavailable",
  amountCents?: number,
): Promise<void> {
  const ctx = await loadOrderEmailContext(orderId);
  if (!ctx || ctx.isDemo) return;
  await emailMember(
    ctx.buyerId,
    "sourcing-update",
    {
      stage,
      itemName: ctx.itemName,
      orderNumber: ctx.orderNumber,
      ...(amountCents ? { amountCents } : {}),
      currency: ctx.currency,
      orderPath: ctx.orderPath,
    },
    `sourcing-${stage}-${ctx.orderId}`,
  );
}

type OfferRow = {
  id: string;
  buyer_id: string | null;
  seller_id: string | null;
  amount_cents: number | null;
  seller_counter_cents?: number | null;
  currency?: string | null;
  ask_id?: string | null;
  stripe_payment_intent_id?: string | null;
};

async function offerContext(
  offerId: string,
): Promise<{ offer: OfferRow; itemName: string; listingCents: number } | null> {
  try {
    const client = await admin();
    const { data: offer } = await client
      .from("listing_offers")
      .select(
        "id, buyer_id, seller_id, amount_cents, seller_counter_cents, currency, ask_id, stripe_payment_intent_id",
      )
      .eq("id", offerId)
      .maybeSingle();
    if (!offer) return null;

    let itemName = "";
    let listingCents = 0;
    if (offer.ask_id) {
      const { data: ask } = await client
        .from("asks")
        .select("price_cents, product_id")
        .eq("id", offer.ask_id)
        .maybeSingle();
      listingCents = Number(ask?.price_cents ?? 0);
      if (ask?.product_id) {
        const { data: product } = await client
          .from("products")
          .select("name")
          .eq("id", ask.product_id)
          .maybeSingle();
        itemName = product?.name ?? "";
      }
    }
    return { offer: offer as OfferRow, itemName, listingCents };
  } catch (error) {
    console.error("Could not load offer email context", error);
    return null;
  }
}

/** Seller email when a buyer makes an offer on their listing. */
export async function emailOfferReceived(offerId: string): Promise<void> {
  const ctx = await offerContext(offerId);
  if (!ctx) return;
  await emailMember(
    ctx.offer.seller_id,
    "listing-offer-received",
    {
      itemName: ctx.itemName,
      offerCents: Number(ctx.offer.amount_cents ?? 0),
      ...(ctx.listingCents ? { listingCents: ctx.listingCents } : {}),
      currency: ctx.offer.currency ?? "USD",
      secured: Boolean(ctx.offer.stripe_payment_intent_id),
    },
    `offer-received-${offerId}`,
  );
}

/** Buyer email when the seller counters, declines or accepts their offer. */
export async function emailOfferOutcome(
  offerId: string,
  outcome: "countered" | "declined" | "accepted",
  counterCents?: number | null,
): Promise<void> {
  const ctx = await offerContext(offerId);
  if (!ctx) return;
  await emailMember(
    ctx.offer.buyer_id,
    "offer-update",
    {
      outcome,
      itemName: ctx.itemName,
      offerCents: Number(ctx.offer.amount_cents ?? 0),
      ...(counterCents ? { counterCents } : {}),
      currency: ctx.offer.currency ?? "USD",
    },
    `offer-${outcome}-${offerId}-${counterCents ?? 0}`,
  );
}

/** Seller email when a listing is approved or sent back for changes. */
export async function emailListingReviewed(
  listingId: string,
  approved: boolean,
  reason?: string | null,
): Promise<void> {
  try {
    const client = await admin();
    const { data: ask } = await client
      .from("asks")
      .select("id, seller_id, price_cents, currency, product_id")
      .eq("id", listingId)
      .maybeSingle();
    if (!ask) return;
    let itemName = "";
    if (ask.product_id) {
      const { data: product } = await client
        .from("products")
        .select("name")
        .eq("id", ask.product_id)
        .maybeSingle();
      itemName = product?.name ?? "";
    }
    await emailMember(
      ask.seller_id,
      "listing-reviewed",
      {
        approved,
        itemName,
        priceCents: Number(ask.price_cents ?? 0),
        currency: ask.currency ?? "USD",
        ...(reason ? { reason } : {}),
      },
      `listing-${approved ? "approved" : "rejected"}-${listingId}`,
    );
  } catch (error) {
    console.error("Listing review email was not delivered", error);
  }
}
