import * as React from "react";
import type { TemplateEntry } from "./registry";
import { EmailShell, money } from "./shell";

interface Props {
  itemName?: string;
  orderNumber?: string;
  feeCents?: number;
  maxSpendCents?: number;
  currency?: string;
  orderPath?: string;
}

const Email = ({ itemName, orderNumber, feeCents, maxSpendCents, currency, orderPath }: Props) => (
  <EmailShell
    preview="You have a new marketplace assistance request"
    heading="New shopping job"
    intro={`A buyer has paid for a marketplace assistance request${itemName ? ` for ${itemName}` : ""}. Open the request to review the details and next steps.`}
    facts={[
      { label: "Item", value: itemName ?? "" },
      { label: "Order", value: orderNumber ?? "" },
      { label: "Your shopper fee", value: money(feeCents, currency) },
      { label: "Approved item maximum", value: money(maxSpendCents, currency) },
    ]}
    ctaLabel="Open the job"
    ctaPath={orderPath ?? "/shopper"}
  />
);

export const template = {
  component: Email,
  subject: "New marketplace assistance request",
  displayName: "New shopping job (shopper)",
  previewData: {
    itemName: "Portable propane fire pit",
    orderNumber: "GS-100240",
    feeCents: 2500,
    maxSpendCents: 3500,
    currency: "USD",
    orderPath: "/shopper",
  },
} satisfies TemplateEntry;
