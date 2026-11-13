import { z } from "zod";

export const DEALER_INQUIRY_STATUSES = ["new", "contacted", "closed"] as const;
export type DealerInquiryStatus = (typeof DEALER_INQUIRY_STATUSES)[number];
export function dealerLandingSearch(input: Record<string, unknown>) {
  const result: Record<string, string> = {};
  for (const key of [
    "oppref",
    "utm_source",
    "utm_medium",
    "utm_campaign",
    "utm_content",
    "utm_term",
    "_qa",
    "_verify",
  ]) {
    if (typeof input[key] === "string" && input[key].length <= (key === "oppref" ? 2048 : 160))
      result[key] = input[key];
  }
  if (input._qa === 1 || input._qa === "1") result._qa = "1";
  if (Object.prototype.hasOwnProperty.call(input, "_verify")) result._verify = "1";
  return result;
}
const website = z
  .string()
  .trim()
  .max(300)
  .transform((value) => (/^https?:\/\//i.test(value) ? value : `https://${value}`))
  .pipe(
    z
      .string()
      .url("Enter your dealership website")
      .refine((value) => {
        let url: URL;
        try {
          url = new URL(value);
        } catch {
          return false;
        }
        return (
          ["https:", "http:"].includes(url.protocol) &&
          !url.username &&
          !url.password &&
          url.hostname.includes(".")
        );
      }, "Enter a valid dealership website"),
  );
export const dealerInquirySchema = z.object({
  requestKey: z.string().guid(),
  dealershipName: z.string().trim().min(1, "Enter your dealership name").max(160),
  website,
  name: z.string().trim().min(1, "Enter your name").max(120),
  email: z.string().trim().email("Enter a valid email address").max(255),
  phone: z.string().trim().max(40).default(""),
  provider: z.string().trim().max(160).default(""),
  inventoryCount: z.string().trim().max(30).default(""),
  notes: z.string().trim().max(2000).default(""),
  companyFax: z.string().max(0, "Please try again").default(""),
  attribution: z
    .object({
      utm_source: z.string().max(160).optional(),
      utm_medium: z.string().max(160).optional(),
      utm_campaign: z.string().max(160).optional(),
      utm_content: z.string().max(160).optional(),
      utm_term: z.string().max(160).optional(),
    })
    .default({}),
});
export type DealerInquiryInput = z.infer<typeof dealerInquirySchema>;
export type DealerInquiryAcknowledgement = {
  ok: true;
  interest: "dealership";
  eventId: string;
  created: boolean;
};
export type DealerInquiry = {
  id: string;
  created_at: string;
  dealership_name: string;
  website: string;
  name: string;
  email: string;
  phone: string;
  provider: string;
  inventory_count: string;
  notes: string;
  status: DealerInquiryStatus;
  attribution: Record<string, string>;
  notification_status: "pending" | "sending" | "sent" | "failed";
  notification_attempts: number;
  notification_sent_at: string | null;
};
