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
    heading="How was your Gem State Classifieds purchase?"
    intro="Your order is complete. Leave an honest review to help other buyers choose a seller."
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
  subject: "How was your Gem State Classifieds purchase?",
  displayName: "Completed order review request",
  previewData: { itemName: "2019 Toyota Tacoma", orderNumber: "GSC-PREVIEW", orderPath: "/buying" },
} satisfies TemplateEntry;
