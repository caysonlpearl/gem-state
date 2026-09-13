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
    preview="You have a new park shopping job"
    heading="New shopping job"
    intro={`A buyer has paid for a park-sourcing job${itemName ? ` for ${itemName}` : ""}. Open the job to start shopping, then record the receipt and ship it.`}
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
  subject: "New park shopping job",
  displayName: "New shopping job (shopper)",
  previewData: {
    itemName: "Figment Attraction Pin",
    orderNumber: "PV-100240",
    feeCents: 2500,
    maxSpendCents: 3500,
    currency: "USD",
    orderPath: "/shopper",
  },
} satisfies TemplateEntry;
