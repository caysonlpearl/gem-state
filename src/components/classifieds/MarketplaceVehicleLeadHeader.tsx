import { Car } from "@phosphor-icons/react";
import type { ReactNode } from "react";
export function MarketplaceVehicleLeadHeader({ action }: { action: ReactNode }) {
  return (
    <div className="flex items-end justify-between gap-3">
      <div className="min-w-0">
        <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.12em] text-primary">
          <Car size={14} weight="fill" /> Cars &amp; trucks
        </p>
        <h2 className="mt-1 text-[19px] font-bold tracking-tight sm:whitespace-nowrap sm:text-[26px]">
          Cars &amp; trucks for sale in Idaho
        </h2>
      </div>
      {action}
    </div>
  );
}
