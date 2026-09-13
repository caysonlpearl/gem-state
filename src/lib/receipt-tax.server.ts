import type Stripe from "stripe";
import { previewReceiptCredit, refundReceiptCredit } from "./receipt-credit-note.server.ts";

export type ReceiptAddress = {
  recipient_name: string;
  line1: string;
  line2?: string | null;
  city: string;
  region: string;
  postal_code: string;
  country: string;
};

export function receiptShipping(address: ReceiptAddress) {
  if (!address?.recipient_name || !address.line1 || !address.city || !address.region ||
      !address.postal_code || address.country !== "US") {
    throw new Error("The original order shipping address is incomplete.");
  }
  return {
    name: address.recipient_name,
    address: { line1: address.line1, line2: address.line2 ?? "", city: address.city,
      state: address.region, postal_code: address.postal_code, country: address.country },
  };
}

export async function calculateReceiptTax(stripe: Stripe, input: {
  orderId: string; checkoutId: string; paymentIntentId: string;
  originalTax: number; merchandise: number; fee: number; shipping: number;
  address: ReceiptAddress;
}) {
  if (![input.originalTax, input.merchandise, input.fee, input.shipping].every(
    (cents) => Number.isSafeInteger(cents) && cents >= 0,
  )) throw new Error("Invalid receipt amounts.");
  const { plan, note, taxRefund } = await previewReceiptCredit(stripe, input);
  if (Number(plan.session.total_details?.amount_tax ?? 0) !== input.originalTax) {
    throw new Error("Original checkout tax could not be verified.");
  }
  // Credit the original invoice lines at their original tax rates. This also handles
  // line-level rounding and exempt shipping without a proportional tax allocation.
  return { calculationId: `credit_preview:${plan.invoice.id}:${note.id}`, taxCents: input.originalTax - taxRefund };
}

export async function refundReceiptReduction(stripe: Stripe, input: {
  orderId: string; actualCostCents: number; paymentIntentId: string; amountCents: number;
  checkoutId?: string; merchandise?: number; fee?: number; shipping?: number; finalTaxCents?: number;
}) {
  if (!input.checkoutId && Number(input.finalTaxCents ?? 0) > 0)
    throw new Error("The original checkout is required to reconcile this taxed refund.");
  if (input.checkoutId) {
    const session = await stripe.checkout.sessions.retrieve(input.checkoutId);
    if (session.invoice || session.invoice_creation?.enabled) {
      return refundReceiptCredit(stripe, {
        ...input, checkoutId: input.checkoutId, merchandise: input.merchandise!, fee: input.fee!,
        shipping: input.shipping!, finalTaxCents: input.finalTaxCents!,
      });
    }
    if (Number(session.total_details?.amount_tax ?? 0) > 0)
      throw new Error("This older taxed order needs an administrator to reconcile its receipt refund.");
  }
  // Stripe idempotency keys can expire. Persist identity in Stripe metadata too,
  // so a later retry after a database/network failure cannot issue another refund.
  const prior = await stripe.refunds.list({ payment_intent: input.paymentIntentId, limit: 100 });
  const existing = prior.data.find((refund) =>
    refund.metadata?.["parkvault_receipt_order"] === input.orderId &&
    refund.metadata?.["parkvault_receipt_cost"] === String(input.actualCostCents));
  if (!existing && prior.has_more) throw new Error("Refund history needs review before retrying.");
  const refund = existing ?? await stripe.refunds.create({
    payment_intent: input.paymentIntentId, amount: input.amountCents,
    metadata: { parkvault_receipt_order: input.orderId, parkvault_receipt_cost: String(input.actualCostCents) },
  }, { idempotencyKey: `parkvault-receipt-refund-${input.orderId}-${input.actualCostCents}` });
  if (refund.amount !== input.amountCents || refund.status !== "succeeded")
    throw new Error("Stripe has not completed the expected receipt refund yet.");
  return refund;
}
