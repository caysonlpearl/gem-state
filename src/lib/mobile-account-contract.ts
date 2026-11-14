import { z } from "zod";
import { PARTNER_VEHICLE_ID } from "./marketcheck-contract.ts";
import { MEMBER_INTENTS } from "../config/account.ts";

export const mobileProfileInput = z
  .object({
    displayName: z.string().trim().min(2).max(40),
    homeResortCode: z.literal("ID"),
    primaryIntent: z.enum(MEMBER_INTENTS),
  })
  .strict();
export const mobileAvatarInput = z.object({ path: z.string().min(1).max(200).nullable() }).strict();
export const mobileContactInput = z
  .object({
    allowEmail: z.boolean(),
    allowPhone: z.boolean(),
    allowText: z.boolean(),
    showContactButtons: z.boolean(),
    allowInternalMessages: z.boolean(),
  })
  .strict();
export const mobileNotificationPreferencesInput = z
  .object({
    messageAlerts: z.boolean(),
    listingActivity: z.boolean(),
    savedSearchMatches: z.boolean(),
    reviewRequests: z.boolean(),
    listingUpgradeReceipts: z.boolean(),
    productUpdates: z.boolean(),
    marketingEmail: z.boolean(),
  })
  .strict();

export type MobileSavedAccount = {
  ownerId: string;
  watched: import("./community.functions").WatchedVariant[];
  jobs: import("./mobile-contract").MobileListing[];
  homes: import("./mobile-contract").MobileListing[];
  vehicles: import("./mobile-contract").MobileListing[];
};

/** Closed app-eligible partner references; removal never resolves live inventory. */
export function mobileSavedPartnerSource(
  id: string,
): "saved_partner_vehicles" | "saved_partner_homes" | "saved_partner_jobs" | null {
  if (PARTNER_VEHICLE_ID.test(id)) return "saved_partner_vehicles";
  if (/^(mashvisor-\d{1,15}|openwebninja-(?:redfin-)?\d{1,20})$/.test(id))
    return "saved_partner_homes";
  if (/^(adzuna-\d{1,20}|fsq-[0-9a-f]{24}|rescuegroups-\d{1,20})$/.test(id))
    return "saved_partner_jobs";
  return null;
}
export const mobileSavedPartnerRemovalInput = z
  .object({
    listingId: z
      .string()
      .max(200)
      .refine((id) => mobileSavedPartnerSource(id) !== null),
  })
  .strict();
