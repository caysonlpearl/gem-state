/* eslint-disable @typescript-eslint/no-explicit-any -- template payloads are registry-driven JSON */
import * as React from "react";
import type { TemplateEntry } from "./registry";
import { EmailShell } from "./shell";

interface Props {
  stage?: "opened" | "resolved";
  itemName?: string;
  orderNumber?: string;
  outcome?: string;
  orderPath?: string;
}

const Email = ({ stage = "opened", itemName, orderNumber, outcome, orderPath }: Props) => (
  <EmailShell
    preview={
      stage === "resolved" ? "Your dispute has been resolved" : "A dispute was opened on your order"
    }
    heading={stage === "resolved" ? "Dispute resolved" : "Dispute opened"}
    intro={
      stage === "resolved"
        ? "A Gem State Classifieds operator reviewed this order and recorded a decision. The details are on the order page."
        : "A dispute was opened on this order. A Gem State Classifieds operator will review it and follow up on the order page."
    }
    facts={[
      { label: "Item", value: itemName ?? "" },
      { label: "Order", value: orderNumber ?? "" },
      ...(outcome ? [{ label: "Outcome", value: outcome }] : []),
    ]}
    ctaLabel="View the order"
    ctaPath={orderPath ?? "/buying"}
  />
);

export const template = {
  component: Email,
  subject: (d: Record<string, any>) =>
    d["stage"] === "resolved"
      ? "Your Gem State Classifieds dispute was resolved"
      : "A dispute was opened on your order",
  displayName: "Dispute update (buyer / seller)",
  previewData: {
    stage: "opened",
    itemName: "2019 Toyota Tacoma TRD Off-Road 4x4",
    orderNumber: "GS-100234",
    orderPath: "/orders/example",
  },
} satisfies TemplateEntry;
