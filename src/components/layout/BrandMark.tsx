import { cn } from "@/lib/utils";

export function BrandMark({
  mobile = false,
  className,
}: {
  compact?: boolean;
  mobile?: boolean;
  className?: string;
}) {
  return (
    <span className={cn("inline-flex items-center gap-2.5", className)}>
      <img
        src="/images/brand/bluebird-marketplace-logo.png"
        alt="Bluebird — Idaho's local marketplace"
        className={
          mobile
            ? "h-11 w-[152px] max-w-full shrink-0 object-contain"
            : "h-[68px] w-[260px] max-w-full shrink-0 object-contain"
        }
      />
    </span>
  );
}
