import * as React from "react";
import type { TemplateEntry } from "./registry";
import { EmailShell, money } from "./shell";

interface Props {
  approved?: boolean;
  itemName?: string;
  priceCents?: number;
  currency?: string;
  reason?: string;
}

const Email = ({ approved = true, itemName, priceCents, currency, reason }: Props) => (
  <EmailShell
    preview={approved ? "Your listing is live" : "Your listing needs changes"}
    heading={approved ? "Your listing is live" : "Your listing needs changes"}
    intro={
      approved
        ? `${itemName ?? "Your listing"} passed review and is now visible to buyers.`
        : `${itemName ?? "Your listing"} wasn't approved yet. Update it and resubmit — nothing was charged.`
    }
    facts={[
      { label: "Item", value: itemName ?? "" },
      { label: "Listing price", value: money(priceCents, currency) },
      ...(!approved && reason ? [{ label: "What to fix", value: reason }] : []),
    ]}
    ctaLabel={approved ? "View your listings" : "Edit your listing"}
    ctaPath="/selling"
  />
);

export const template = {
  component: Email,
  subject: (d: Record<string, any>) =>
    d["approved"] === false ? "Your listing needs changes" : "Your listing is live",
  displayName: "Listing review outcome (seller)",
  previewData: {
    approved: true,
    itemName: "Figment Attraction Pin",
    priceCents: 3800,
    currency: "USD",
  },
} satisfies TemplateEntry;
