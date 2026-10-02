/* eslint-disable @typescript-eslint/no-explicit-any -- Stripe metadata and receipt rows are runtime provider payloads */
import type Stripe from "stripe";

export type ReceiptCreditInput = {
  orderId: string;
  checkoutId: string;
  paymentIntentId: string;
  merchandise: number;
  fee: number;
  shipping: number;
};

const idOf = (value: any): string => (typeof value === "string" ? value : (value?.id ?? ""));

// Match invoice lines by immutable Stripe price IDs, never by product names or order.
export async function receiptCreditPlan(stripe: Stripe, input: ReceiptCreditInput) {
  if (
    ![input.merchandise, input.fee, input.shipping].every((c) => Number.isSafeInteger(c) && c >= 0)
  )
    throw new Error("Invalid receipt amounts.");
  const session = await stripe.checkout.sessions.retrieve(input.checkoutId);
  if (
    session.status !== "complete" ||
    session.payment_status !== "paid" ||
    session.currency !== "usd" ||
    idOf(session.payment_intent) !== input.paymentIntentId ||
    session.metadata?.["parkvault_order_id"] !== input.orderId ||
    session.metadata?.["parkvault_purpose"] !== "sourcing"
  )
    throw new Error("Original checkout could not be verified.");
  if (!session.invoice)
    throw new Error(
      "This older order needs an administrator to reconcile its receipt refund; it has no itemized Stripe invoice.",
    );
  const invoice = await stripe.invoices.retrieve(idOf(session.invoice));
  if (
    invoice.status !== "paid" ||
    invoice.currency !== "usd" ||
    invoice.livemode !== session.livemode ||
    invoice.total !== session.amount_total ||
    invoice.amount_paid !== session.amount_total ||
    invoice.amount_remaining !== 0 ||
    session.total_details?.amount_shipping !== input.shipping
  )
    throw new Error("Original invoice totals could not be verified.");
  const [checkoutLines, invoiceLines] = await Promise.all([
    stripe.checkout.sessions.listLineItems(session.id, {
      limit: 100,
      expand: ["data.price.product"],
    }),
    stripe.invoices.listLineItems(invoice.id, { limit: 100 }),
  ]);
  if (
    checkoutLines.has_more ||
    invoiceLines.has_more ||
    checkoutLines.data.length !== 2 ||
    invoiceLines.data.length !== 2
  )
    throw new Error("Invoice lines need review before refunding.");
  const lines: Stripe.CreditNoteCreateParams.Line[] = [];
  let subtotal = 0;
  for (const [component, finalAmount] of [
    ["merchandise", input.merchandise],
    ["platform_fee", input.fee],
  ] as const) {
    const matches = checkoutLines.data.filter((line) => {
      const product = line.price?.product;
      return (
        typeof product === "object" &&
        product &&
        !product.deleted &&
        product.metadata?.["parkvault_component"] === component
      );
    });
    if (matches.length !== 1) throw new Error("Invoice component could not be identified.");
    const item = matches[0]!;
    const matchesInvoice = invoiceLines.data.filter(
      (line) => idOf(line.pricing?.price_details?.price) === item.price?.id,
    );
    if (
      matchesInvoice.length !== 1 ||
      item.amount_discount !== 0 ||
      item.quantity !== 1 ||
      item.price?.tax_behavior !== "exclusive" ||
      matchesInvoice[0]!.amount !== item.amount_subtotal ||
      finalAmount > item.amount_subtotal
    )
      throw new Error("Invoice component totals could not be verified.");
    const amount = item.amount_subtotal - finalAmount;
    subtotal += amount;
    if (amount > 0)
      lines.push({ type: "invoice_line_item", invoice_line_item: matchesInvoice[0]!.id, amount });
  }
  if (!lines.length) throw new Error("There is no receipt reduction to refund.");
  return { session, invoice, lines, subtotal };
}

export function validateReceiptCredit(
  note: Stripe.CreditNote,
  plan: Awaited<ReturnType<typeof receiptCreditPlan>>,
) {
  const tax = note.total - note.subtotal;
  if (
    idOf(note.invoice) !== plan.invoice.id ||
    note.livemode !== plan.session.livemode ||
    note.currency !== "usd" ||
    note.status !== "issued" ||
    note.subtotal !== plan.subtotal ||
    note.total_excluding_tax !== plan.subtotal ||
    !Number.isSafeInteger(tax) ||
    tax < 0 ||
    tax > Number(plan.session.total_details?.amount_tax ?? 0) ||
    note.amount_shipping !== 0 ||
    note.pre_payment_amount !== 0 ||
    note.post_payment_amount !== note.total ||
    note.lines.has_more ||
    note.lines.data.length !== plan.lines.length ||
    !plan.lines.every((line) =>
      note.lines.data.some(
        (actual) =>
          actual.invoice_line_item === line.invoice_line_item && actual.amount === line.amount,
      ),
    )
  )
    throw new Error("Stripe credit note does not match the receipt adjustment.");
  return tax;
}

export async function previewReceiptCredit(stripe: Stripe, input: ReceiptCreditInput) {
  const plan = await receiptCreditPlan(stripe, input);
  const note = await stripe.creditNotes.preview({ invoice: plan.invoice.id, lines: plan.lines });
  const taxRefund = validateReceiptCredit(note, plan);
  return { plan, note, taxRefund };
}

export async function refundReceiptCredit(
  stripe: Stripe,
  input: ReceiptCreditInput & {
    actualCostCents: number;
    amountCents: number;
    finalTaxCents: number;
  },
) {
  const plan = await receiptCreditPlan(stripe, input);
  const history = await stripe.creditNotes.list({ invoice: plan.invoice.id, limit: 100 });
  const metadata = {
    parkvault_receipt_order: input.orderId,
    parkvault_receipt_cost: String(input.actualCostCents),
  };
  const matches = history.data.filter(
    (note) =>
      note.metadata?.["parkvault_receipt_order"] === input.orderId &&
      note.metadata?.["parkvault_receipt_cost"] === metadata.parkvault_receipt_cost,
  );
  if (history.has_more || matches.length > 1)
    throw new Error("Credit note history requires review.");
  let note = matches[0];
  const verify = (credit: Stripe.CreditNote) => {
    const taxRefund = validateReceiptCredit(credit, plan);
    if (
      credit.total !== input.amountCents ||
      Number(plan.session.total_details?.amount_tax ?? 0) - taxRefund !== input.finalTaxCents ||
      plan.session.amount_total! - credit.total !==
        input.merchandise + input.fee + input.shipping + input.finalTaxCents
    )
      throw new Error("Refund does not match the recorded receipt total.");
  };
  if (!note) {
    // A prior unrelated refund/credit changes the available invoice balance. Never guess or duplicate it.
    const refunds = await stripe.refunds.list({ payment_intent: input.paymentIntentId, limit: 1 });
    if (history.data.length || refunds.data.length || refunds.has_more)
      throw new Error("Existing invoice adjustments require review.");
    const preview = await stripe.creditNotes.preview({
      invoice: plan.invoice.id,
      lines: plan.lines,
    });
    verify(preview);
    note = await stripe.creditNotes.create(
      {
        invoice: plan.invoice.id,
        lines: plan.lines,
        refund_amount: input.amountCents,
        reason: "order_change",
        email_type: "none",
        metadata,
      },
      { idempotencyKey: `parkvault-receipt-credit-${input.orderId}-${input.actualCostCents}` },
    );
  }
  verify(note);
  // Credit-note creation issues the refund. A separate Refund API call would duplicate it.
  if (note.refunds.length !== 1 || note.refunds[0]!.amount_refunded !== input.amountCents)
    throw new Error("Stripe has not linked the expected receipt refund yet.");
  const refund = await stripe.refunds.retrieve(idOf(note.refunds[0]!.refund));
  if (
    refund.status !== "succeeded" ||
    refund.amount !== input.amountCents ||
    idOf(refund.payment_intent) !== input.paymentIntentId
  )
    throw new Error("Stripe has not completed the expected receipt refund yet.");
  return refund;
}
