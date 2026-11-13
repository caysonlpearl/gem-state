export type SearchWrite = {
  operation: "create" | "update" | "delete";
  target?: string;
  input: Record<string, unknown>;
};
export type SearchAttempt = SearchWrite & {
  id: string;
  owner: string;
  startedAt: string;
  sendCount: number;
};
// Operational recovery belongs to the authenticated account, not the resettable shopper ID.
const storageKey = (owner: string) => `bluebird:saved-search-attempt:${owner}`;
export function readSearchAttempt(owner: string): SearchAttempt | null {
  try {
    const value = JSON.parse(sessionStorage.getItem(storageKey(owner)) ?? "null");
    return value?.owner === owner &&
      typeof value.id === "string" &&
      ["create", "update", "delete"].includes(value.operation) &&
      value.input &&
      typeof value.input === "object"
      ? value
      : null;
  } catch {
    return null;
  }
}
export function beginSearchAttempt(owner: string, write: SearchWrite): SearchAttempt {
  if (readSearchAttempt(owner))
    throw Error(
      "An earlier saved-search request still needs confirmation. Retry that request first.",
    );
  const attempt = JSON.parse(
    JSON.stringify({
      ...write,
      id: crypto.randomUUID(),
      owner,
      startedAt: new Date().toISOString(),
      sendCount: 0,
    }),
  ) as SearchAttempt;
  sessionStorage.setItem(storageKey(owner), JSON.stringify(attempt));
  return attempt;
}
export function clearSearchAttempt(attempt: SearchAttempt) {
  if (readSearchAttempt(attempt.owner)?.id === attempt.id)
    sessionStorage.removeItem(storageKey(attempt.owner));
}

export function markSearchAttemptSent(attempt: SearchAttempt) {
  if (readSearchAttempt(attempt.owner)?.id !== attempt.id)
    throw Error("Your pending saved-search request changed.");
  const next = { ...attempt, sendCount: (attempt.sendCount ?? 1) + 1 };
  sessionStorage.setItem(storageKey(attempt.owner), JSON.stringify(next));
  return next;
}
