import type { ReactNode } from "react";
import { AccountSectionHeader } from "./AccountSectionView";
/** The existing website partner sections, shared without importing its auth/tracking adapters. */
export function SavedPartnerSectionView<T>({
  kind,
  items,
  renderCard,
  credit,
}: {
  kind: "jobs" | "homes" | "vehicles";
  items: readonly T[];
  renderCard: (item: T, index: number) => ReactNode;
  credit?: ReactNode;
}) {
  if (!items.length) return null;
  const single = kind === "homes" ? "home" : kind === "vehicles" ? "vehicle" : "listing";
  return (
    <section className="mt-10 space-y-4">
      <AccountSectionHeader
        eyebrow={
          kind === "homes"
            ? "Saved homes"
            : kind === "vehicles"
              ? "Saved vehicles"
              : "Saved partner listings"
        }
        title={`${items.length} saved ${items.length === 1 ? single : single + "s"} from ${kind === "jobs" ? "partners" : "partner listings"}`}
        body={
          kind === "homes"
            ? "Homes from Mashvisor. Prices, availability, and property details can change; verify them with the listing source."
            : kind === "vehicles"
              ? "Vehicles from MarketCheck. Prices, availability, and vehicle details can change; verify them with the original seller."
              : "Your saved jobs, businesses, pets, and product listings."
        }
      />
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {items.map(renderCard)}
      </div>
      {credit}
    </section>
  );
}
