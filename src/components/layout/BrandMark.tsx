import { brand } from "@/config/brand";
import { cn } from "@/lib/utils";

export function BrandMark({
  compact = false,
  mobile = false,
  className,
}: {
  compact?: boolean;
  mobile?: boolean;
  className?: string;
}) {
  const showMarkOnly = compact && !mobile;

  return (
    <span className={cn("inline-flex items-center gap-2.5", className)}>
      <img
        src={
          showMarkOnly
            ? "/images/brand/gem-state-classifieds-mark.png"
            : "/images/brand/gem-state-classifieds-logo.png"
        }
        alt={brand.name}
        className={
          showMarkOnly
            ? "h-10 w-8 shrink-0 object-contain"
            : mobile
              ? "h-9 w-[112px] max-w-full shrink-0 object-contain"
              : "h-16 w-auto max-w-[220px] shrink-0 object-contain"
        }
      />
    </span>
  );
}
