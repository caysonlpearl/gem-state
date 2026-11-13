import type { ReactNode } from "react";

export function MarketplaceListingSection({
  eyebrow,
  title,
  action,
  children,
}: {
  eyebrow: string;
  title: string;
  action: ReactNode;
  children: ReactNode;
}) {
  const id = `${title.toLowerCase().replaceAll(" ", "-")}-heading`;
  return (
    <section className="mt-16" aria-labelledby={id}>
      <div className="flex items-end justify-between gap-4 border-b border-border pb-3">
        <div>
          <p className="font-mono text-[9px] uppercase tracking-[0.18em] text-primary">{eyebrow}</p>
          <h2 id={id} className="mt-1 text-[26px] font-bold tracking-tight">
            {title}
          </h2>
        </div>
        {action}
      </div>
      {children}
    </section>
  );
}
