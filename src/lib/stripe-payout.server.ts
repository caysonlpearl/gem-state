import type Stripe from "stripe";

type Payout = {
  orderId: string;
  orderNumber: string;
  amountCents: number;
  currency: string;
  destination: string;
  sourceCharge?: string;
  live: boolean;
  checkoutSessionId: string;
  primaryPaymentIntentId: string;
  paymentIntentIds: string[];
  transferIdempotencyKey?: string;
};

/** Verify funding even when a shopper payout combines more than one charge. */
export async function verifyPayoutFunding(
  stripe: Pick<Stripe, "checkout" | "paymentIntents" | "charges">,
  payout: Payout,
) {
  const prefix = payout.live ? "cs_live_" : "cs_test_";
  if (!payout.checkoutSessionId?.startsWith(prefix) || !payout.primaryPaymentIntentId) {
    throw new Error("The order payment does not belong to the current Stripe mode.");
  }
  const session = await stripe.checkout.sessions.retrieve(payout.checkoutSessionId);
  const sessionIntent =
    typeof session.payment_intent === "string"
      ? session.payment_intent
      : session.payment_intent?.id;
  if (
    session.livemode !== payout.live ||
    session.status !== "complete" ||
    sessionIntent !== payout.primaryPaymentIntentId
  ) {
    throw new Error("The original checkout payment could not be verified for this payout.");
  }
  const ids = new Set([payout.primaryPaymentIntentId, ...payout.paymentIntentIds]);
  let netCaptured = 0;
  for (const id of ids) {
    const intent = await stripe.paymentIntents.retrieve(id, { expand: ["latest_charge"] });
    if (
      intent.livemode !== payout.live ||
      intent.status !== "succeeded" ||
      intent.currency !== payout.currency.toLowerCase() ||
      (id !== payout.primaryPaymentIntentId &&
        intent.metadata["parkvault_order_id"] !== payout.orderId)
    ) {
      throw new Error(
        "A payout funding payment is not captured for this order in the current Stripe mode.",
      );
    }
    const charge =
      typeof intent.latest_charge === "string"
        ? await stripe.charges.retrieve(intent.latest_charge)
        : intent.latest_charge;
    const chargeIntent =
      typeof charge?.payment_intent === "string"
        ? charge.payment_intent
        : charge?.payment_intent?.id;
    if (
      !charge ||
      charge.livemode !== payout.live ||
      !charge.paid ||
      !charge.captured ||
      charge.disputed ||
      chargeIntent !== id ||
      charge.currency !== payout.currency.toLowerCase()
    ) {
      throw new Error("The payout charge is unavailable, disputed, or not captured.");
    }
    netCaptured += charge.amount - charge.amount_refunded;
  }
  if (netCaptured < payout.amountCents) {
    throw new Error("Captured funds after refunds do not cover this payout.");
  }
}

/** Recover a previously sent transfer before using the corrected request key. */
export async function sendOrderTransfer(
  stripe: Pick<Stripe, "charges" | "transfers" | "checkout" | "paymentIntents">,
  payout: Payout,
) {
  if (!Number.isSafeInteger(payout.amountCents) || payout.amountCents <= 0) {
    throw new Error("The frozen payout amount is invalid.");
  }
  await verifyPayoutFunding(stripe, payout);
  const groups = new Set([payout.orderNumber]);
  if (payout.sourceCharge) {
    const charge = await stripe.charges.retrieve(payout.sourceCharge);
    if (charge.livemode !== payout.live || !charge.paid || !charge.captured) {
      throw new Error("The source payment is not captured in the current Stripe mode.");
    }
    if (charge.amount_refunded > 0) {
      throw new Error("This payment has a refund and needs payout reconciliation first.");
    }
    if (charge.transfer_group) groups.add(charge.transfer_group);
  }
  const matches = new Map<string, Stripe.Transfer>();
  for (const group of groups) {
    const page = await stripe.transfers.list({ transfer_group: group, limit: 100 });
    if (page.has_more) throw new Error("Transfer history needs operator reconciliation.");
    for (const transfer of page.data) {
      if (transfer.metadata["parkvault_order_id"] === payout.orderId) {
        matches.set(transfer.id, transfer);
      }
    }
  }
  // source_transaction normally inherits the source charge's transfer group.
  // If an older charge did not, recover by destination + immutable order
  // metadata before creating anything. This closes the >24-hour idempotency
  // retry gap after a transfer succeeded but the local save failed.
  if (matches.size === 0) {
    let startingAfter: string | undefined;
    for (let pageNumber = 0; pageNumber < 10; pageNumber += 1) {
      const page = await stripe.transfers.list({
        destination: payout.destination,
        limit: 100,
        ...(startingAfter ? { starting_after: startingAfter } : {}),
      });
      for (const transfer of page.data) {
        if (transfer.metadata["parkvault_order_id"] === payout.orderId) {
          matches.set(transfer.id, transfer);
        }
      }
      if (!page.has_more) break;
      const last = page.data.at(-1);
      if (!last || pageNumber === 9) {
        throw new Error("Transfer history needs operator reconciliation.");
      }
      startingAfter = last.id;
    }
  }
  if (matches.size > 1) throw new Error("Multiple transfers exist; reconcile this payout first.");
  const existing = [...matches.values()][0];
  if (existing) {
    const destination =
      typeof existing.destination === "string" ? existing.destination : existing.destination?.id;
    if (
      existing.amount !== payout.amountCents ||
      destination !== payout.destination ||
      existing.currency !== payout.currency.toLowerCase() ||
      existing.livemode !== payout.live ||
      existing.amount_reversed > 0
    ) {
      throw new Error(
        "The existing transfer does not match this payout. Reconcile it before retrying.",
      );
    }
    return existing;
  }
  return stripe.transfers.create(
    {
      amount: payout.amountCents,
      currency: payout.currency.toLowerCase(),
      destination: payout.destination,
      ...(payout.sourceCharge
        ? { source_transaction: payout.sourceCharge }
        : { transfer_group: payout.orderNumber }),
      metadata: {
        parkvault_order_id: payout.orderId,
        parkvault_transfer_kind: "order_payout",
      },
    },
    { idempotencyKey: payout.transferIdempotencyKey ?? `parkvault-payout-v2-${payout.orderId}` },
  );
}
