// Kept apart from AccountCenter so the account route's search validation
// (which ships with every page) doesn't pull the whole account UI along.
export const ACCOUNT_SECTIONS = [
  "overview",
  "profile",
  "settings",
  "listings",
  "saved",
  "searches",
  "messages",
  "notifications",
  "reviews",
  "billing",
] as const;

export type AccountSection = (typeof ACCOUNT_SECTIONS)[number];
