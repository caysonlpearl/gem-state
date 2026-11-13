import type { ReactNode } from "react";

/** Original website header dimensions, shared with the bundled app. */
export function SiteHeaderBar({ children }: { children: ReactNode }) {
  return (
    <div className="relative z-30 mx-auto grid min-w-0 h-16 max-w-[1440px] grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-2 px-3 sm:h-[108px] sm:gap-8 sm:px-8">
      {children}
    </div>
  );
}
