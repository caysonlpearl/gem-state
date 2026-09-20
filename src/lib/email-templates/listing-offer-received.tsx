/* eslint-disable @typescript-eslint/no-explicit-any -- template payloads are registry-driven JSON */
import * as React from "react";
import type { TemplateEntry } from "./registry";
import { EmailShell, money } from "./shell";

interface Props {
  itemName?: string;
  offerCents?: number;
  listingCents?: number;
  currency?: string;
  secured?: boolean;
}

const Email = ({ itemName, offerCents, listingCents, currency, secured }: Props) => (
  <EmailShell
    preview="You have a new offer on your listing"
    heading="New offer on your listing"
    intro={`A buyer made an offer${itemName ? ` on ${itemName}` : ""}. You can accept it, counter it, or decline from your Selling page.${secured ? " The buyer's payment method is already secured for this offer." : ""}`}
    facts={[
      { label: "Item", value: itemName ?? "" },
      { label: "Offer", value: money(offerCents, currency) },
      { label: "Your listing price", value: money(listingCents, currency) },
    ]}
    ctaLabel="Review the offer"
    ctaPath="/selling"
  />
);

export const template = {
  component: Email,
  subject: (d: Record<string, any>) =>
    d["itemName"] ? `New offer on ${d["itemName"]}` : "New offer on your listing",
  displayName: "Offer received (seller)",
  previewData: {
    itemName: "2021 Ford F-150 XLT SuperCrew 4WD",
    offerCents: 3200,
    listingCents: 3800,
    currency: "USD",
    secured: true,
  },
} satisfies TemplateEntry;
