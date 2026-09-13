import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { getStripe } from "./stripe-marketplace.server";
import { calculateReceiptTax } from "./receipt-tax.server";

// Only server-verified quotes can change an order's original tax snapshot.
export async function prepareReceiptTaxQuote(userId: string, input: {
  orderId: string; actualCostCents: number; receiptPath: string;
}) {
  const admin = supabaseAdmin as any;
  const { data: order, error } = await admin.from("orders").select(
    "id,seller_id,origin,status,payment_authorized,merchandise_cents,shipping_cents,tax_cents,total_cents,stripe_checkout_session_id,stripe_payment_intent_id",
  ).eq("id", input.orderId).single();
  if (error || !order || order.origin !== "sourcing_shopper") throw new Error("Shopping job not found.");
  if (order.seller_id !== userId) {
    const { data: role } = await admin.from("user_roles").select("role")
      .eq("user_id", userId).eq("role", "admin").maybeSingle();
    if (!role) throw new Error("Only the assigned shopper may confirm this purchase.");
  }
  if (!order.payment_authorized || input.receiptPath.split("/")[0] !== userId)
    throw new Error("A paid job and your own receipt are required.");
  const { data: assignment, error: assignmentError } = await admin.from("sourcing_assignments")
    .select("shopper_fee_cents,buyer_max_purchase_cents,purchase_confirmed_at")
    .eq("order_id", order.id).single();
  if (assignmentError || !assignment || input.actualCostCents > assignment.buyer_max_purchase_cents)
    throw new Error("Receipt exceeds the buyer's approved maximum.");
  // The locked RPC validates exact receipt identity on retries; never recalculate an already settled sale.
  if (assignment.purchase_confirmed_at) return;
  if (!["sourcing", "payment_captured"].includes(order.status)) throw new Error("This job has already moved on.");
  const merchandise = input.actualCostCents + assignment.shopper_fee_cents;
  if (merchandise >= order.merchandise_cents || order.tax_cents === 0) return;
  const { data: fee, error: feeError } = await admin.rpc("compute_sourcing_platform_fee", {
    _merchandise_and_shopper_cents: merchandise,
  });
  if (feeError || !Number.isSafeInteger(fee)) throw new Error("Receipt fee could not be verified.");
  const { data: address, error: addressError } = await admin.from("order_addresses")
    .select("recipient_name,line1,line2,city,region,postal_code,country").eq("order_id", order.id).single();
  if (addressError || !address || !order.stripe_checkout_session_id || !order.stripe_payment_intent_id)
    throw new Error("Original payment and delivery details are required to reconcile tax.");
  const quote = await calculateReceiptTax(getStripe(), {
    orderId: order.id, checkoutId: order.stripe_checkout_session_id,
    paymentIntentId: order.stripe_payment_intent_id, originalTax: order.tax_cents,
    merchandise, fee, shipping: order.shipping_cents, address,
  });
  const { error: quoteError } = await admin.from("sourcing_receipt_tax_quotes").upsert({
    order_id: order.id, actual_cost_cents: input.actualCostCents,
    original_total_cents: order.total_cents, original_tax_cents: order.tax_cents,
    merchandise_cents: merchandise, platform_fee_cents: fee, shipping_cents: order.shipping_cents,
    tax_cents: quote.taxCents, calculation_id: quote.calculationId,
    payment_intent_id: order.stripe_payment_intent_id,
  }, { onConflict: "order_id,actual_cost_cents" });
  if (quoteError) throw new Error("Receipt tax quote could not be saved.");
}
