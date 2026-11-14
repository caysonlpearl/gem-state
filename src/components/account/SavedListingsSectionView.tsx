import { useEffect, useMemo, useState, type ComponentType, type ReactNode } from "react";
import { ArrowRight, BookmarkSimple, MagnifyingGlass } from "@phosphor-icons/react";
import { formatUsd } from "../../config/fees";
import type { WatchedVariant } from "../../lib/community.functions";
import {
  AccountEmptyState as EmptyState,
  AccountSectionHeader as SectionHeader,
} from "./AccountSectionView";
export type SavedListingLinkProps = {
  to: "/browse" | "/listings/$listingId";
  params?: { listingId: string };
  search?: { q: string };
  className?: string;
  children: ReactNode;
};
export function SavedListingsSectionView({
  items,
  link: Link,
  onRemove,
  onRemoveSelected,
  removingId,
  bulkRemoving,
}: {
  items: WatchedVariant[];
  link: ComponentType<SavedListingLinkProps>;
  onRemove: (id: string) => void;
  onRemoveSelected: (ids: string[]) => Promise<void>;
  removingId?: string;
  bulkRemoving: boolean;
}) {
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("all");
  const [status, setStatus] = useState("all");
  const [sort, setSort] = useState("newest");
  const [view, setView] = useState<"grid" | "list">("grid");
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const categories = [
    ...new Set(items.map((item) => item.categoryName).filter(Boolean)),
  ] as string[];
  const itemStatus = (item: WatchedVariant) => (item.activeAskCount > 0 ? "active" : "unavailable");
  const filtered = items
    .filter(
      (item) =>
        `${item.productName} ${item.variantLabel}`.toLowerCase().includes(query.toLowerCase()) &&
        (category === "all" || item.categoryName === category) &&
        (status === "all" || itemStatus(item) === status),
    )
    .sort((a, b) =>
      sort === "price-low"
        ? (a.lowestAskCents ?? Number.MAX_SAFE_INTEGER) -
          (b.lowestAskCents ?? Number.MAX_SAFE_INTEGER)
        : sort === "price-high"
          ? (b.lowestAskCents ?? 0) - (a.lowestAskCents ?? 0)
          : new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
    );
  const visibleIdKey = filtered.map((item) => item.variantId).join("|");
  // The key is derived from the visible set, so this memo remains stable while
  // other account data refreshes in the background.
  // eslint-disable-next-line react-hooks/exhaustive-deps -- visibleIdKey captures the derived filtered IDs.
  const visibleIds = useMemo(() => new Set(filtered.map((item) => item.variantId)), [visibleIdKey]);
  // A filter renders before the pruning effect. Never expose hidden selections to a bulk action.
  const visibleSelectedIds = selectedIds.filter((id) => visibleIds.has(id));
  useEffect(() => {
    setSelectedIds((current) => {
      const next = current.filter((id) => visibleIds.has(id));
      return next.length === current.length ? current : next;
    });
  }, [visibleIdKey, visibleIds]);
  const toggleSelected = (variantId: string) =>
    setSelectedIds((current) =>
      current.includes(variantId)
        ? current.filter((id) => id !== variantId)
        : [...current, variantId],
    );
  const selectAllVisible = () =>
    setSelectedIds((current) =>
      current.filter((id) => visibleIds.has(id)).length === filtered.length
        ? []
        : filtered.map((item) => item.variantId),
    );
  return (
    <div className="space-y-6">
      <SectionHeader
        eyebrow="Saved listings"
        title={`${filtered.length} saved ${filtered.length === 1 ? "listing" : "listings"}`}
        body={
          filtered.length === items.length
            ? "Keep exact items handy while you compare local options. Saving does not reserve an item."
            : `Showing ${filtered.length} of ${items.length} saved listings. Saving does not reserve an item.`
        }
        action={
          <div className="flex flex-wrap gap-2">
            <Link
              to="/browse"
              className="inline-flex h-10 items-center gap-2 rounded-xl border border-input px-3 text-[12px] font-semibold hover:bg-secondary"
            >
              Browse listings
              <ArrowRight size={14} />
            </Link>
            {visibleSelectedIds.length > 0 && (
              <button
                type="button"
                onClick={() =>
                  void onRemoveSelected([...visibleSelectedIds])
                    .then(() => setSelectedIds([]))
                    .catch(() => {})
                }
                disabled={bulkRemoving}
                className="inline-flex h-10 items-center gap-2 rounded-xl bg-destructive px-3 text-[12px] font-semibold text-destructive-foreground disabled:opacity-60"
              >
                {bulkRemoving
                  ? "Removing…"
                  : `Remove ${visibleSelectedIds.length} visible selected`}
              </button>
            )}
          </div>
        }
      />
      <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_160px_150px_170px_auto]">
        <label className="field flex items-center gap-2">
          <MagnifyingGlass size={16} className="text-muted-foreground" />
          <span className="sr-only">Search saved listings</span>
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search saved listings"
            className="min-w-0 flex-1 bg-transparent outline-none"
          />
        </label>
        <select
          aria-label="Saved listing section"
          value={category}
          onChange={(event) => setCategory(event.target.value)}
          className="field"
        >
          <option value="all">All sections</option>
          {categories.map((item) => (
            <option key={item}>{item}</option>
          ))}
        </select>
        <select
          aria-label="Saved listing status"
          value={status}
          onChange={(event) => setStatus(event.target.value)}
          className="field"
        >
          <option value="all">All statuses</option>
          <option value="active">Active</option>
          <option value="unavailable">Sold or removed</option>
        </select>
        <select
          aria-label="Sort saved listings"
          value={sort}
          onChange={(event) => setSort(event.target.value)}
          className="field"
        >
          <option value="newest">Newest saved</option>
          <option value="price-low">Price low to high</option>
          <option value="price-high">Price high to low</option>
        </select>
        <div className="flex rounded-xl border border-input p-1" aria-label="Saved listings view">
          <button
            type="button"
            onClick={() => setView("grid")}
            aria-pressed={view === "grid"}
            className={`rounded-lg px-2.5 py-1.5 text-[11px] font-semibold ${view === "grid" ? "bg-primary text-primary-foreground" : "hover:bg-secondary"}`}
          >
            Grid
          </button>
          <button
            type="button"
            onClick={() => setView("list")}
            aria-pressed={view === "list"}
            className={`rounded-lg px-2.5 py-1.5 text-[11px] font-semibold ${view === "list" ? "bg-primary text-primary-foreground" : "hover:bg-secondary"}`}
          >
            List
          </button>
        </div>
      </div>
      {filtered.length === 0 ? (
        <EmptyState
          title={items.length === 0 ? "Nothing saved yet" : "No saved listings match"}
          body="Open a listing and select its save button to keep it here."
          action={
            <Link to="/browse" className="text-[12px] font-semibold text-primary hover:underline">
              Browse classifieds
            </Link>
          }
        />
      ) : (
        <>
          <label className="inline-flex cursor-pointer items-center gap-2 text-[11.5px] font-semibold text-muted-foreground">
            <input
              type="checkbox"
              checked={visibleSelectedIds.length === filtered.length && filtered.length > 0}
              onChange={selectAllVisible}
              className="size-4 accent-[var(--color-primary)]"
            />{" "}
            Select all visible
          </label>
          <div className={view === "grid" ? "grid gap-3 sm:grid-cols-2" : "space-y-3"}>
            {filtered.map((item) => (
              <SavedListingCard
                key={item.variantId}
                item={item}
                link={Link}
                onRemove={() => onRemove(item.variantId)}
                removing={removingId === item.variantId}
                listView={view === "list"}
                selected={selectedIds.includes(item.variantId)}
                onSelect={() => toggleSelected(item.variantId)}
              />
            ))}
          </div>
        </>
      )}
    </div>
  );
}

function SavedListingCard({
  item,
  link: Link,
  onRemove,
  removing,
  listView,
  selected,
  onSelect,
}: {
  item: WatchedVariant;
  link: ComponentType<SavedListingLinkProps>;
  onRemove: () => void;
  removing: boolean;
  listView?: boolean;
  selected: boolean;
  onSelect: () => void;
}) {
  return (
    <article
      className={`rounded-2xl border border-border bg-card p-4 shadow-sm ${listView ? "sm:flex sm:items-center sm:justify-between sm:gap-5" : ""}`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-2">
          <input
            type="checkbox"
            checked={selected}
            onChange={onSelect}
            aria-label={`Select ${item.productName}`}
            className="mt-1 size-4 accent-[var(--color-primary)]"
          />
          <div>
            <p className="text-[14px] font-semibold leading-snug">{item.productName}</p>
            <p className="mt-1 text-[11.5px] text-muted-foreground">
              {item.variantLabel} · {item.categoryName ?? "Classifieds"}
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={onRemove}
          disabled={removing}
          aria-label={`Remove ${item.productName} from saved listings`}
          className="rounded-lg p-1 text-primary hover:bg-secondary disabled:opacity-50"
        >
          <BookmarkSimple size={18} weight="fill" />
        </button>
      </div>
      <div className="mt-5 flex items-end justify-between gap-3">
        <div>
          <p className="numeric text-[18px] font-bold">
            {item.lowestAskCents == null ? "No active listing" : formatUsd(item.lowestAskCents)}
          </p>
          <p className="mt-1 text-[11.5px] text-muted-foreground">
            {item.activeAskCount > 0
              ? `${item.activeAskCount} active listing${item.activeAskCount === 1 ? "" : "s"}`
              : "Sold or removed"}{" "}
            · {item.sightingCount} local sighting{item.sightingCount === 1 ? "" : "s"}
          </p>
        </div>
        {item.listingId ? (
          <Link
            to="/listings/$listingId"
            params={{ listingId: item.listingId }}
            className="text-[12px] font-semibold text-primary hover:underline"
          >
            View listing
          </Link>
        ) : (
          <Link
            to="/browse"
            search={{ q: item.productName }}
            className="text-[12px] font-semibold text-primary hover:underline"
          >
            Find listing
          </Link>
        )}
      </div>
      <p className="mt-3 text-[11px] text-muted-foreground">
        Saved {new Date(item.createdAt).toLocaleDateString()}
      </p>
    </article>
  );
}
