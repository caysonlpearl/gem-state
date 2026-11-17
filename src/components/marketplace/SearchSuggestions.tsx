import { listingPreviewTitle } from "@/lib/listing-preview";
import { useEffect, useId, useRef, useState, type InputHTMLAttributes } from "react";
import { createPortal } from "react-dom";
import { ClockCounterClockwise, MagnifyingGlass, SquaresFour } from "@phosphor-icons/react";
import { PhotoImage } from "./PhotoImage";
import type { ListingCardSummary } from "@/lib/listing-card-summary";

type Category = { slug: string; name: string };
/** Cached previews only. Recent queries stay in this mounted control, with consent. */
export function SearchSuggestions({
  value,
  onValueChange,
  onSearch,
  onCategory,
  onListing,
  listings = [],
  categories = [],
  allowRecent = () => false,
  owner,
  className = "",
  ...input
}: Omit<InputHTMLAttributes<HTMLInputElement>, "value" | "onChange" | "onSelect"> & {
  value: string;
  onValueChange: (value: string) => void;
  onSearch: (value: string) => void;
  onCategory: (slug: string) => void;
  onListing: (listing: ListingCardSummary) => void;
  listings?: ListingCardSummary[];
  categories?: readonly Category[];
  allowRecent?: () => boolean;
  owner?: string | null;
}) {
  const id = useId(),
    ref = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false),
    [active, setActive] = useState(-1);
  const [recent, setRecent] = useState<string[]>([]);
  const [position, setPosition] = useState({ left: 12, top: 0, width: 300, maxHeight: 300 });
  useEffect(() => {
    setRecent([]);
    setOpen(false);
  }, [owner]);
  useEffect(() => {
    const clear = () => {
      setRecent([]);
      setOpen(false);
    };
    window.addEventListener("shopping-account-changed", clear);
    window.addEventListener("shopping-privacy-changed", clear);
    return () => {
      window.removeEventListener("shopping-account-changed", clear);
      window.removeEventListener("shopping-privacy-changed", clear);
    };
  }, []);
  useEffect(() => {
    if (!open) return;
    const positionMenu = () => {
      const rect = ref.current?.getBoundingClientRect();
      if (!rect) return;
      const width = Math.min(window.innerWidth - 24, Math.max(280, rect.width));
      setPosition({
        left: Math.max(12, Math.min(rect.left, window.innerWidth - width - 12)),
        top: rect.bottom + 6,
        width,
        maxHeight: Math.max(
          100,
          Math.min(340, (window.visualViewport?.height ?? window.innerHeight) - rect.bottom - 18),
        ),
      });
    };
    positionMenu();
    window.addEventListener("resize", positionMenu);
    window.addEventListener("scroll", positionMenu, true);
    window.visualViewport?.addEventListener("resize", positionMenu);
    return () => {
      window.removeEventListener("resize", positionMenu);
      window.removeEventListener("scroll", positionMenu, true);
      window.visualViewport?.removeEventListener("resize", positionMenu);
    };
  }, [open]);
  const query = value.trim().toLowerCase();
  const options: {
    key: string;
    label: string;
    detail?: string;
    image?: string | null;
    icon: typeof MagnifyingGlass;
    choose: () => void;
  }[] = [];
  const search = (term: string) => {
    if (term.trim() && allowRecent())
      setRecent((old) => [term.trim(), ...old.filter((row) => row !== term.trim())].slice(0, 5));
    onValueChange(term);
    setOpen(false);
    ref.current?.blur();
    onSearch(term);
  };
  if (query) {
    options.push({
      key: "search",
      label: `Search for “${value.trim()}”`,
      icon: MagnifyingGlass,
      choose: () => search(value),
    });
    categories
      .filter((row) => row.name.toLowerCase().includes(query))
      .slice(0, 3)
      .forEach((row) =>
        options.push({
          key: `category:${row.slug}`,
          label: row.name,
          detail: "Category",
          icon: SquaresFour,
          choose: () => onCategory(row.slug),
        }),
      );
    const seen = new Set<string>();
    listings
      .filter((row) => {
        if (seen.has(row.id) || !row.title.toLowerCase().includes(query)) return false;
        seen.add(row.id);
        return true;
      })
      .slice(0, 4)
      .forEach((row) =>
        options.push({
          key: row.id,
          label: listingPreviewTitle(row),
          detail: [row.city, row.state].filter(Boolean).join(", "),
          image: row.imageUrl,
          icon: MagnifyingGlass,
          choose: () => onListing(row),
        }),
      );
  } else if (allowRecent())
    recent.forEach((term) =>
      options.push({
        key: term,
        label: term,
        detail: "Recent search",
        icon: ClockCounterClockwise,
        choose: () => search(term),
      }),
    );
  const select = (index: number) => {
    options[index]?.choose();
    setOpen(false);
  };
  return (
    <div className="min-w-0 flex-1">
      <input
        {...input}
        ref={ref}
        type="search"
        role="combobox"
        aria-label={input["aria-label"] ?? "Search listings"}
        aria-autocomplete="list"
        aria-expanded={open && options.length > 0}
        aria-controls={id}
        aria-activedescendant={
          open && active >= 0 && options[active] ? `${id}-${active}` : undefined
        }
        value={value}
        className={className}
        onFocus={() => {
          if (!allowRecent()) setRecent([]);
          setOpen(true);
        }}
        onBlur={() => setOpen(false)}
        onChange={(event) => {
          onValueChange(event.target.value);
          setOpen(true);
          setActive(-1);
        }}
        onKeyDown={(event) => {
          if (event.key === "Escape") {
            event.preventDefault();
            setOpen(false);
            return;
          }
          if (event.key === "ArrowDown" || event.key === "ArrowUp") {
            event.preventDefault();
            setOpen(true);
            setActive((index) =>
              Math.max(
                0,
                Math.min(options.length - 1, index + (event.key === "ArrowDown" ? 1 : -1)),
              ),
            );
          }
          if (event.key === "Enter") {
            event.preventDefault();
            if (open && active >= 0 && options[active]) select(active);
            else search(value);
          }
        }}
      />
      {open &&
        options.length > 0 &&
        createPortal(
          <div
            id={id}
            role="listbox"
            aria-label="Search suggestions"
            className="fixed z-[90] overflow-y-auto rounded-2xl border border-border bg-card p-1.5 text-foreground shadow-lg"
            style={position}
          >
            {options.map((option, index) => (
              <button
                key={option.key}
                id={`${id}-${index}`}
                role="option"
                aria-selected={active === index}
                type="button"
                tabIndex={-1}
                onPointerDown={(event) => event.preventDefault()}
                onClick={() => select(index)}
                onPointerMove={() => setActive(index)}
                className={`flex min-h-12 w-full items-center gap-3 rounded-xl px-2.5 py-2 text-left ${active === index ? "bg-secondary" : "hover:bg-secondary/60"}`}
              >
                <span className="grid h-10 w-10 shrink-0 place-items-center overflow-hidden rounded-lg bg-secondary">
                  {option.image ? (
                    <PhotoImage src={option.image} alt="" className="h-full w-full object-cover" />
                  ) : (
                    <option.icon size={18} />
                  )}
                </span>
                <span className="min-w-0">
                  <span className="line-clamp-1 block text-xs font-semibold">{option.label}</span>
                  {option.detail && (
                    <span className="mt-0.5 block text-[11px] text-muted-foreground">
                      {option.detail}
                    </span>
                  )}
                </span>
              </button>
            ))}
          </div>,
          document.body,
        )}
    </div>
  );
}
