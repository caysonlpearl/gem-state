import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { publicServerClient } from "./supabase-public.server";

/**
 * Contact form intake. Public on purpose: anyone can send ParkVault a message
 * without an account. Only admins can read the rows back (RLS), and nothing
 * here is ever echoed to the caller besides an acknowledgement.
 */
const contactSchema = z.object({
  name: z.string().trim().min(1, "Enter your name").max(120, "Name is too long"),
  email: z.string().trim().email("Enter a valid email address").max(255),
  subject: z.string().trim().min(1, "Enter a subject").max(160, "Subject is too long"),
  message: z
    .string()
    .trim()
    .min(10, "Tell us a little more so we can help")
    .max(4000, "Message is too long"),
});

export type ContactInput = z.infer<typeof contactSchema>;

export const submitContactMessage = createServerFn({ method: "POST" })
  .validator((input: unknown) => contactSchema.parse(input))
  .handler(async ({ data }): Promise<{ ok: true }> => {
    const client = publicServerClient();
    const { error } = await client.from("contact_messages").insert({
      name: data.name,
      email: data.email,
      subject: data.subject,
      message: data.message,
    });
    if (error) throw new Error("We could not send your message. Please try again.");
    return { ok: true };
  });
