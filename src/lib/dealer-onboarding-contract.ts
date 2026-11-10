import { z } from "zod";
export const dealerOnboardingSchema = z.object({
  displayName: z.string().trim().min(2).max(120),
  slug: z
    .string()
    .trim()
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)
    .max(80),
  ownerEmail: z.string().trim().toLowerCase().email().max(255),
  email: z.string().trim().toLowerCase().email().max(255),
  phone: z.string().trim().min(7).max(40),
  website: z
    .string()
    .trim()
    .url()
    .refine((v) => /^https:\/\/[a-zA-Z0-9.-]+\/?$/.test(v), "Use the dealership HTTPS website"),
  logoUrl: z
    .string()
    .trim()
    .url()
    .refine((v) => v.startsWith("https://"), "Use an HTTPS logo"),
  address: z.string().trim().min(1).max(160),
  city: z.string().trim().min(1).max(80),
  state: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^[A-Z]{2}$/),
  postalCode: z
    .string()
    .trim()
    .regex(/^\d{5}$/),
  description: z.string().trim().max(500).default(""),
  sourceId: z.string().uuid().optional().nullable(),
});
export type DealerOnboardingInput = z.infer<typeof dealerOnboardingSchema>;
