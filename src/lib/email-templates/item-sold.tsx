import * as React from "react";
import type { TemplateEntry } from "./registry";
import { EmailShell, money } from "./shell";

interface Props {
  itemName?: string;
  orderNumber?: string;
  payoutCents?: number;
  currency?: string;
  orderPath?: string;
}

const Email = ({ itemName, orderNumber, payoutCents, currency, orderPath }: Props) => (
  <EmailShell
    preview={`You sold ${itemName ?? "an item"} on Gem State Classifieds`}
    heading="Your item sold"
    intro={`${itemName ? `${itemName} sold` : "Your listing sold"} and the buyer has paid. Add tracking once it's on its way — the buyer's shipping address is on the order page.`}
    facts={[
      { label: "Item", value: itemName ?? "" },
      { label: "Order", value: orderNumber ?? "" },
      { label: "Your payout", value: money(payoutCents, currency) },
    ]}
    ctaLabel="Ship this item"
    ctaPath={orderPath ?? "/selling"}
    note="Payouts are sent after delivery is confirmed."
  />
);

export const template = {
  component: Email,
  subject: (d: Record<string, any>) =>
    d["itemName"] ? `Sold: ${d["itemName"]}` : "Your Gem State Classifieds item sold",
  displayName: "Item sold (seller)",
  previewData: {
    itemName: "2019 Toyota Tacoma TRD Off-Road 4x4",
    orderNumber: "GS-100234",
    payoutCents: 5400,
    currency: "USD",
    orderPath: "/orders/example",
  },
} satisfies TemplateEntry;
