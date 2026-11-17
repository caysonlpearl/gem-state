import { ScrollRail } from "@/components/marketplace/ScrollRail";
import { Link } from "@tanstack/react-router";
import { SquaresFour } from "@phosphor-icons/react";
import { mobilePrimaryCategories } from "@/config/mobile-navigation";
import { CategoryArtwork } from "./CategoryIcon";

/** Match the app's compact category navigation without growing the mobile hero. */
export function HomeCategoryShortcuts() {
  const ordered = ["cars-trucks", "pets", "firearms", "other-real-estate", "jobs", "services"];
  const pill =
    "inline-flex min-h-11 shrink-0 items-center gap-1.5 rounded-full border border-border/70 bg-card px-3.5 text-xs font-medium shadow-sm";
  return (
    <ScrollRail
      as="nav"
      aria-label="Shop by category"
      className="no-scrollbar -mx-4 mt-3 flex gap-2 overflow-x-auto px-4 pb-2 sm:hidden"
    >
      {ordered
        .map((slug) => mobilePrimaryCategories.find((category) => category.slug === slug))
        .map(
          (category) =>
            category && (
              <Link
                key={category.slug}
                to="/browse"
                search={
                  "group" in category ? { group: category.group } : { category: category.slug }
                }
                className={pill}
              >
                <CategoryArtwork slug={category.slug} size={22} />
                {category.name}
              </Link>
            ),
        )}
      <Link
        to="/browse"
        search={{ allCategories: true }}
        className={`${pill} border-primary/20 bg-primary/8 font-semibold text-primary`}
      >
        <SquaresFour size={18} aria-hidden="true" />
        All
      </Link>
    </ScrollRail>
  );
}
