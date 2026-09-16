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
    preview="The buyer confirmed delivery"
    heading="Delivery confirmed"
    intro={`The buyer confirmed that ${itemName ?? "the item"} arrived. Your payout is queued for release.`}
    facts={[
      { label: "Item", value: itemName ?? "" },
      { label: "Order", value: orderNumber ?? "" },
      { label: "Payout", value: money(payoutCents, currency) },
    ]}
    ctaLabel="View the order"
    ctaPath={orderPath ?? "/selling"}
  />
);

export const template = {
  component: Email,
  subject: "Delivery confirmed",
  displayName: "Delivery confirmed (seller / shopper)",
  previewData: {
    itemName: "2019 Toyota Tacoma TRD Off-Road 4x4",
    orderNumber: "GS-100234",
    payoutCents: 5400,
    currency: "USD",
    orderPath: "/orders/example",
  },
} satisfies TemplateEntry;
