import { api } from "./client";
import { installIdentifier } from "./identity";

export type MobileMessagePayload = {
  body: string;
  listingId?: string;
  attachmentPath?: string;
  attachmentContentType?: string;
  attachmentSize?: number;
};
type Attempt = { signature: string; id: string };
const memory = new Map<string, Attempt>();
const sending = new Map<string, { payload: string; promise: Promise<unknown> }>();
/** Essential pending-write receipts, scoped to this account and conversation.
 * No automatic send/replay: a retry always requires the shopper's action. */
export function sendMessageOnce<T>(
  userId: string,
  path: string,
  payload: MobileMessagePayload,
): Promise<T> {
  const scope = `${userId}:${path}`;
  const current = sending.get(scope);
  const serialized = JSON.stringify(payload);
  if (current)
    return current.payload === serialized
      ? (current.promise as Promise<T>)
      : Promise.reject(new Error("Your previous message is still sending."));
  const promise = sendAttempt<T>(userId, path, payload);
  const flight = { payload: serialized, promise };
  sending.set(scope, flight);
  const finished = () => {
    if (sending.get(scope) === flight) sending.delete(scope);
  };
  void promise.then(finished, finished);
  return promise;
}
async function sendAttempt<T>(userId: string, path: string, payload: MobileMessagePayload) {
  const actor = { userId, installId: installIdentifier() };
  const key = `bb-draft-retry-${userId}-${path}`;
  const bytes = new TextEncoder().encode(JSON.stringify(payload));
  const signature = Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", bytes)))
    .map((n) => n.toString(16).padStart(2, "0"))
    .join("");
  let prior = memory.get(key);
  try {
    prior ??= JSON.parse(sessionStorage.getItem(key) ?? "null");
  } catch {
    /* session storage is optional */
  }
  const attempt = prior?.signature === signature ? prior : { signature, id: crypto.randomUUID() };
  memory.set(key, attempt);
  try {
    sessionStorage.setItem(key, JSON.stringify(attempt));
  } catch {
    /* memory fallback */
  }
  const result = await api<T>(path, "POST", payload, undefined, actor, attempt.id);
  // A previous response cannot remove the receipt of a newer explicit send.
  if (memory.get(key)?.id === attempt.id) {
    memory.delete(key);
  }
  try {
    if (JSON.parse(sessionStorage.getItem(key) ?? "null")?.id === attempt.id)
      sessionStorage.removeItem(key);
  } catch {
    /* memory fallback */
  }
  return result;
}

export function clearMessageRetries() {
  memory.clear();
  sending.clear();
}
