import { useState } from "react";
import { CaretDown, MapPin, SquaresFour } from "@phosphor-icons/react";
import { CategoryArtwork } from "../../../src/components/classifieds/CategoryIcon";
import { HomeSearchDropdown } from "../../../src/components/classifieds/HomeSearchDropdown";
import { Popover, PopoverContent, PopoverTrigger } from "../../../src/components/ui/popover";
import { mobilePrimaryCategories } from "../../../src/config/mobile-navigation";
import { mobileCategoryAllowed } from "../../../src/lib/mobile-contract";
import { suggestLocations } from "../../../src/lib/location-suggest";
import type { Search } from "../../../src/lib/browse-search";

/** Compact shortcuts replace the app's large hero/category cards. */
export function NativeHomeShortcuts({ onBrowse }: { onBrowse: (scope: Partial<Search>) => void }) {
  const ordered = ["cars-trucks", "other-real-estate", "pets", "jobs", "services"];
  return (
    <nav
      aria-label="Shop by category"
      className="no-scrollbar flex gap-2 overflow-x-auto px-[calc(12px+env(safe-area-inset-left))] pb-3 pr-[calc(12px+env(safe-area-inset-right))] pt-1"
    >
      <button
        type="button"
        onClick={() => onBrowse({})}
        className="inline-flex min-h-11 shrink-0 items-center gap-1.5 rounded-full border border-primary/20 bg-primary/8 px-3.5 text-[12px] font-semibold text-primary"
      >
        <SquaresFour size={18} aria-hidden="true" />
        All
      </button>
      {ordered
        .map((slug) => mobilePrimaryCategories.find((category) => category.slug === slug))
        .filter((category) => category && mobileCategoryAllowed(category.slug))
        .map(
          (category) =>
            category && (
              <button
                key={category.slug}
                type="button"
                onClick={() =>
                  onBrowse(
                    "group" in category ? { group: category.group } : { category: category.slug },
                  )
                }
                className="inline-flex min-h-11 shrink-0 items-center gap-1.5 rounded-full border border-border/70 bg-card px-3.5 text-[12px] font-medium"
              >
                <CategoryArtwork slug={category.slug} size={22} />
                {category.slug === "pets" ? "Pets & adoption" : category.name}
              </button>
            ),
        )}
    </nav>
  );
}

export function NativeHomeLocation({
  area,
  onApply,
}: {
  area: string;
  onApply: (value: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(area);
  return (
    <Popover
      open={open}
      onOpenChange={(value) => {
        if (value) setDraft(area);
        setOpen(value);
      }}
    >
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label="Change search area"
          aria-describedby="native-home-search-area"
          className="inline-flex min-h-11 min-w-11 max-w-[140px] items-center gap-1.5 rounded-full px-2 text-left hover:bg-secondary/60"
        >
          <MapPin size={16} className="shrink-0 text-primary" aria-hidden="true" />
          <span className="min-w-0">
            <span className="block text-[10px] leading-4 text-muted-foreground">Search area</span>
            <span
              id="native-home-search-area"
              className="block truncate text-[12px] font-medium leading-4"
            >
              {area || "All locations"}
            </span>
          </span>
          <CaretDown size={12} className="shrink-0" aria-hidden="true" />
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="end"
        collisionPadding={12}
        aria-label="Search area"
        className="w-[min(320px,calc(100vw-24px))] rounded-2xl p-4"
      >
        <form
          onSubmit={(event) => {
            event.preventDefault();
            setOpen(false);
            onApply(draft.trim());
          }}
        >
          <h2 className="mb-3 text-[16px] font-semibold">Search area</h2>
          <HomeSearchDropdown
            value={draft}
            onChange={setDraft}
            options={suggestLocations(draft)}
            label="City or ZIP code"
            placeholder="City, state or ZIP code"
            shortPlaceholder="City or ZIP code"
            editable
          />
          <button
            type="submit"
            className="mt-3 min-h-11 w-full rounded-full bg-primary px-4 text-[13px] font-semibold text-primary-foreground"
          >
            Apply search area
          </button>
        </form>
      </PopoverContent>
    </Popover>
  );
}
