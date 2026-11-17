import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { Scales, Check, X } from "@phosphor-icons/react";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { PhotoImage } from "./PhotoImage";
import { addComparison, comparisonItem, type ComparisonItem } from "@/lib/listing-comparison";
import type { ListingCardSummary } from "@/lib/listing-card-summary";

const Context = createContext<{
  items: ComparisonItem[];
  toggle: (item: ComparisonItem) => void;
} | null>(null);
export function ComparisonProvider({
  children,
  listingHref,
  owner,
}: {
  children: ReactNode;
  listingHref: (item: ComparisonItem) => string;
  owner?: string | null;
}) {
  const [selection, setSelection] = useState<{ owner: typeof owner; items: ComparisonItem[] }>({
    owner,
    items: [],
  });
  const items = selection.owner === owner ? selection.items : [];
  const [open, setOpen] = useState(false);
  useEffect(() => {
    setSelection({ owner, items: [] });
    setOpen(false);
  }, [owner]);
  useEffect(() => {
    const clear = () => {
      setSelection({ owner, items: [] });
      setOpen(false);
    };
    window.addEventListener("shopping-account-changed", clear);
    return () => window.removeEventListener("shopping-account-changed", clear);
  }, [owner]);
  const toggle = (item: ComparisonItem) => {
    const next = addComparison(items, item);
    if (next === items) {
      toast.message(
        items.length >= 3
          ? "Compare up to 3 listings. Remove one to add another."
          : "Compare homes with homes, or vehicles with vehicles.",
      );
      return;
    }
    setSelection({ owner, items: next });
    if (!next.length) setOpen(false);
  };
  return (
    <Context.Provider value={{ items, toggle }}>
      {children}
      {items.length > 0 && (
        <aside
          aria-label="Selected for comparison"
          className="comparison-tray fixed left-1/2 z-40 flex max-w-[calc(100vw-24px)] -translate-x-1/2 items-center gap-3 rounded-full border border-border bg-card px-3 py-2 text-xs shadow-lg"
        >
          <span className="whitespace-nowrap pl-1 font-medium">{items.length} selected</span>
          <button
            type="button"
            disabled={items.length < 2}
            onClick={() => setOpen(true)}
            className="min-h-10 rounded-full bg-primary px-4 font-semibold text-primary-foreground disabled:opacity-45"
          >
            Compare
          </button>
          <button
            type="button"
            aria-label="Clear comparison"
            onClick={() => {
              setSelection({ owner, items: [] });
              setOpen(false);
            }}
            className="grid h-10 w-10 shrink-0 place-items-center rounded-full hover:bg-secondary"
          >
            <X size={17} />
          </button>
        </aside>
      )}
      <Dialog open={open && items.length > 1} onOpenChange={setOpen}>
        <DialogContent className="max-h-[85dvh] max-w-3xl overflow-auto rounded-2xl p-5">
          <DialogTitle>Compare {items[0]?.kind === "home" ? "homes" : "vehicles"}</DialogTitle>
          <DialogDescription>Details from each listing.</DialogDescription>
          <div className="overflow-x-auto">
            <table
              className="w-full table-fixed border-separate border-spacing-x-2 border-spacing-y-0 text-left"
              style={{ minWidth: items.length * 142 }}
            >
              <thead>
                <tr>
                  {items.map((item) => (
                    <th scope="col" key={item.id} className="pb-3 align-top font-normal">
                      <div className="relative aspect-[4/3] overflow-hidden rounded-xl bg-secondary">
                        {item.image && (
                          <PhotoImage
                            src={item.image}
                            alt=""
                            className="h-full w-full object-cover"
                          />
                        )}
                        <button
                          type="button"
                          onClick={() => toggle(item)}
                          aria-label={`Remove ${item.title} from comparison`}
                          className="absolute right-1 top-1 grid h-9 w-9 place-items-center rounded-full bg-card/95"
                        >
                          <X size={16} />
                        </button>
                      </div>
                      <a
                        href={listingHref(item)}
                        onClick={() => setOpen(false)}
                        className="mt-3 block text-sm font-semibold hover:underline"
                      >
                        <span className="line-clamp-2">{item.title}</span>
                      </a>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {items[0]?.rows.map(([label], index) => (
                  <tr key={label}>
                    {items.map((item) => (
                      <td key={item.id} className="border-t border-border/70 py-2.5 align-top">
                        <span className="block text-[11px] text-muted-foreground">{label}</span>
                        <span
                          title={item.rows[index]?.[1]}
                          className="mt-1 block break-words text-xs font-semibold"
                        >
                          {item.rows[index]?.[1] ?? "—"}
                        </span>
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </DialogContent>
      </Dialog>
    </Context.Provider>
  );
}
export function CompareToggle({
  listing,
  compact = false,
  className = "",
}: {
  listing: ListingCardSummary;
  compact?: boolean;
  className?: string;
}) {
  const context = useContext(Context),
    item = comparisonItem(listing);
  if (!context || !item) return null;
  const selected = context.items.some((row) => row.id === item.id);
  return (
    <button
      type="button"
      aria-label={`${selected ? "Remove" : "Add"} ${listing.title} ${selected ? "from" : "to"} comparison`}
      title={selected ? "Remove from comparison" : "Compare listing"}
      aria-pressed={selected}
      onClick={(event) => {
        event.preventDefault();
        event.stopPropagation();
        context.toggle(item);
      }}
      className={`inline-flex min-h-11 items-center justify-center gap-1.5 rounded-full text-xs font-medium ${compact ? "relative h-7 w-7 min-h-7 border border-border bg-card/95 shadow-sm before:absolute before:-inset-2 before:content-['']" : "px-3 hover:bg-secondary"} ${selected ? "text-primary" : "text-muted-foreground"} ${className}`}
    >
      {selected ? <Check size={16} /> : <Scales size={16} />}
      {!compact && (selected ? "Selected" : "Compare")}
    </button>
  );
}
