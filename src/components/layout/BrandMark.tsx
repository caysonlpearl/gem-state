import { brand } from "@/config/brand";
import { cn } from "@/lib/utils";

export function BrandMark({ compact = false, className }: { compact?: boolean; className?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-2.5", className)}>
      <img
        src={compact ? "/images/brand/gem-state-classifieds-mark.png" : "/images/brand/gem-state-classifieds-logo.png"}
        alt={brand.name}
        className={compact ? "h-10 w-8 shrink-0 object-contain" : "h-14 w-auto max-w-[190px] shrink-0 object-contain"}
      />
    </span>
  );
}
