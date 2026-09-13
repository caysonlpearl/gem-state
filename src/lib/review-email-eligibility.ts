export function reviewEmailEligible(
  order: {
    buyer_id: string;
    status: string;
    is_demo: boolean;
    stripe_checkout_session_id: string | null;
  },
  recipientId: string,
  alreadyReviewed: boolean,
): boolean {
  return (
    !order.is_demo &&
    String(order.stripe_checkout_session_id ?? "").startsWith("cs_live_") &&
    order.status === "completed" &&
    order.buyer_id === recipientId &&
    !alreadyReviewed
  );
}
