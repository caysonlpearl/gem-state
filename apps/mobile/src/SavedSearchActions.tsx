import { savedSearchBrowseInput } from "../../../src/lib/saved-search-contract";
import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { api, ApiError } from "./client";
import { installIdentifier } from "./identity";
import {
  beginSearchAttempt,
  markSearchAttemptSent,
  readSearchAttempt,
  clearSearchAttempt,
  type SearchWrite,
  type SearchAttempt,
} from "./saved-search-attempts";

type Writer = {
  owner?: string;
  ready: boolean;
  pending: SearchAttempt | null;
  busy: boolean;
  run: (write: SearchWrite) => Promise<{ id: string }>;
  retry: () => Promise<void>;
  revision: number;
};
const Context = createContext<Writer | null>(null);
export const useSavedSearchActions = () => {
  const value = useContext(Context);
  if (!value) throw Error("Missing saved-search controls");
  return value;
};
export function SavedSearchActions({
  owner,
  ready,
  children,
}: {
  owner?: string;
  ready: boolean;
  children: ReactNode;
}) {
  const [pending, setPending] = useState<SearchAttempt | null>(() =>
      owner ? readSearchAttempt(owner) : null,
    ),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [revision, setRevision] = useState(0);
  const current = useRef({ owner, install: installIdentifier() });
  current.current = { owner, install: installIdentifier() };
  const lock = useRef(new Set<string>());
  const ownPending = pending && pending.owner === owner ? pending : null;
  useEffect(() => {
    setPending(owner ? readSearchAttempt(owner) : null);
    setError("");
    setBusy(false);
  }, [owner]);
  async function send(attempt: SearchAttempt) {
    const install = installIdentifier();
    const actorKey = attempt.owner + ":" + install;
    const stillCurrent = () =>
      current.current.owner === attempt.owner && current.current.install === install;
    if (lock.current.has(actorKey)) throw Error("A saved-search request is already running.");
    if (!ready)
      throw Error("Saved-search changes are temporarily unavailable. Please try again later.");
    attempt = markSearchAttemptSent(attempt);
    setPending(attempt);
    lock.current.add(actorKey);
    setBusy(true);
    setError("");
    try {
      const data = await api<{ id: string; ok: boolean }>(
        `saved-searches${attempt.target ? `/${attempt.target}` : ""}`,
        attempt.operation === "create" ? "POST" : attempt.operation === "delete" ? "DELETE" : "PUT",
        attempt.input,
        undefined,
        { userId: attempt.owner, installId: install },
        attempt.id,
      );
      if (!stillCurrent())
        throw Error(
          "Your account changed. Please sign in to the original account to confirm this request.",
        );
      clearSearchAttempt(attempt);
      setPending(null);
      setRevision((value) => value + 1);
      return { id: data.id };
    } catch (e) {
      if (
        attempt.sendCount === 1 &&
        e instanceof ApiError &&
        ["invalid_request", "invalid_filters", "saved_search_unavailable"].includes(e.code)
      ) {
        clearSearchAttempt(attempt);
        if (stillCurrent()) setPending(null);
      }

      if (stillCurrent())
        setError(e instanceof Error ? e.message : "The request could not be confirmed.");
      throw e;
    } finally {
      lock.current.delete(actorKey);
      if (stillCurrent()) setBusy(false);
    }
  }
  async function run(write: SearchWrite) {
    if (!owner) throw Error("Sign in to save this search.");
    if (lock.current.has(owner + ":" + installIdentifier()))
      throw Error("A saved-search request is already running.");
    if (!ready)
      throw Error("Saved-search changes are temporarily unavailable. Please try again later.");
    const attempt = beginSearchAttempt(owner, write);
    setPending(attempt);
    return send(attempt);
  }
  async function retry() {
    const attempt = owner ? readSearchAttempt(owner) : null;
    if (!attempt) return;
    const result = await send(attempt);
    if (
      attempt.operation !== "delete" &&
      attempt.input.search &&
      window.location.hash.startsWith("#/search")
    ) {
      const params = new URLSearchParams(window.location.hash.split("?")[1] ?? "");
      const comparable = (value: Record<string, unknown>) =>
        JSON.stringify(
          Object.entries(savedSearchBrowseInput(value).input)
            .filter(
              ([key, value]) => !["mobileCatalog", "page"].includes(key) && value !== undefined,
            )
            .sort(([a], [b]) => a.localeCompare(b)),
        );
      if (
        comparable(Object.fromEntries(params)) ===
        comparable(attempt.input.search as Record<string, unknown>)
      ) {
        params.set("savedSearchId", result.id);
        history.replaceState(null, "", "#/search?" + params);
        window.dispatchEvent(new HashChangeEvent("hashchange"));
      }
    }
  }
  return (
    <Context.Provider
      value={{
        owner,
        ready,
        pending: ownPending,
        busy: ownPending ? busy : false,
        run,
        retry,
        revision,
      }}
    >
      {ownPending && (
        <div
          className="mx-auto my-4 max-w-[1368px] rounded-2xl border border-primary/25 bg-card p-4 text-sm"
          role="status"
        >
          <p className="font-semibold">
            {busy
              ? "Confirming your saved-search request…"
              : "Your earlier saved-search request needs confirmation."}
          </p>
          <p className="mt-1 text-muted-foreground">
            Retry uses the original request so it cannot create a duplicate or overwrite a later
            change.
          </p>
          {error && (
            <p className="mt-2" role="alert">
              {error}
            </p>
          )}
          <button
            className="mt-3 rounded-full border border-input px-4 py-2 font-semibold"
            type="button"
            disabled={busy || !ready}
            onClick={() => void retry().catch(() => {})}
          >
            {busy ? "Confirming…" : "Retry original request"}
          </button>
          {!ready && (
            <p className="mt-2 text-muted-foreground">
              Saved-search changes are temporarily unavailable. Browsing is still available.
            </p>
          )}
        </div>
      )}
      {children}
    </Context.Provider>
  );
}
