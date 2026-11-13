export const MEMBER_INTENTS = ["buying", "selling", "shopping_in_park", "browsing"] as const;
export type MemberIntent = (typeof MEMBER_INTENTS)[number];

export const intentLabels: Record<MemberIntent, string> = {
  buying: "Buying items",
  selling: "Selling items",
  shopping_in_park: "Buying and selling locally",
  browsing: "Browsing classifieds",
};
