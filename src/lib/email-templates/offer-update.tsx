/* eslint-disable @typescript-eslint/no-explicit-any -- template payloads are registry-driven JSON */
import * as React from "react";
import type { TemplateEntry } from "./registry";
import { EmailShell, money } from "./shell";

interface Props {
  outcome?: "countered" | "declined" | "accepted";
  itemName?: string;
  offerCents?: number;
  counterCents?: number;
  currency?: string;
}

const copy = {
  countered: {
    heading: "The seller countered your offer",
    intro: "The seller sent back a counteroffer. Accept it in checkout or make another offer.",
    cta: "View the counteroffer",
  },
  declined: {
    heading: "Your offer was declined",
    intro: "The seller declined your offer. You can make a new offer or buy at the listing price.",
    cta: "Back to the item",
  },
  accepted: {
    heading: "Your offer was accepted",
    intro: "The seller accepted your offer. Complete checkout to lock in the sale.",
    cta: "Complete checkout",
  },
} as const;

const Email = ({ outcome = "countered", itemName, offerCents, counterCents, currency }: Props) => {
  const c = copy[outcome] ?? copy.countered;
  return (
    <EmailShell
      preview={c.heading}
      heading={c.heading}
      intro={c.intro}
      facts={[
        { label: "Item", value: itemName ?? "" },
        { label: "Your offer", value: money(offerCents, currency) },
        ...(outcome === "countered"
          ? [{ label: "Seller counteroffer", value: money(counterCents, currency) }]
          : []),
      ]}
      ctaLabel={c.cta}
      ctaPath="/buying"
    />
  );
};

export const template = {
  component: Email,
  subject: (d: Record<string, any>) => {
    const outcome = d["outcome"] ?? "countered";
    if (outcome === "declined") return "Your offer was declined";
    if (outcome === "accepted") return "Your offer was accepted";
    return "You have a counteroffer";
  },
  displayName: "Offer update (buyer)",
  previewData: {
    outcome: "countered",
    itemName: "2021 Ford F-150 XLT SuperCrew 4WD",
    offerCents: 3200,
    counterCents: 3500,
    currency: "USD",
  },
} satisfies TemplateEntry;
