import { MobileApiError, mobileJson } from "./mobile-api.ts";
import { mobileWriteId } from "./mobile-write.ts";
import {
  mobileCreateSearch,
  mobileUpdateSearch,
  mobileSavedFilters,
  mobileSearchPrivacyUpdate,
  mobileSavedSearchAllowed,
} from "./mobile-saved-search-contract.ts";
export async function writeMobileSavedSearch(
  request: Request,
  client: {
    rpc: (
      name: string,
      args: Record<string, unknown>,
    ) => PromiseLike<{ data: unknown; error: { message?: string } | null }>;
  },
  ready: boolean,
  requireTerms: () => Promise<void>,
) {
  if (!ready)
    throw new MobileApiError(
      503,
      "saved_searches_unavailable",
      "Saved-search changes are temporarily unavailable. Please try again later.",
    );
  const path = new URL(request.url).pathname;
  const target = /\/saved-searches\/([0-9a-f-]{36})$/i.exec(path)?.[1];
  const operation =
    request.method === "DELETE" ? "delete" : request.method === "POST" ? "create" : "update";
  const key = mobileWriteId(request.headers.get("Idempotency-Key"));
  if (!key)
    throw new MobileApiError(
      400,
      "invalid_request",
      "This request needs its original retry identifier.",
    );
  if (operation !== "create") mobileWriteId(target);
  const body = await mobileJson(request);
  const input: Record<string, unknown> =
    operation === "delete"
      ? body
      : operation === "create"
        ? mobileCreateSearch.parse(body)
        : mobileUpdateSearch.parse(body);
  if (operation === "delete" && Object.keys(body).length)
    throw new MobileApiError(400, "invalid_request", "Check your saved-search request.");
  if (input.search !== undefined) {
    const filters = mobileSavedFilters(input.search as Record<string, unknown>);
    if (!filters)
      throw new MobileApiError(400, "invalid_filters", "Check your saved-search filters.");
    input.search = filters;
  }
  if (operation !== "delete" && !mobileSearchPrivacyUpdate(input)) await requireTerms();
  if (operation !== "delete" && !mobileSearchPrivacyUpdate(input)) {
    if (
      !mobileSavedSearchAllowed({
        name: String(input.name ?? ""),
        search: (input.search ?? {}) as Record<string, unknown>,
      })
    )
      throw new MobileApiError(
        404,
        "saved_search_unavailable",
        "This saved search is unavailable.",
      );
  }
  // The transaction validates the complete locked record. Pre-reading it here would
  // prevent a receipt replay after that search was changed or deleted elsewhere.
  const result = await client.rpc("mobile_commit_saved_search", {
    _request: key,
    _operation: operation,
    _target: target ?? null,
    _input: input,
  });
  if (result.error) {
    const message = result.error.message ?? "";
    if (message.includes("retry does not match"))
      throw new MobileApiError(409, "retry_mismatch", "Retry the original saved-search request.");
    if (message.includes("Saved search unavailable"))
      throw new MobileApiError(
        404,
        "saved_search_unavailable",
        "This saved search is unavailable.",
      );
    if (/Accept current terms|Account deletion pending/.test(message))
      throw new MobileApiError(
        409,
        "account_action_required",
        "Check your account permissions before changing this search.",
      );
    throw new MobileApiError(
      503,
      "saved_search_failed",
      "Your saved-search request could not be confirmed. Retry the same request.",
    );
  }
  return result.data;
}
