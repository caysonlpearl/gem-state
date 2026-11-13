import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { api } from "./client";
import { installIdentifier } from "./identity";
import { useSavedSearchActions } from "./SavedSearchActions";
import { savedSearchDestination } from "./browse-state";
import { SavedSearchesSectionView } from "../../../src/components/account/SavedSearchesSectionView";
import { SavedSearchNameDialog } from "../../../src/components/classifieds/SavedSearchNameDialog";
import type { SavedSearch } from "../../../src/lib/saved-search-model";

export type SaveSearchRequest = { search: Record<string, unknown>; id?: string };
export function NativeSaveSearchDialog({
  request,
  onClose,
  onSaved,
}: {
  request: SaveSearchRequest | null;
  onClose: () => void;
  onSaved: (id: string) => void;
}) {
  const writer = useSavedSearchActions();
  const [name, setName] = useState("");
  const submitted = useRef<SaveSearchRequest | null>(null);
  useEffect(() => {
    if (request)
      setName(
        typeof request.search.q === "string" && request.search.q
          ? request.search.q.slice(0, 80)
          : "My saved search",
      );
  }, [request]);
  useEffect(() => {
    if (writer.pending && !writer.busy) onClose();
  }, [writer.pending, writer.busy, onClose]);
  async function submit() {
    if (!request || !writer.owner) return;
    try {
      const result = await writer.run(
        request.id
          ? { operation: "update", target: request.id, input: { search: request.search } }
          : {
              operation: "create",
              input: { name: name.trim(), search: request.search, emailAlerts: false },
            },
      );
      onClose();
      onSaved(result.id);
      toast.success("Saved-search request completed.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not save this search.");
    }
  }
  useEffect(() => {
    if (request?.id && submitted.current !== request) {
      submitted.current = request;
      void submit();
    }
  }, [request]);
  return (
    <SavedSearchNameDialog
      open={Boolean(request && !request.id)}
      name={name}
      mode="create"
      pending={writer.busy}
      onNameChange={setName}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
      onSubmit={() => void submit()}
    />
  );
}
function NativeBrowseLink({
  className,
  children,
}: {
  className: string;
  children: React.ReactNode;
}) {
  return (
    <a href="#/search" className={className}>
      {children}
    </a>
  );
}
export function NativeSavedSearches({
  ownerId,
  onNavigate,
}: {
  ownerId: string;
  onNavigate: (path: string) => void;
}) {
  const writer = useSavedSearchActions();
  const [searches, setSearches] = useState<SavedSearch[] | null>(null),
    [error, setError] = useState(""),
    [retry, setRetry] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    setError("");
    void api<{ items: SavedSearch[] }>("saved-searches", "GET", undefined, controller.signal, {
      userId: ownerId,
      installId: installIdentifier(),
    })
      .then((result) => {
        if (!controller.signal.aborted) setSearches(result.items);
      })
      .catch((error) => {
        if (!controller.signal.aborted)
          setError(
            error instanceof Error ? error.message : "Your saved searches could not be loaded.",
          );
      });
    return () => controller.abort();
  }, [ownerId, writer.revision, retry]);
  return (
    <>
      {error && (
        <div
          className="mb-4 rounded-xl border border-destructive/30 bg-card p-4 text-sm"
          role="alert"
        >
          {error}
          <button className="ml-3 underline" onClick={() => setRetry((v) => v + 1)}>
            Retry
          </button>
        </div>
      )}
      {!writer.ready && (
        <p role="status" className="mb-4 text-sm text-muted-foreground">
          Saved-search changes are temporarily unavailable. You can still reopen existing searches.
        </p>
      )}
      {searches === null ? (
        !error && <p role="status">Loading saved searches…</p>
      ) : (
        <div>
          <SavedSearchesSectionView
            key={writer.revision}
            searches={searches}
            writesDisabled={!writer.ready || Boolean(writer.pending)}
            recoveryPending={Boolean(writer.pending && !writer.busy)}
            onCreate={(input) =>
              writer.run({ operation: "create", input: { ...input, emailAlerts: false } })
            }
            onUpdate={({ id, ...input }) => writer.run({ operation: "update", target: id, input })}
            onDelete={(id) => writer.run({ operation: "delete", target: id, input: {} })}
            onChanged={() => setRetry((v) => v + 1)}
            onOpenSearch={(item) => {
              try {
                onNavigate(savedSearchDestination(item.search, item.id));
              } catch (error) {
                toast.error(
                  error instanceof Error ? error.message : "This search could not be opened.",
                );
              }
            }}
            renderBrowseLink={NativeBrowseLink}
          />
        </div>
      )}
    </>
  );
}
