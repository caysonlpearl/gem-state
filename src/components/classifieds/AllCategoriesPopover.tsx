import { Link } from "@tanstack/react-router";
import { CaretDown } from "@phosphor-icons/react";

import { CategoryArtwork } from "@/components/classifieds/CategoryIcon";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

type CategoryMenuItem = {
  slug: string;
  name: string;
  group: "motors" | "classifieds";
};

// The complete category menu stays in one place so the header and the
// classifieds landing page open the same taxonomy and behave identically.
const allCategoryMenuItems = [
  { slug: "cars-trucks", name: "Cars & Trucks", group: "motors" },
  { slug: "motorcycles", name: "Motorcycles", group: "motors" },
  { slug: "rvs-campers", name: "Recreational Vehicles", group: "motors" },
  { slug: "powersports", name: "Powersports", group: "motors" },
  { slug: "auto-parts", name: "Auto Parts and Accessories", group: "motors" },
  { slug: "trailers", name: "Trailers", group: "motors" },
  { slug: "announcements", name: "Announcements", group: "classifieds" },
  { slug: "appliances", name: "Appliances", group: "classifieds" },
  { slug: "baby", name: "Baby", group: "classifieds" },
  { slug: "books-media", name: "Books and Media", group: "classifieds" },
  { slug: "clothing-apparel", name: "Clothing and Apparel", group: "classifieds" },
  { slug: "computers", name: "Computers", group: "classifieds" },
  { slug: "cycling", name: "Cycling", group: "classifieds" },
  { slug: "electronics", name: "Electronics", group: "classifieds" },
  { slug: "fitness-equipment", name: "Fitness Equipment", group: "classifieds" },
  { slug: "for-trade-barter", name: "For Trade or Barter", group: "classifieds" },
  { slug: "free", name: "FREE", group: "classifieds" },
  { slug: "furniture", name: "Furniture", group: "classifieds" },
  { slug: "general", name: "General", group: "classifieds" },
  { slug: "home-garden", name: "Home and Garden", group: "classifieds" },
  { slug: "hunting-fishing", name: "Hunting and Fishing", group: "classifieds" },
  { slug: "industrial", name: "Industrial", group: "classifieds" },
  { slug: "jobs", name: "Jobs", group: "classifieds" },
  { slug: "livestock", name: "Livestock", group: "classifieds" },
  { slug: "musical-instruments", name: "Musical Instruments", group: "classifieds" },
  { slug: "other-real-estate", name: "Homes", group: "classifieds" },
  { slug: "outdoor-sporting", name: "Outdoors and Sporting", group: "classifieds" },
  { slug: "pets", name: "Pets", group: "classifieds" },
  { slug: "services", name: "Services", group: "classifieds" },
  { slug: "tickets", name: "Tickets", group: "classifieds" },
  { slug: "toys", name: "Toys", group: "classifieds" },
  { slug: "water-sports", name: "Water Sports", group: "classifieds" },
  { slug: "weddings", name: "Weddings", group: "classifieds" },
  { slug: "winter-sports", name: "Winter Sports", group: "classifieds" },
  { slug: "tools-equipment", name: "Tools & Equipment", group: "classifieds" },
  { slug: "farm-garden", name: "Farm & Garden", group: "classifieds" },
] as const satisfies readonly CategoryMenuItem[];

export function AllCategoriesPopover({
  onSelect,
  className = "",
}: {
  onSelect?: () => void;
  className?: string;
}) {
  const triggerClassName =
    "inline-flex h-12 items-center justify-center gap-2 rounded-full border border-primary px-6 text-[13px] font-semibold text-primary transition-colors hover:bg-primary hover:text-primary-foreground " +
    className;

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button type="button" className={triggerClassName}>
          <span>Browse Categories</span>
          <CaretDown size={15} weight="bold" aria-hidden="true" />
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="center"
        sideOffset={12}
        className="w-[min(1280px,calc(100vw-2rem))] rounded-[24px] p-3 shadow-xl sm:p-5"
      >
        <div className="border-b border-border px-2 pb-4 sm:px-3">
          <p className="text-[18px] font-semibold tracking-tight">All categories</p>
          <p className="mt-1 text-[12px] leading-relaxed text-muted-foreground">
            Browse every corner of Gem State classifieds.
          </p>
        </div>
        <div className="mt-3 grid max-h-[min(720px,70vh)] gap-1 overflow-y-auto pr-1 sm:grid-cols-2 sm:gap-2 lg:grid-cols-4 xl:grid-cols-6 xl:max-h-none xl:overflow-visible xl:gap-3">
          {allCategoryMenuItems.map((category) => (
            <Link
              key={category.slug}
              to="/browse"
              search={{ category: category.slug }}
              onClick={onSelect}
              className="group flex min-h-20 items-center gap-3 rounded-2xl px-3 py-2 text-left transition-colors hover:bg-secondary"
            >
              <CategoryArtwork
                slug={category.slug}
                size={58}
                className="!h-[58px] !w-[58px] shrink-0"
              />
              <span className="text-[13px] font-medium leading-tight">{category.name}</span>
            </Link>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}
