import { ScrollRail } from "@/components/marketplace/ScrollRail";
import type { ReactNode } from "react";

export function ListingPreviewRail<T extends { id: string }>({
  label,
  items,
  renderCard,
  onCardClick,
  className = "",
}: {
  label: string;
  items: readonly T[];
  renderCard: (item: T, index: number) => ReactNode;
  onCardClick?: (item: T, index: number) => void;
  className?: string;
}) {
  return (
    <ScrollRail
      role="list"
      aria-label={label}
      tabIndex={0}
      className={`listing-preview-rail flex gap-3 overflow-x-auto overscroll-x-contain pb-2 focus-visible:outline-2 focus-visible:outline-primary max-lg:no-scrollbar sm:gap-4 ${className}`}
    >
      {items.map((item, index) => (
        <div
          key={item.id}
          role="listitem"
          className="flex min-w-0 shrink-0 flex-col [&>article]:flex-1"
          onClick={onCardClick ? () => onCardClick(item, index) : undefined}
        >
          {renderCard(item, index)}
        </div>
      ))}
    </ScrollRail>
  );
}
