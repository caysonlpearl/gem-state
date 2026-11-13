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
      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        {visible.map((card, position) => (
          <div
            key={card.id}
            className="flex min-w-0 flex-col [&>article]:flex-1"
            onClick={onCardClick ? () => onCardClick(card, position) : undefined}
          >
            {renderCard(card, position)}
          </div>
        ))}
      </div>
      {renderFooter?.(visible)}
    </section>
  );
}
