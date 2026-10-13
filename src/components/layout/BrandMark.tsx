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
        src="/images/brand/bluebird-marketplace-logo.webp"
        srcSet="/images/brand/bluebird-marketplace-logo-320.webp 320w, /images/brand/bluebird-marketplace-logo.webp 640w"
        // Shared by the phone and desktop headers (both are rendered; CSS
        // shows one), so both pick the same file and it downloads once.
        sizes="(max-width: 639px) 150px, 320px"
        width={mobile ? 150 : 320}
        height={mobile ? 44 : 82}
        alt="Bluebird Marketplace — Idaho's local marketplace"
        className={
          mobile
            ? "h-[44px] w-[150px] max-w-full shrink-0 object-contain"
            : "h-[82px] w-[320px] max-w-full shrink-0 object-contain"
        }
      />
    </span>
  );
}
