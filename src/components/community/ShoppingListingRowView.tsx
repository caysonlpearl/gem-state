import { ListingPreviewRail } from "@/components/classifieds/ListingPreviewRail";
import { LISTING_PREVIEW_LIMIT } from "@/lib/listing-preview";
import type { ReactNode } from "react";

export function ShoppingListingRowView<T extends { id: string }>({
  title,
  items,
  renderCard,
  renderFooter,
  onCardClick,
  className,
}: {
  title: string;
  items: readonly T[];
  renderCard: (card: T, position: number) => ReactNode;
  renderFooter?: (visible: readonly T[]) => ReactNode;
  onCardClick?: (card: T, position: number) => void;
  className?: string;
}) {
  const visible = items.slice(0, LISTING_PREVIEW_LIMIT);
  if (!visible.length) return null;
  return (
    <section className={className}>
      <h2 className="mb-4 text-lg font-semibold">{title}</h2>
      <ListingPreviewRail
        label={`${title} listings`}
        items={visible}
        renderCard={renderCard}
        onCardClick={onCardClick}
        className="shopping-listing-rail"
      />
      {renderFooter?.(visible)}
    </section>
  );
}
