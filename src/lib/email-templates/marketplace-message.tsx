/* eslint-disable @typescript-eslint/no-explicit-any -- template payloads are registry-driven JSON */
import type { TemplateEntry } from "./registry";
import { EmailShell } from "./shell";

interface Props {
  itemName?: string;
  message?: string;
  conversationPath?: string;
}

const Email = ({ itemName, message, conversationPath }: Props) => (
  <EmailShell
    preview={`New message about ${itemName ?? "a Gem State listing"}`}
    heading="New marketplace message"
    intro={`You received a new message about ${itemName ?? "a listing"}. Reply inside Gem State to keep the conversation safe and organized.`}
    facts={[
      { label: "Listing", value: itemName ?? "" },
      { label: "Message", value: message ?? "" },
    ]}
    ctaLabel="Open conversation"
    ctaPath={conversationPath ?? "/account?section=messages"}
    note="Never send payment details or sensitive information in marketplace messages."
  />
);

export const template = {
  component: Email,
  subject: (data: Record<string, any>) =>
    data["itemName"]
      ? `New message about ${data["itemName"]}`
      : "New Gem State marketplace message",
  displayName: "Marketplace message",
  previewData: {
    itemName: "North End Bungalow",
    message: "Is this still available?",
    conversationPath: "/account?section=messages",
  },
} satisfies TemplateEntry;
