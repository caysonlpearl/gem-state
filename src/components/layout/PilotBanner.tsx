import { Info } from "@phosphor-icons/react";

export function PilotBanner() {
  return (
    <div className="border-b border-primary bg-primary">
      <div className="mx-auto flex max-w-[1360px] items-center justify-center gap-2 px-4 py-1.5 sm:px-6">
        <Info size={13} className="shrink-0 text-primary-foreground/70" />
        <p className="text-[10.5px] leading-snug text-primary-foreground/85 sm:text-[11.5px]">
          Mobile app coming soon
        </p>
      </div>
    </div>
  );
}
