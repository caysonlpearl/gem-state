import type { ReactNode } from "react";

export function MarketplaceListingSection({
  eyebrow,
  title,
  action,
  children,
  density = "standard",
  className = "",
}: {
  eyebrow: string;
  title: string;
  action: ReactNode;
  children: ReactNode;
  density?: "standard" | "compact";
  className?: string;
}) {
  const id = `${title.toLowerCase().replaceAll(" ", "-")}-heading`;
  return (
    <section
      className={`${density === "compact" ? "mt-4" : "mt-16"} ${className}`}
      aria-labelledby={id}
    >
      <div
        className={
          density === "compact"
            ? "flex items-center justify-between gap-2"
            : "flex items-end justify-between gap-4 border-b border-border pb-3"
        }
      >
        <div>
          {density !== "compact" && (
            <p className="font-mono text-[9px] uppercase tracking-[0.18em] text-primary">
              {eyebrow}
            </p>
          )}
          <h2
            id={id}
            className={
              density === "compact"
                ? "text-[18px] font-bold tracking-tight"
                : "mt-1 text-[26px] font-bold tracking-tight"
            }
          >
            {title}
          </h2>
        </div>
        {action}
      </div>
      {children}
    </section>
  );
}
