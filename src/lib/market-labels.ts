export const orderStatusLabels: Record<string, string> = {
  inquiry: "Inquiry",
  awaiting_payment: "Awaiting payment",
  awaiting_authorization: "Awaiting external payment",
  authorized: "Externally authorized",
  shopper_assigned: "Shopper instructed to purchase",
  purchase_confirmed: "Purchase confirmed in park",
  payment_captured: "Externally captured",
  unavailable: "Item was unavailable",
  paid: "Paid",
  sourcing: "Sourcing in park",
  ready_to_ship: "Ready to ship",
  shipped: "Shipped",
  delivered: "Delivered",
  completed: "Completed",
  cancelled: "Cancelled",
  refunded: "Refunded",
  disputed: "Disputed",
};

/** Seller-facing status wording. Never uses operator/internal vocabulary. */
export const sellerStatusLabels: Record<string, string> = {
  inquiry: "Reserved",
  awaiting_payment: "Reserved — buyer is checking out",
  awaiting_authorization: "Reserved — awaiting payment",
  authorized: "Sold",
  paid: "Sold — ready to ship",
  payment_captured: "Sold — ready to ship",
  sourcing: "Sourcing",
  ready_to_ship: "Sold — ready to ship",
  shipped: "Shipped",
  delivered: "Delivered",
  completed: "Completed",
  cancelled: "Cancelled",
  refunded: "Refunded",
  disputed: "Under review",
};

export const originLabels: Record<string, string> = {
  buy_now: "Purchase request (lowest listing price)",
  sell_now: "Sale offer (best offer)",
  sourcing_ask: "Purchase request (sourcing offer)",
  sourcing_shopper: "Park-sourced purchase (approved shopper)",
  sourcing_quote: "Accepted sourcing quote",
  admin_validation: "Administrator validation record",
};

export const listingStatusLabels: Record<string, string> = {
  active: "Active",
  matched: "Matched",
  cancelled: "Cancelled",
  expired: "Expired",
};

export const sourcingRequestStatusLabels: Record<string, string> = {
  open: "Open for quotes",
  quote_accepted: "Quote accepted",
  cancelled: "Closed by you",
  expired: "Expired",
};

export const quoteStatusLabels: Record<string, string> = {
  submitted: "Awaiting the buyer",
  accepted: "Accepted",
  declined: "Not chosen",
  withdrawn: "Withdrawn",
  expired: "Expired",
};

export const shopperApplicationStatusLabels: Record<string, string> = {
  submitted: "Submitted — awaiting manual review",
  in_review: "In review",
  approved: "Approved",
  rejected: "Not approved",
};

/** Phase 7 — manual pilot & trust operations. */
export const paymentKindLabels: Record<string, string> = {
  authorization: "External authorization",
  capture: "External capture",
  payment: "External payment in full",
  refund: "External refund",
};

export const paymentStatusLabels: Record<string, string> = {
  succeeded: "Succeeded",
  pending: "Pending",
  failed: "Failed",
  voided: "Voided",
};

export const payoutStatusLabels: Record<string, string> = {
  pending: "Payout pending delivery — not sent",
  processing: "Payout is being released to Stripe",
  completed: "Released to the seller's Stripe balance",
  failed: "Payout failed",
  reversed: "Payout reversed",
};

export const shipmentStatusLabels: Record<string, string> = {
  pending: "Not shipped",
  label_created: "Label created",
  shipped: "Shipped",
  in_transit: "In transit",
  delivered: "Delivered",
  exception: "Carrier exception",
};

export const disputeStatusLabels: Record<string, string> = {
  open: "Open — awaiting operator review",
  under_review: "Under operator review",
  resolved_buyer: "Resolved in the buyer's favour",
  resolved_seller: "Resolved in the seller's favour",
  withdrawn: "Withdrawn",
};

export const evidenceKindLabels: Record<string, string> = {
  purchase_receipt: "Purchase receipt",
  item_photo: "Item photograph",
  delivery_proof: "Delivery proof",
  dispute_evidence: "Dispute evidence",
};

/** Operator-facing transitions offered from each state. */
export const nextStatusOptions: Record<string, string[]> = {
  inquiry: ["awaiting_authorization", "cancelled"],
  awaiting_payment: ["awaiting_authorization", "cancelled"],
  awaiting_authorization: ["authorized", "payment_captured", "cancelled"],
  authorized: ["shopper_assigned", "payment_captured", "ready_to_ship", "cancelled"],
  shopper_assigned: ["purchase_confirmed", "unavailable", "cancelled"],
  purchase_confirmed: ["payment_captured", "cancelled"],
  payment_captured: ["ready_to_ship", "refunded", "cancelled"],
  paid: ["ready_to_ship", "refunded", "cancelled"],
  sourcing: ["ready_to_ship", "unavailable", "cancelled"],
  ready_to_ship: ["shipped", "cancelled"],
  shipped: ["delivered", "disputed"],
  delivered: ["disputed", "refunded"],
  disputed: ["refunded", "cancelled", "delivered"],
  unavailable: ["cancelled", "refunded"],
};
