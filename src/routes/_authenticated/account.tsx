import { createFileRoute } from "@tanstack/react-router";

import {
  ACCOUNT_SECTIONS,
  AccountCenter,
  type AccountSection,
} from "@/components/account/AccountCenter";

// Save listings, contact sellers and arrange pickup from one account center.

export const Route = createFileRoute("/_authenticated/account")({
  validateSearch: (search: Record<string, unknown>) => {
    const rawSection = typeof search.section === "string" ? search.section : "overview";
    const section = (ACCOUNT_SECTIONS as readonly string[]).includes(rawSection)
      ? (rawSection as AccountSection)
      : "overview";
    const conversation =
      typeof search.conversation === "string" ? search.conversation.slice(0, 80) : undefined;
    return { section, conversation };
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
  return <AccountCenter section={search.section} conversationId={search.conversation} />;
}
