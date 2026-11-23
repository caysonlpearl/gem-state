import type { ReactNode } from "react";

export function MarketplaceVehicleLeadHeader({ action }: { action: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <h2 className="min-w-0 text-[19px] font-bold tracking-tight sm:text-[26px]">
        Vehicles in Idaho
      </h2>
      {action}
    </div>
  );
}
