import { createFileRoute } from "@tanstack/react-router";

import {
  ACCOUNT_SECTIONS,
  AccountCenter,
  type AccountSection,
} from "@/components/account/AccountCenter";

// Save listings, contact sellers and arrange pickup from one account center.

export const Route = createFileRoute("/_authenticated/account")({
  validateSearch: (
    search: Record<string, unknown>,
  ): { section?: AccountSection; conversation?: string | undefined } => {
    const rawSection = typeof search["section"] === "string" ? search["section"] : "overview";
    const section = (ACCOUNT_SECTIONS as readonly string[]).includes(rawSection)
      ? (rawSection as AccountSection)
      : "overview";
    const rawConversation =
      typeof search["conversation"] === "string" ? search["conversation"] : undefined;
    const conversation = rawConversation ? rawConversation.slice(0, 80) : undefined;
    return conversation === undefined ? { section } : { section, conversation };
  },
  head: () => ({
    meta: [
      { title: "Account center · Gem State Classifieds" },
      {
        name: "description",
        content: "Manage your Gem State profile, saved listings, messages, and seller tools.",
      },
      { name: "robots", content: "noindex,nofollow" },
    ],
  }),
  component: AccountPage,
});

function AccountPage() {
  const search = Route.useSearch();
  return (
    <AccountCenter
      section={search.section ?? "overview"}
      conversationId={search.conversation}
    />
  );
}
