import { z } from "zod";

export const CONTACT_INTERESTS = ["general", "dealership", "advertising"] as const;
export type ContactInterest = (typeof CONTACT_INTERESTS)[number];
export function contactSearch(input: Record<string, unknown>): {
  interest?: ContactInterest;
  oppref?: string;
} {
  return {
    interest: CONTACT_INTERESTS.includes(input.interest as ContactInterest)
      ? (input.interest as ContactInterest)
      : undefined,
    // Keep the SDK's opaque ad reference across the advertising/contact link.
    // It is never included in the stored message or Bluebird analytics.
    oppref:
      typeof input.oppref === "string" && input.oppref.length <= 2048 ? input.oppref : undefined,
  };
}
export const contactSchema = z
  .object({
    name: z.string().trim().min(1, "Enter your name").max(120),
    email: z.string().trim().email("Enter a valid email address").max(255),
    subject: z.string().trim().min(1, "Enter a subject").max(160),
    message: z.string().trim().min(10, "Tell us a little more so we can help").max(4000),
    interest: z.enum(CONTACT_INTERESTS).default("general"),
    dealershipName: z.string().trim().max(160).default(""),
    phone: z.string().trim().max(40).default(""),
  })
  .superRefine((input, ctx) => {
    if (input.interest === "dealership" && input.message.length > 3500) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["message"],
        message: "Keep dealership messages under 3500 characters",
      });
    }
    if (input.interest === "dealership" && !input.dealershipName) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["dealershipName"],
        message: "Enter your dealership name",
      });
    }
  });
export type ContactInput = z.infer<typeof contactSchema>;
export type ContactAcknowledgement = { ok: true; interest: ContactInterest; eventId: string };
export function contactMessageRow(input: ContactInput) {
  return {
    name: input.name,
    email: input.email,
    subject:
      input.interest === "dealership"
        ? `[Dealership] ${input.subject}`.slice(0, 160)
        : input.subject,
    message:
      input.interest === "dealership"
        ? `Dealership: ${input.dealershipName}\nSubject: ${input.subject}\n${input.phone ? `Business phone: ${input.phone}\n` : ""}\n${input.message}`
        : input.message,
  };
}
