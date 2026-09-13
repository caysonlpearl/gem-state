import * as React from "react";
import type { TemplateEntry } from "./registry";
import { EmailShell, money } from "./shell";

interface Props {
  stage?: "started" | "purchased" | "balance_due" | "unavailable";
  itemName?: string;
  orderNumber?: string;
  amountCents?: number;
  currency?: string;
  orderPath?: string;
}

const copy = {
  started: {
    heading: "Your shopper is shopping",
    intro:
      "Your park shopper has started looking for your item. You will hear back as soon as they find it.",
    cta: "View your order",
  },
  purchased: {
    heading: "Your shopper found your item",
    intro: "Your shopper bought your item in the park and will ship it next.",
    cta: "View your order",
  },
  balance_due: {
    heading: "Your shopper found your item",
    intro:
      "The item cost a little more than the estimate. Approve the small balance so your shopper can ship it.",
    cta: "Review the balance",
  },
  unavailable: {
    heading: "Your item could not be found",
    intro:
      "Your shopper could not find this item in the park, so your order was cancelled and refunded in full.",
    cta: "View your order",
  },
} as const;

const Email = ({
  stage = "started",
  itemName,
  orderNumber,
  amountCents,
  currency,
  orderPath,
}: Props) => {
  const c = copy[stage] ?? copy.started;
  return (
    <EmailShell
      preview={c.heading}
      heading={c.heading}
      intro={c.intro}
      facts={[
        { label: "Item", value: itemName ?? "" },
        { label: "Order", value: orderNumber ?? "" },
        ...(amountCents
          ? [
              {
                label: stage === "unavailable" ? "Refunded" : "Amount",
                value: money(amountCents, currency),
              },
            ]
          : []),
      ]}
      ctaLabel={c.cta}
      ctaPath={orderPath ?? "/buying"}
    />
  );
};

export const template = {
  component: Email,
  subject: (d: Record<string, any>) => {
    const stage = d["stage"] ?? "started";
    if (stage === "purchased") return "Your shopper found your item";
    if (stage === "balance_due") return "Small balance due on your sourcing order";
    if (stage === "unavailable") return "Your sourcing order was refunded";
    return "Your shopper is shopping for your item";
  },
  displayName: "Sourcing update (buyer)",
  previewData: {
    stage: "started",
    itemName: "Figment Attraction Pin",
    orderNumber: "PV-100240",
    currency: "USD",
    orderPath: "/orders/example",
  },
} satisfies TemplateEntry;
