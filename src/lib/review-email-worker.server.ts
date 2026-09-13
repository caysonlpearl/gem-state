import { sendTemplateEmail } from "./email-templates/send-email";
import { reviewEmailEligible } from "./review-email-eligibility";

/** Claims rows atomically; provider idempotency protects delivery retries. */
export async function processReviewEmails(orderId?: string) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const admin = supabaseAdmin as any;
  const claimed = await admin.rpc("claim_review_emails", { _order_id: orderId ?? null });
  if (claimed.error) throw new Error(claimed.error.message);
  let sent = 0;
  let failed = 0;
  for (const row of claimed.data ?? []) {
    let update: Record<string, unknown>;
    try {
      const result = await admin
        .from("orders")
        .select("buyer_id,status,is_demo,stripe_checkout_session_id,order_number,products(name)")
        .eq("id", row.order_id)
        .single();
      if (result.error) throw new Error("Order could not be loaded");
      const order = result.data;
      const review = await admin
        .from("order_reviews")
        .select("id")
        .eq("order_id", row.order_id)
        .eq("reviewer_id", row.user_id)
        .limit(1);
      if (review.error) throw new Error("Review eligibility could not be checked");
      if (!reviewEmailEligible(order, row.user_id, review.data.length > 0)) {
        update = { status: "skipped", last_error: "Not eligible for a live buyer review email" };
      } else {
        const user = await admin.auth.admin.getUserById(row.user_id);
        if (user.error || !user.data?.user?.email) throw new Error("Recipient unavailable");
        const delivery = await sendTemplateEmail("seller-review-request", user.data.user.email, {
          idempotencyKey: `parkvault-review-${row.id}`,
          templateData: {
            orderNumber: order.order_number,
            itemName: order.products?.name,
            orderPath: `/orders/${row.order_id}`,
          },
        });
        update = delivery.sent
          ? { status: "sent", sent_at: new Date().toISOString(), last_error: null }
          : { status: "skipped", last_error: "Recipient suppressed by email provider" };
        if (delivery.sent) sent++;
      }
    } catch {
      failed++;
      update = {
        status: "failed",
        last_error: "Delivery failed; scheduled for retry",
        next_attempt_at: new Date(
          Date.now() + Math.min(3600, 60 * 2 ** row.attempts) * 1000,
        ).toISOString(),
      };
    }
    const saved = await admin
      .from("transactional_email_queue")
      .update({ ...update, locked_until: null, updated_at: new Date().toISOString() })
      .eq("id", row.id)
      .eq("lease_token", row.lease_token);
    if (saved.error) throw new Error("Could not record email delivery result");
  }
  return { processed: (claimed.data ?? []).length, sent, failed };
}
