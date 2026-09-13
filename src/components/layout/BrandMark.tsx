import { Gem } from "@phosphor-icons/react";

import { brand } from "@/config/brand";
import { cn } from "@/lib/utils";

export function BrandMark({ compact = false, className }: { compact?: boolean; className?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-2.5", className)}>
      <span className="grid size-9 shrink-0 place-items-center rounded-md bg-primary text-primary-foreground shadow-sm">
        <Gem size={21} weight="fill" aria-hidden="true" />
      </span>
      {!compact && (
        <span className="font-display text-[18px] font-bold leading-none text-foreground">
          Gem State <span className="text-primary">Classifieds</span>
        </span>
      )}
      <span className="sr-only">{brand.name}</span>
    </span>
  );
}