/** Client-safe labels/options for shopper service profiles and sourcing options. */

export const AVAILABILITY_HOURS = [2, 4, 8, 12, 24, 48, 72] as const;

export const confidenceLabels: Record<string, string> = {
  reported: "Reported by a member",
  confirmed: "Confirmed by independent reports",
  approved_shopper_confirmed: "Approved-shopper confirmed",
  receipt_verified: "Receipt verified",
  administrator_verified: "Administrator verified",
  stale: "Observation is stale",
  none: "No price observations yet",
};
