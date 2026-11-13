import { useState, useRef, useEffect, type ComponentType, type ReactNode } from "react";
import { toast } from "sonner";
import { Plus, MagnifyingGlass } from "@phosphor-icons/react";
import {
  AccountSectionHeader as SectionHeader,
  AccountEmptyState as EmptyState,
} from "./AccountSectionView";
import { SavedSearchNameDialog } from "@/components/classifieds/SavedSearchNameDialog";
import { formatSavedSearchScope, formatSavedSearchFilter } from "@/lib/classifieds-display";
import type { SavedSearch } from "@/lib/saved-search-model";
export type SavedSearchUpdate = {
  id: string;
  name?: string;
  search?: Record<string, unknown>;
  paused?: boolean;
  emailAlerts?: boolean;
};
export function SavedSearchesSectionView({
  searches,
  onCreate,
  onUpdate,
  onDelete,
  onChanged,
  onOpenSearch,
  renderBrowseLink: BrowseLink,
  recoveryPending = false,
  writesDisabled = false,
}: {
  searches: SavedSearch[];
  onCreate: (input: { name: string; search: Record<string, unknown> }) => Promise<unknown>;
  onUpdate: (input: SavedSearchUpdate) => Promise<unknown>;
  onDelete: (id: string) => Promise<unknown>;
  onChanged: () => void | Promise<unknown>;
  onOpenSearch: (item: SavedSearch) => void;
  renderBrowseLink: ComponentType<{ className: string; children: ReactNode }>;
  recoveryPending?: boolean;
  writesDisabled?: boolean;
}) {
  const [name, setName] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [filter, setFilter] = useState("");
  const [sort, setSort] = useState<"newest" | "oldest">("newest");
  const [renameSearchId, setRenameSearchId] = useState<string | null>(null);
  const [renameSearchName, setRenameSearchName] = useState("");
  const createMutation = useSearchMutation({
    mutationFn: () => onCreate({ name, search: { q: searchQuery || undefined } }),
    onSuccess: async () => {
      setName("");
      setSearchQuery("");
      await onChanged();
      toast.success("Saved search created.");
    },
    onError: (error) =>
      toast.error(error instanceof Error ? error.message : "Could not create saved search."),
  });
  const updateMutation = useSearchMutation({
    mutationFn: (input: {
      id: string;
      name?: string;
      search?: Record<string, unknown>;
      paused?: boolean;
      emailAlerts?: boolean;
    }) => onUpdate(input),
    onSuccess: () => onChanged(),
    onError: (error) =>
      toast.error(error instanceof Error ? error.message : "Could not update saved search."),
  });
  const deleteMutation = useSearchMutation({
    mutationFn: (id: string) => onDelete(id),
    onSuccess: () => onChanged(),
    onError: (error) =>
      toast.error(error instanceof Error ? error.message : "Could not delete saved search."),
  });
  const openSearch = onOpenSearch;
  useEffect(() => {
    if (recoveryPending) setRenameSearchId(null);
  }, [recoveryPending]);
  const visible = searches
    .filter((item) => item.name.toLowerCase().includes(filter.toLowerCase()))
    .sort((a, b) =>
      sort === "oldest"
        ? new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
        : new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
    );
  function editSearch(item: SavedSearch) {
    setRenameSearchId(item.id);
    setRenameSearchName(item.name);
  }
  async function renameSearch() {
    if (!renameSearchId || !renameSearchName.trim()) return;
    try {
      await updateMutation.mutateAsync({
        id: renameSearchId,
        name: renameSearchName.trim(),
      });
      setRenameSearchId(null);
      setRenameSearchName("");
    } catch {
      // The mutation displays its own error toast.
    }
  }
  return (
    <div className="space-y-6">
      <SectionHeader
        eyebrow="Saved searches"
        title={`${searches.length} saved ${searches.length === 1 ? "search" : "searches"}`}
        body="Save the filters you use often and get an in-app or email alert when new matches arrive."
        action={
          <BrowseLink className="inline-flex h-10 items-center gap-2 rounded-xl bg-accent px-4 text-[12.5px] font-semibold text-accent-foreground hover:opacity-90">
            <Plus size={16} weight="bold" /> New search
          </BrowseLink>
        }
      />
      <form
        className="rounded-2xl border border-border bg-card p-4 shadow-sm"
        onSubmit={(event) => {
          event.preventDefault();
          createMutation.mutate();
        }}
      >
        <div className="grid gap-3 sm:grid-cols-[180px_minmax(0,1fr)_auto]">
          <input
            disabled={writesDisabled}
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="Saved search name"
            className="field"
            required
          />
          <input
            disabled={writesDisabled}
            value={searchQuery}
            onChange={(event) => setSearchQuery(event.target.value)}
            placeholder="What should we watch for?"
            className="field"
          />
          <button
            type="submit"
            disabled={createMutation.isPending || writesDisabled}
            className="h-10 rounded-xl bg-primary px-4 text-[12px] font-semibold text-primary-foreground disabled:opacity-60"
          >
            {createMutation.isPending ? "Saving…" : "Save search"}
          </button>
        </div>
        <p className="mt-2 text-[11px] text-muted-foreground">
          For the complete workflow, open Browse, set every filter you want, then choose “Save this
          search.” The entire filter set—including vehicle, home, job, service, price, location, and
          category values—will be preserved.
        </p>
      </form>
      <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_180px]">
        <label className="field flex items-center gap-2">
          <MagnifyingGlass size={16} className="text-muted-foreground" />
          <span className="sr-only">Search saved search names</span>
          <input
            value={filter}
            onChange={(event) => setFilter(event.target.value)}
            placeholder="Search saved search names"
            className="min-w-0 flex-1 bg-transparent outline-none"
          />
        </label>
        <select
          value={sort}
          onChange={(event) => setSort(event.target.value as "newest" | "oldest")}
          className="field"
        >
          <option value="newest">Newest to oldest</option>
          <option value="oldest">Oldest to newest</option>
        </select>
      </div>
      {visible.length === 0 ? (
        <EmptyState
          title={searches.length === 0 ? "No saved searches yet" : "No saved search matches"}
          body="Save a search to get back to the filters that matter to you."
        />
      ) : (
        <div className="space-y-3">
          {visible.map((item) => {
            const filterEntries = Object.entries(item.search).filter(
              ([key, value]) =>
                ![
                  "q",
                  "sort",
                  "view",
                  "page",
                  "savedSearchId",
                  "itemDetailKey",
                  "mobileCatalog",
                ].includes(key) &&
                value !== undefined &&
                value !== "",
            );
            return (
              <article
                key={item.id}
                className="rounded-2xl border border-border bg-card p-4 shadow-sm"
              >
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <h3 className="break-words text-[14px] font-semibold">{item.name}</h3>
                      {item.paused && (
                        <span className="rounded-full bg-secondary px-2 py-0.5 text-[10px] font-medium">
                          Paused
                        </span>
                      )}
                    </div>
                    <p className="mt-1 text-[11.5px] text-muted-foreground">
                      {typeof item.search["q"] === "string" && item.search["q"]
                        ? `“${item.search["q"]}” · `
                        : `${formatSavedSearchScope(item.search as Record<string, unknown>)} · `}
                      {filterEntries.length ? `${filterEntries.length} filters · ` : ""}
                      {item.emailAlerts ? "Email alerts on" : "In-app only"}
                    </p>
                    {item.search.mobileCatalog === true && (
                      <p className="mt-2 text-[11px] text-muted-foreground">
                        Matches include categories available in the Bluebird app.
                      </p>
                    )}
                    <div className="mt-3 flex flex-wrap gap-1.5">
                      {filterEntries.slice(0, 8).map(([key, value]) => (
                        <span
                          key={key}
                          className="rounded-full bg-secondary px-2 py-1 text-[10px] text-muted-foreground"
                        >
                          {formatSavedSearchFilter(key, value)}
                        </span>
                      ))}
                      {filterEntries.length > 8 && (
                        <span className="rounded-full bg-secondary px-2 py-1 text-[10px] text-muted-foreground">
                          +{filterEntries.length - 8} more
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="flex shrink-0 flex-wrap items-center gap-2">
                    <button
                      type="button"
                      onClick={() => openSearch(item)}
                      aria-label={`Edit all filters for ${item.name}`}
                      className="h-8 rounded-lg border border-primary px-2.5 text-[11.5px] font-semibold text-primary hover:bg-secondary"
                    >
                      Edit filters
                    </button>
                    <button
                      type="button"
                      disabled={writesDisabled}
                      onClick={() => editSearch(item)}
                      className="h-8 rounded-lg border border-input px-2.5 text-[11.5px] font-semibold hover:bg-secondary"
                    >
                      Rename
                    </button>
                    <button
                      type="button"
                      disabled={writesDisabled}
                      onClick={() => updateMutation.mutate({ id: item.id, paused: !item.paused })}
                      className="h-8 rounded-lg border border-input px-2.5 text-[11.5px] font-semibold hover:bg-secondary"
                    >
                      {item.paused ? "Resume" : "Pause"}
                    </button>
                    <button
                      type="button"
                      disabled={writesDisabled}
                      onClick={() =>
                        updateMutation.mutate({ id: item.id, emailAlerts: !item.emailAlerts })
                      }
                      className="h-8 rounded-lg border border-input px-2.5 text-[11.5px] font-semibold hover:bg-secondary"
                    >
                      {item.emailAlerts ? "Email on" : "Email off"}
                    </button>
                    <button
                      type="button"
                      disabled={writesDisabled}
                      onClick={() => deleteMutation.mutate(item.id)}
                      className="h-8 rounded-lg border border-destructive/30 px-2.5 text-[11.5px] font-semibold text-destructive hover:bg-destructive/5"
                    >
                      Delete
                    </button>
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      )}
      <SavedSearchNameDialog
        open={renameSearchId !== null}
        name={renameSearchName}
        mode="rename"
        pending={updateMutation.isPending || writesDisabled}
        onOpenChange={(open) => {
          if (!open) {
            setRenameSearchId(null);
            setRenameSearchName("");
          }
        }}
        onNameChange={setRenameSearchName}
        onSubmit={() => void renameSearch()}
      />
    </div>
  );
}

function useSearchMutation<T = void>({
  mutationFn,
  onSuccess,
  onError,
}: {
  mutationFn: (input: T) => Promise<unknown>;
  onSuccess: () => void | Promise<unknown>;
  onError: (error: unknown) => void;
}) {
  const [isPending, setPending] = useState(false);
  const lock = useRef(false);
  async function mutateAsync(input: T) {
    if (lock.current) throw Error("A saved-search request is already running.");
    lock.current = true;
    setPending(true);
    try {
      const result = await mutationFn(input);
      await onSuccess();
      return result;
    } catch (error) {
      onError(error);
      throw error;
    } finally {
      lock.current = false;
      setPending(false);
    }
  }
  return {
    isPending,
    mutateAsync,
    mutate: (input: T) => {
      void mutateAsync(input).catch(() => {});
    },
  };
}
