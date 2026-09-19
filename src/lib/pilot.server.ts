/**
 * Phase 7 — server-only shaping helpers for manual pilot & trust operations.
 *
 * Nothing here mints identity: every caller check happens inside the database
 * functions, which derive the actor from `auth.uid()`. These helpers only turn
 * rows the caller was already allowed to read into browser-safe shapes, and
 * they never emit storage paths, provider credentials or payment instrument
 * data.
 */

export type PaymentRecord = {
  id: string;
  kind: string;
  provider: string;
  externalReference: string;
  amountCents: number;
  currency: string;
  providerStatus: string;
  occurredAt: string;
};

export type PayoutRecord = {
  provider: string;
  externalReference: string | null;
  amountCents: number;
  currency: string;
  status: string;
  occurredAt: string | null;
};

export type ShipmentRecord = {
  carrier: string;
  trackingNumber: string;
  status: string;
  shippedAt: string | null;
  deliveredAt: string | null;
  labelUrl: string | null;
  trackingUrl: string | null;
  serviceLevel: string | null;
  rateCents: number | null;
  shipBy: string | null;
};

export type EvidenceRecord = {
  id: string;
  kind: string;
  receiptAmountCents: number | null;
  confirmedAt: string | null;
  createdAt: string;
  /** True only for the uploader or an authorised operator. */
  canOpen: boolean;
};

export type DisputeRecord = {
  id: string;
  status: string;
  reason: string;
  resolutionNote: string | null;
  createdAt: string;
  openedByMe: boolean;
};

export type AddressSnapshot = {
  recipientName: string;
  line1: string;
  line2: string | null;
  city: string;
  region: string;
  postalCode: string;
  country: string;
};

export type AssignmentSummary = {
  status: string;
  shopperFeeCents: number;
  referencePriceCents: number;
  buyerMaxPurchaseCents: number;
  coverageLabel: string;
  purchaseDeadline: string;
  currency: string;
};

export type OrderOperations = {
  orderId: string;
  orderNumber: string;
  status: string;
  origin: string;
  role: "buyer" | "seller" | "staff";
  isStaff: boolean;
  fundingCommitted: boolean;
  paymentCaptured: boolean;
  payments: PaymentRecord[];
  payout: PayoutRecord | null;
  shipment: ShipmentRecord | null;
  evidence: EvidenceRecord[];
  /** What a buyer is allowed to see from the receipt: the amount only. */
  verifiedPurchaseCents: number | null;
  itemPhotoOnFile: boolean;
  dispute: DisputeRecord | null;
  verifiedSale: { priceCents: number; soldAt: string; isLive: boolean } | null;
  address: AddressSnapshot | null;
  assignment: AssignmentSummary | null;
};

export type MemberPerformance = {
  completedOrders: number;
  totalOrders: number;
  fulfillmentRate: number | null;
  cancellationRate: number | null;
  averageRating: number | null;
  reviewCount: number;
};

type Row = Record<string, unknown>;

export function shapePayment(row: Row): PaymentRecord {
  return {
    id: row["id"] as string,
    kind: row["kind"] as string,
    provider: row["provider"] as string,
    externalReference: row["external_reference"] as string,
    amountCents: row["amount_cents"] as number,
    currency: row["currency"] as string,
    providerStatus: row["provider_status"] as string,
    occurredAt: row["occurred_at"] as string,
  };
}

export function shapePayout(row: Row | null): PayoutRecord | null {
  if (!row) return null;
  return {
    provider: row["provider"] as string,
    externalReference: (row["external_reference"] as string | null) ?? null,
    amountCents: row["amount_cents"] as number,
    currency: row["currency"] as string,
    status: row["status"] as string,
    occurredAt: (row["occurred_at"] as string | null) ?? null,
  };
}

export function shapeShipment(row: Row | null): ShipmentRecord | null {
  if (!row) return null;
  return {
    carrier: row["carrier"] as string,
    trackingNumber: row["tracking_number"] as string,
    status: row["status"] as string,
    shippedAt: (row["shipped_at"] as string | null) ?? null,
    deliveredAt: (row["delivered_at"] as string | null) ?? null,
    labelUrl: (row["label_url"] as string | null) ?? null,
    trackingUrl: (row["tracking_url"] as string | null) ?? null,
    serviceLevel: (row["service_level"] as string | null) ?? null,
    rateCents: (row["rate_cents"] as number | null) ?? null,
    shipBy: (row["ship_by"] as string | null) ?? null,
  };
}

export function shapeEvidence(row: Row, canOpen: boolean): EvidenceRecord {
  return {
    id: row["id"] as string,
    kind: row["kind"] as string,
    receiptAmountCents: (row["receipt_amount_cents"] as number | null) ?? null,
    confirmedAt: (row["confirmed_at"] as string | null) ?? null,
    createdAt: row["created_at"] as string,
    canOpen,
  };
}

export function shapeAddress(row: Row | null): AddressSnapshot | null {
  if (!row) return null;
  return {
    recipientName: row["recipient_name"] as string,
    line1: row["line1"] as string,
    line2: (row["line2"] as string | null) ?? null,
    city: row["city"] as string,
    region: row["region"] as string,
    postalCode: row["postal_code"] as string,
    country: row["country"] as string,
  };
}

export function shapeAssignment(row: Row | null): AssignmentSummary | null {
  if (!row) return null;
  return {
    status: row["status"] as string,
    shopperFeeCents: row["shopper_fee_cents"] as number,
    referencePriceCents: row["reference_price_cents"] as number,
    buyerMaxPurchaseCents: row["buyer_max_purchase_cents"] as number,
    coverageLabel: row["coverage_label"] as string,
    purchaseDeadline: row["purchase_deadline"] as string,
    currency: row["currency"] as string,
  };
}

export function shapePerformance(raw: unknown): MemberPerformance {
  const value = (raw ?? {}) as Record<string, number | null>;
  const num = (key: string) => {
    const v = value[key];
    return typeof v === "number" ? v : v == null ? null : Number(v);
  };
  return {
    completedOrders: num("completed_orders") ?? 0,
    totalOrders: num("total_orders") ?? 0,
    fulfillmentRate: num("fulfillment_rate"),
    cancellationRate: num("cancellation_rate"),
    averageRating: num("average_rating"),
    reviewCount: num("review_count") ?? 0,
  };
}
