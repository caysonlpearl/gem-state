import { api, ApiError, auth } from "./client";
import { installIdentifier } from "./identity";
import { sendMessageOnce } from "./message-retries";

type Prepared = { path: string; token: string; contentType: string; size: number };
type Uploaded = Omit<Prepared, "token"> & { fingerprint: string };
const pending = new Map<string, Uploaded>();
const flights = new Map<string, { body: string; file: File; promise: Promise<unknown> }>();
const types = new Set(["image/jpeg", "image/png", "image/webp", "application/pdf"]);

/** A shopper explicitly retries. Upload receipts hold only an account-scoped
 * object reference and content hash, never file bytes, message text or tokens. */
export function sendConversationAttachmentOnce(
  userId: string,
  conversationId: string,
  body: string,
  file: File,
): Promise<{ messageId: string }> {
  const scope = `${userId}:${conversationId}`,
    flight = flights.get(scope);
  if (flight)
    return flight.body === body && flight.file === file
      ? (flight.promise as Promise<{ messageId: string }>)
      : Promise.reject(Error("Your previous message is still sending."));
  const promise = send(userId, conversationId, body, file);
  const current = { body, file, promise };
  flights.set(scope, current);
  const done = () => {
    if (flights.get(scope) === current) flights.delete(scope);
  };
  void promise.then(done, done);
  return promise;
}
async function send(userId: string, conversationId: string, body: string, file: File) {
  if (!types.has(file.type) || file.size < 1 || file.size > 10 * 1024 * 1024)
    throw Error("Use a JPG, PNG, WebP, or PDF no larger than 10 MB.");
  const actor = { userId, installId: installIdentifier() };
  const key = `bb-draft-file-${userId}-${conversationId}`;
  const hash = Array.from(
    new Uint8Array(await crypto.subtle.digest("SHA-256", await file.arrayBuffer())),
  )
    .map((n) => n.toString(16).padStart(2, "0"))
    .join("");
  const fingerprint = `${file.type}:${file.size}:${hash}`;
  let uploaded = pending.get(key);
  try {
    uploaded ??= JSON.parse(sessionStorage.getItem(key) ?? "null");
  } catch {
    /* Optional storage. */
  }
  const remember = (value: Uploaded) => {
    pending.set(key, value);
    try {
      sessionStorage.setItem(key, JSON.stringify(value));
    } catch {
      /* Memory fallback. */
    }
  };
  const finish = async (value: Uploaded) => {
    const result = await sendMessageOnce<{ messageId: string }>(
      userId,
      `conversations/${conversationId}/attachments/send`,
      {
        body: body.trim() || "Shared an attachment.",
        attachmentPath: value.path,
        attachmentContentType: value.contentType,
        attachmentSize: value.size,
      },
    );
    if (pending.get(key)?.path === value.path) pending.delete(key);
    try {
      if (JSON.parse(sessionStorage.getItem(key) ?? "null")?.path === value.path)
        sessionStorage.removeItem(key);
    } catch {
      /* Optional storage. */
    }
    return result;
  };
  if (
    uploaded?.fingerprint === fingerprint &&
    typeof uploaded.path === "string" &&
    uploaded.contentType === file.type &&
    uploaded.size === file.size &&
    uploaded.path.startsWith(`${userId}/${conversationId}/`)
  ) {
    try {
      return await finish(uploaded);
    } catch (error) {
      // An uncertain upload is checked by the atomic server finalization before
      // allocating another object. Lost commit responses reuse the same receipt.
      if (!(error instanceof ApiError) || error.code !== "attachment_upload_missing") throw error;
    }
  }
  const prepared = await api<Prepared>(
    `conversations/${conversationId}/attachments`,
    "POST",
    {
      fileName: file.name,
      contentType: file.type,
      size: file.size,
    },
    undefined,
    actor,
  );
  if (
    typeof prepared.path !== "string" ||
    typeof prepared.token !== "string" ||
    !prepared.token ||
    !prepared.path.startsWith(`${userId}/${conversationId}/`) ||
    prepared.contentType !== file.type ||
    prepared.size !== file.size
  )
    throw Error("Bluebird could not prepare this attachment. Please try again.");
  const value = {
    path: prepared.path,
    contentType: prepared.contentType,
    size: prepared.size,
    fingerprint,
  };
  remember(value);
  const session = (await auth.auth.getSession()).data.session;
  if (session?.user.id !== userId || installIdentifier() !== actor.installId)
    throw Error("Your account changed. Please try again.");
  const { error } = await auth.storage
    .from("conversation-attachments")
    .uploadToSignedUrl(prepared.path, prepared.token, file, { contentType: prepared.contentType });
  if (error) throw Error(error.message);
  return finish(value);
}
export function clearConversationAttachmentMemory() {
  pending.clear();
  flights.clear();
}
