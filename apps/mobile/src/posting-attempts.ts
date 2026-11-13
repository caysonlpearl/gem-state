import { api, ApiError } from "./client";
import { installIdentifier } from "./identity";
import { classifiedListingSchema } from "../../../src/lib/classified-listing-contracts";
import { mobileListingAllowed } from "../../../src/lib/mobile-contract";
import type { CreateClassifiedListingInput } from "../../../src/lib/classifieds.functions";
export type PostingAttempt = { requestId: string; payload: CreateClassifiedListingInput };
const key = (userId: string) => `bb-draft-posting-${userId}`;
export function readPostingAttempt(userId: string): PostingAttempt | null {
  try {
    const value = JSON.parse(sessionStorage.getItem(key(userId)) ?? "null");
    if (!value) return null;
    if (
      typeof value.requestId !== "string" ||
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value.requestId) ||
      !classifiedListingSchema.safeParse(value.payload).success
    )
      return null;
    if (
      !mobileListingAllowed({
        categorySlug: value.payload.category,
        title: value.payload.title,
        description: value.payload.description,
      })
    )
      return null;
    for (const name of ["publicMediaPaths", "evidencePaths"]) {
      const paths = value.payload[name];
      if (
        !Array.isArray(paths) ||
        !paths.length ||
        paths.length > 8 ||
        paths.some((p: unknown) => typeof p !== "string" || !p.startsWith(`${userId}/`))
      )
        return null;
    }
    return value;
  } catch {
    return null;
  }
}
export function storePostingAttempt(userId: string, attempt: PostingAttempt) {
  try {
    sessionStorage.setItem(key(userId), JSON.stringify(attempt));
  } catch {
    /* Current in-memory attempt still protects retries. */
  }
}
export function clearPostingAttempt(userId: string) {
  try {
    sessionStorage.removeItem(key(userId));
  } catch {
    /* Storage is optional. */
  }
}
export async function submitPostingAttempt(userId: string, attempt: PostingAttempt) {
  const actor = { userId, installId: installIdentifier() };
  return api<{ listingId: string }>(
    "listings",
    "POST",
    attempt.payload,
    undefined,
    actor,
    attempt.requestId,
  );
}
export const postingDefinitelyRejected = (error: unknown) =>
  error instanceof ApiError && [400, 401, 403, 409, 415].includes(error.status);
