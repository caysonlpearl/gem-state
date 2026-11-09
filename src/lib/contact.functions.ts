import { createServerFn } from "@tanstack/react-start";
import { contactSchema } from "./contact-contract";
import { publicServerClient } from "./supabase-public.server";

export type { ContactInput } from "./contact-contract";

/** Public intake; existing RLS keeps submitted messages readable by admins only. */
export const submitContactMessage = createServerFn({ method: "POST" })
  .validator((input: unknown) => contactSchema.parse(input))
  .handler(async ({ data }) => {
    const { saveContactIntake } = await import("./contact-intake.server");
    const client = publicServerClient();
    return saveContactIntake(data, (row) => client.from("contact_messages").insert(row));
  });
