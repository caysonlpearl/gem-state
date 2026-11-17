import { ScrollRail } from "@/components/marketplace/ScrollRail";
import type { ReactNode } from "react";

/** Shared website/app layout; each platform retains its own navigation and learning adapter. */
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
  const visible = items.slice(0, 4);
  if (!visible.length) return null;
  return (
    <section className={className}>
      <h2 className="mb-4 text-lg font-semibold">{title}</h2>
      <ScrollRail
        role="list"
        aria-label={`${title} listings`}
        tabIndex={0}
        className="shopping-listing-rail no-scrollbar flex gap-2.5 overflow-x-auto pb-1 md:grid md:grid-cols-4 md:gap-4 md:overflow-visible"
      >
        {visible.map((card, position) => (
          <div
            key={card.id}
            role="listitem"
            className="shopping-rail-card flex min-w-0 shrink-0 flex-col [&>article]:flex-1"
            onClick={onCardClick ? () => onCardClick(card, position) : undefined}
          >
            {renderCard(card, position)}
          </div>
        ))}
      </ScrollRail>
      {renderFooter?.(visible)}
    </section>
  );
}
