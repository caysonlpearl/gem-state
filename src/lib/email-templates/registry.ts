import type { ComponentType } from "react";

import { template as purchaseConfirmed } from "./purchase-confirmed";
import { template as itemSold } from "./item-sold";
import { template as shoppingJob } from "./shopping-job";
import { template as orderShipped } from "./order-shipped";
import { template as deliveryConfirmed } from "./delivery-confirmed";
import { template as listingOfferReceived } from "./listing-offer-received";
import { template as offerUpdate } from "./offer-update";
import { template as listingReviewed } from "./listing-reviewed";
import { template as sourcingUpdate } from "./sourcing-update";
import { template as disputeUpdate } from "./dispute-update";
import { template as sellerReviewRequest } from "./seller-review-request";

export interface TemplateEntry {
  component: ComponentType<any>;
  subject: string | ((data: Record<string, any>) => string);
  displayName?: string;
  previewData?: Record<string, any>;
  /** Fixed recipient — overrides caller-provided recipientEmail when set. */
  to?: string;
}

/**
 * Template registry — maps template names to their React Email components.
 * Import and register new templates here after creating them in this directory.
 */
export const TEMPLATES: Record<string, TemplateEntry> = {
  "seller-review-request": sellerReviewRequest,
  "purchase-confirmed": purchaseConfirmed,
  "item-sold": itemSold,
  "shopping-job": shoppingJob,
  "order-shipped": orderShipped,
  "delivery-confirmed": deliveryConfirmed,
  "listing-offer-received": listingOfferReceived,
  "offer-update": offerUpdate,
  "listing-reviewed": listingReviewed,
  "sourcing-update": sourcingUpdate,
  "dispute-update": disputeUpdate,
};
