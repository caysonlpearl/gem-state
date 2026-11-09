import {
  contactMessageRow,
  type ContactInput,
  type ContactAcknowledgement,
} from "./contact-contract.ts";

/** An acknowledgement exists only after the contact row has been accepted. */
export async function saveContactIntake(
  input: ContactInput,
  insert: (row: ReturnType<typeof contactMessageRow>) => PromiseLike<{ error: unknown }>,
): Promise<ContactAcknowledgement> {
  const { error } = await insert(contactMessageRow(input));
  if (error) throw new Error("We could not send your message. Please try again.");
  return { ok: true, interest: input.interest, eventId: crypto.randomUUID() };
}
