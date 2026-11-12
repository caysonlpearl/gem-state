import { employerKey, NOT_A_COMPANY } from "./employer-logo-match.ts";

/**
 * Validation for an employer's claim on their business's Jobs presence.
 * Pure and shared so the member-facing form and the server function agree;
 * mirrors the service-directory claim rules.
 */
export type EmployerClaimInput = {
  employerName: string;
  city?: string;
  state?: string;
  role: string;
  contact: string;
  note?: string;
};

export type ValidEmployerClaim = {
  employerKey: string;
  employerName: string;
  city: string;
  state: string;
  role: string;
  contact: string;
  note: string | null;
};

export function validateEmployerClaimInput(input: EmployerClaimInput): ValidEmployerClaim {
  const employerName = String(input?.employerName ?? "").trim();
  const key = employerKey(employerName);
  const city = String(input?.city ?? "").trim();
  const state = String(input?.state ?? "").trim();
  const role = String(input?.role ?? "").trim();
  const contact = String(input?.contact ?? "").trim();
  const note = String(input?.note ?? "").trim();
  if (
    employerName.length < 2 ||
    employerName.length > 200 ||
    key.length < 3 ||
    NOT_A_COMPANY.has(key)
  )
    throw new Error("This business can't be claimed.");
  if (city.length > 120 || state.length > 40) throw new Error("That place doesn't look right.");
  if (role.length < 2 || role.length > 80) throw new Error("Tell us your role at the business.");
  if (contact.length < 3 || contact.length > 200)
    throw new Error("Add the business phone or email we can reach you at.");
  if (note.length > 1000) throw new Error("Keep the note under 1,000 characters.");
  return {
    employerKey: key,
    employerName,
    city,
    state,
    role,
    contact,
    note: note || null,
  };
}
