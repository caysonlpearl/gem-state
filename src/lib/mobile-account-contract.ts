import { z } from "zod";
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
