import { api, auth, ApiError } from "./client";
import { installIdentifier } from "./identity";
import {
  resumeTypes,
  validateMobileResume,
} from "../../../src/lib/mobile-job-application-contract";
type Receipt = { signature: string; id: string; uploaded: boolean };
const memory = new Map<string, Receipt>();
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const sha = async (bytes: BufferSource) =>
  Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", bytes)), (n) =>
    n.toString(16).padStart(2, "0"),
  ).join("");
function remember(key: string, receipt: Receipt) {
  memory.set(key, receipt);
  try {
    sessionStorage.setItem(key, JSON.stringify(receipt));
  } catch {
    /* In-memory retry remains available. */
  }
}
function forget(key: string, id: string) {
  if (memory.get(key)?.id === id) memory.delete(key);
  try {
    if (JSON.parse(sessionStorage.getItem(key) ?? "null")?.id === id)
      sessionStorage.removeItem(key);
  } catch {
    /* A previous acknowledgement cannot clear a newer receipt. */
  }
}
/** Explicit retry only. Store hashes, opaque request IDs and stage, never resume bytes, upload tokens or cover letters. */
export async function submitNativeApplication(
  owner: string,
  listingId: string,
  resume: File | null,
  previousPath: string | undefined,
  coverLetter: string,
) {
  const install = installIdentifier(),
    actor = { userId: owner, installId: install };
  const current = async () => {
    const s = (await auth.auth.getSession()).data.session;
    if (s?.user.id !== owner || installIdentifier() !== install)
      throw Error("Your account changed. Please try again.");
  };
  await current();
  if (resume) validateMobileResume(resume);
  if (!resume && !previousPath) throw Error("Attach a resume to apply.");
  const file = resume ? await sha(await resume.arrayBuffer()) : previousPath;
  // An anonymous-identifier reset cannot turn an uncertain business action into a new application.
  const signature = await sha(
      new TextEncoder().encode(
        JSON.stringify({
          file,
          type: resume?.type ?? null,
          size: resume?.size ?? null,
          coverLetter: coverLetter.trim(),
        }),
      ),
    ),
    key = `bb-draft-application-${owner}-${listingId}`;
  let prior = memory.get(key);
  try {
    prior ??= JSON.parse(sessionStorage.getItem(key) ?? "null");
  } catch {
    /* Essential storage is optional. */
  }
  const attempt: Receipt =
    prior?.signature === signature && uuid.test(prior.id)
      ? { signature, id: prior.id, uploaded: prior.uploaded === true }
      : { signature, id: crypto.randomUUID(), uploaded: false };
  remember(key, attempt);
  await current();
  let path = previousPath;
  if (resume) {
    path = `${owner}/${listingId}/${attempt.id}.${resumeTypes[resume.type as keyof typeof resumeTypes]}`;
    if (!attempt.uploaded) {
      const prepared = await api<{ path: string; uploaded: boolean; token?: string }>(
        `listings/${listingId}/application/resume`,
        "POST",
        { contentType: resume.type, size: resume.size },
        undefined,
        actor,
        attempt.id,
      );
      if (prepared.path !== path)
        throw Error("The resume upload destination could not be confirmed.");
      await current();
      if (!prepared.uploaded) {
        if (!prepared.token) throw Error("The resume upload could not be prepared.");
        // A lost Storage response is ambiguous. The commit verifies the actual private
        // object and never trusts a client "uploaded" flag or issues another business send.
        await auth.storage
          .from("job-application-resumes")
          .uploadToSignedUrl(path, prepared.token, resume, { contentType: resume.type })
          .catch(() => undefined);
      }
      attempt.uploaded = true;
      remember(key, attempt);
    }
  }
  await current();
  try {
    const outcome = await api<{ applicationId: string }>(
      `listings/${listingId}/application`,
      "POST",
      { resumePath: path, coverLetter: coverLetter.trim() || null },
      undefined,
      actor,
      attempt.id,
    );
    await current();
    forget(key, attempt.id);
    return outcome;
  } catch (error) {
    // This RPC error proves its transaction rolled back. A fresh upload is safe on
    // the next explicit retry. Timeouts and lost acknowledgements retain the receipt.
    if (error instanceof ApiError && error.status === 409 && error.code === "resume_unavailable")
      forget(key, attempt.id);
    throw error;
  }
}
