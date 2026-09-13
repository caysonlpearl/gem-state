import * as React from "react";
import { EmailShell } from "./shell";
import type { TemplateEntry } from "./registry";

const Email = ({
  itemName,
  orderNumber,
  orderPath,
}: {
  itemName?: string;
  orderNumber?: string;
  orderPath?: string;
}) => (
  <EmailShell
    preview="Your item arrived. How was your experience?"
    heading="How was your ParkVault purchase?"
    intro="Your order is complete. Leave an honest review to help other buyers choose a seller or park shopper."
    facts={[
      { label: "Item", value: itemName ?? "" },
      { label: "Order", value: orderNumber ?? "" },
    ]}
    ctaLabel="Leave a review"
    ctaPath={orderPath ?? "/buying"}
  />
);

export const template = {
  component: Email,
  subject: "How was your ParkVault purchase?",
  displayName: "Completed order review request",
  previewData: { itemName: "Park merchandise", orderNumber: "PV-PREVIEW", orderPath: "/buying" },
} satisfies TemplateEntry;
