/* eslint-disable @typescript-eslint/no-explicit-any -- template payloads are registry-driven JSON */
import * as React from "react";
import type { TemplateEntry } from "./registry";
import { EmailShell, money } from "./shell";

interface Props {
  itemName?: string;
  orderNumber?: string;
  totalCents?: number;
  currency?: string;
  orderPath?: string;
}

const Email = ({ itemName, orderNumber, totalCents, currency, orderPath }: Props) => (
  <EmailShell
    preview={`Your Gem State Classifieds order ${orderNumber ?? ""} is confirmed`}
    heading="Your order is confirmed"
    intro={`Thanks for your purchase${itemName ? ` of ${itemName}` : ""}. Your payment went through and the seller has been notified to ship it.`}
    facts={[
      { label: "Item", value: itemName ?? "" },
      { label: "Order", value: orderNumber ?? "" },
      { label: "Total paid", value: money(totalCents, currency) },
    ]}
    ctaLabel="View your order"
    ctaPath={orderPath ?? "/buying"}
    note="You'll get another email as soon as tracking is added."
  />
);

export const template = {
  component: Email,
  subject: (d: Record<string, any>) =>
    d["orderNumber"]
      ? `Order ${d["orderNumber"]} confirmed`
      : "Your Gem State Classifieds order is confirmed",
  displayName: "Purchase confirmed (buyer)",
  previewData: {
    itemName: "2019 Toyota Tacoma TRD Off-Road 4x4",
    orderNumber: "GS-100234",
    totalCents: 6499,
    currency: "USD",
    orderPath: "/orders/example",
  },
} satisfies TemplateEntry;
