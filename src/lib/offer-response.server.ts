/* eslint-disable @typescript-eslint/no-explicit-any -- dependency adapter accepts the payment provider's runtime shape */
/** Persist the authorized response atomically before releasing its old card hold. */
export async function applyOfferResponse(deps: {
  respond: () => Promise<string | null>;
  releaseHold: () => Promise<void>;
}) {
  const orderId = await deps.respond();
  try {
    await deps.releaseHold();
    return { orderId, authorizationReleasePending: false };
  } catch {
    // Keep cancel_pending so an operator can retry; do not claim release succeeded.
    return { orderId, authorizationReleasePending: true };
  }
}

/**
 * Retry a Stripe authorization release that was durably marked cancel_pending.
 * This is safe to call from page loads and a user-triggered retry: the Stripe
 * cancellation key is stable and the database update is conditional.
 */
export async function releasePendingOfferAuthorization(admin: any, offerId: string) {
  const { data: offer, error } = await admin
    .from("listing_offers")
    .select("stripe_payment_intent_id,stripe_payment_status")
    .eq("id", offerId)
    .single();
  if (error) throw new Error(error.message);
  if (offer.stripe_payment_status !== "cancel_pending") return { released: true as const };

  if (offer.stripe_payment_intent_id) {
    const { getStripe } = await import("./stripe-marketplace.server");
    const stripe = getStripe();
    const intent = await stripe.paymentIntents.retrieve(offer.stripe_payment_intent_id);
    if (intent.status !== "canceled") {
      await stripe.paymentIntents.cancel(
        intent.id,
        {},
        { idempotencyKey: `parkvault-offer-release-${intent.id}` },
      );
    }
  }

  const saved = await admin
    .from("listing_offers")
    .update({ stripe_payment_status: "canceled" })
    .eq("id", offerId)
    .eq("stripe_payment_status", "cancel_pending");
  if (saved.error) throw new Error(saved.error.message);
  return { released: true as const };
}
