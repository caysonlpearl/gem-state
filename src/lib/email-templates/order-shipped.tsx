/* eslint-disable @typescript-eslint/no-explicit-any -- template payloads are registry-driven JSON */
import * as React from "react";
import type { TemplateEntry } from "./registry";
import { EmailShell } from "./shell";

interface Props {
  itemName?: string;
  orderNumber?: string;
  carrier?: string;
  trackingNumber?: string;
  orderPath?: string;
}

const Email = ({ itemName, orderNumber, carrier, trackingNumber, orderPath }: Props) => (
  <EmailShell
    preview={`${itemName ?? "Your Gem State Classifieds order"} is on its way`}
    heading="Your order has shipped"
    intro={`${itemName ?? "Your order"} is on its way. Confirm delivery when it arrives so we can close out the order.`}
    facts={[
      { label: "Item", value: itemName ?? "" },
      { label: "Order", value: orderNumber ?? "" },
      { label: "Carrier", value: carrier ?? "" },
      { label: "Tracking", value: trackingNumber ?? "" },
    ]}
    ctaLabel="Track your order"
    ctaPath={orderPath ?? "/buying"}
  />
);

export const template = {
  component: Email,
  subject: (d: Record<string, any>) =>
    d["itemName"] ? `Shipped: ${d["itemName"]}` : "Your Gem State Classifieds order has shipped",
  displayName: "Order shipped (buyer)",
  previewData: {
    itemName: "2019 Toyota Tacoma TRD Off-Road 4x4",
    orderNumber: "GS-100234",
    carrier: "USPS",
    trackingNumber: "9400100000000000000000",
    orderPath: "/orders/example",
  },
} satisfies TemplateEntry;
