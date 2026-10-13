import { useEffect, useState, type ReactNode } from "react";
import { FunnelSimple } from "@phosphor-icons/react";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";

/** One copy of each category's controls: an inline desktop sidebar or a mobile drawer. */
export function ResponsiveBrowseFilters({
  title,
  activeCount = 0,
  resetKey,
  children,
}: {
  title: string;
  activeCount?: number;
  resetKey: string;
  children: ReactNode;
}) {
  const [desktop, setDesktop] = useState(false);
  const [open, setOpen] = useState(false);
  useEffect(() => {
    const media = window.matchMedia("(min-width: 1024px)");
    const update = () => {
      setDesktop(media.matches);
      if (media.matches) setOpen(false);
    };
    update();
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);
  useEffect(() => setOpen(false), [resetKey]);

  if (desktop) {
    return (
      <aside
        aria-label={title}
        className="min-w-0 self-start rounded-2xl border border-border bg-card p-4 shadow-sm"
      >
        <h2 className="mb-5 border-b border-border pb-4 text-lg font-bold">{title}</h2>
        {children}
      </aside>
    );
  }
  return (
    <div className="lg:hidden">
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetTrigger asChild>
          <button
            type="button"
            className="inline-flex min-h-11 items-center gap-2 rounded-full border border-input bg-card px-5 text-sm font-semibold shadow-sm"
          >
            <FunnelSimple size={17} className="text-primary" aria-hidden="true" />
            Filters
            {activeCount > 0 && (
              <span className="grid h-5 min-w-5 place-items-center rounded-full bg-accent px-1.5 text-[10px] font-bold">
                {activeCount}
              </span>
            )}
          </button>
        </SheetTrigger>
        <SheetContent side="left" className="w-full overflow-y-auto p-0 sm:max-w-lg">
          <SheetHeader className="border-b border-border p-5 pr-14 text-left">
            <SheetTitle>{title}</SheetTitle>
            <SheetDescription>
              Narrow your search, then apply your filters to see matching listings.
            </SheetDescription>
          </SheetHeader>
          <div className="p-5">{children}</div>
        </SheetContent>
      </Sheet>
    </div>
  );
}
