import type { ConversationSummary } from "./conversation.functions";
import { withCatalogReadDeadline } from "./catalog-read-deadline.ts";
import { MobileApiError } from "./mobile-api.ts";
import { mobileCategoryAllowed, MOBILE_CATALOG_VERSION } from "./mobile-contract.ts";

type Response = { data: unknown; error: { code?: string } | null };
type Read = PromiseLike<Response> & {
  abortSignal(signal: AbortSignal): Read;
  retry(enabled: boolean): Read;
};
type Database = { rpc(name: string, args: Record<string, unknown>): Read };
const uuid = /^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i;
const unavailable = () =>
  new MobileApiError(
    503,
    "conversation_unavailable",
    "Conversation history could not be checked. Please retry.",
  );

/** Call only after participant authorization. The private database proof keeps
 * eligible history usable after the member's listing and identity disappear. */
export async function mobileRetiredConversationContexts(
  db: Database,
  userId: string,
  rows: ConversationSummary[],
) {
  const ids = [
    ...new Set(
      rows
        .filter(
          (row) =>
            !row.listingId &&
            row.otherMemberId === null &&
            row.closedAt &&
            [row.buyerId, row.sellerId].includes(userId),
        )
        .map((row) => row.id),
    ),
  ];
  if (!ids.length) return new Set<string>();
  if (ids.length > 100 || !uuid.test(userId) || !ids.every((id) => uuid.test(id)))
    throw unavailable();
  let result: Response;
  try {
    result = await withCatalogReadDeadline(
      db.rpc("mobile_retired_conversation_contexts", { _actor: userId, _ids: ids }),
      5000,
    );
  } catch {
    throw unavailable();
  }
  // Old databases have no retirement ledger; their existing app boundary stays
  // closed. Other failures must not masquerade as a successful empty read.
  if (result.error?.code === "PGRST202" || result.error?.code === "42883") return new Set<string>();
  if (result.error || !Array.isArray(result.data) || result.data.length > ids.length)
    throw unavailable();
  const allowed = new Set<string>();
  const seen = new Set<string>();
  for (const value of result.data) {
    if (!value || typeof value !== "object" || Array.isArray(value)) throw unavailable();
    const row = value as Record<string, unknown>;
    if (
      Object.keys(row).length !== 3 ||
      typeof row.conversation_id !== "string" ||
      !ids.includes(row.conversation_id) ||
      seen.has(row.conversation_id) ||
      typeof row.category_slug !== "string" ||
      !Number.isSafeInteger(row.catalog_version) ||
      (row.catalog_version as number) < 1
    )
      throw unavailable();
    seen.add(row.conversation_id);
    if (row.catalog_version === MOBILE_CATALOG_VERSION && mobileCategoryAllowed(row.category_slug))
      allowed.add(row.conversation_id);
  }
  return allowed;
}
