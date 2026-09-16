import type { TemplateEntry } from "./registry";
import { EmailShell } from "./shell";

interface Props {
  itemName?: string;
  buyerName?: string;
  message?: string;
}

const Email = ({ itemName, buyerName, message }: Props) => (
  <EmailShell
    preview={`A buyer is asking about ${itemName ?? "your listing"}`}
    heading="New question about your listing"
    intro={`${buyerName ?? "A buyer"} sent you a message about ${itemName ?? "your listing"}. Reply directly to this email to continue the conversation.`}
    facts={[
      { label: "Listing", value: itemName ?? "" },
      { label: "Message", value: message ?? "" },
    ]}
    ctaLabel="Open Selling"
    ctaPath="/selling"
  />
);

export const template = {
  component: Email,
  subject: (d: Record<string, any>) =>
    d["itemName"] ? `New question about ${d["itemName"]}` : "New question about your listing",
  displayName: "Listing inquiry received (seller)",
  previewData: {
    itemName: "2021 Ford F-150 XLT",
    buyerName: "Jordan",
    message: "Is this still available? Could I see it this weekend?",
  },
} satisfies TemplateEntry;
