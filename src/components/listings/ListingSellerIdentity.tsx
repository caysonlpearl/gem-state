import type { ReactNode } from "react";

/** The same seller identity treatment across listing categories and sources. */
export function ListingSellerIdentity({
  name,
  imageUrl,
  title,
  subtitle,
  badge,
  headingLevel = "h2",
}: {
  name: string;
  imageUrl?: string | null;
  title?: ReactNode;
  subtitle?: ReactNode;
  badge?: ReactNode;
  headingLevel?: "h1" | "h2";
}) {
  const Heading = headingLevel;
  return (
    <div className="rounded-2xl border border-[#b8d4e6] bg-[#edf6fc] p-4">
      <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
        Listed by
      </p>
      <div className="mt-3 flex items-center gap-3">
        {imageUrl ? (
          <img src={imageUrl} alt={`${name} logo`} className="h-12 w-24 shrink-0 object-contain" />
        ) : (
          <div
            aria-hidden="true"
            className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-primary text-lg font-bold text-primary-foreground"
          >
            {name.slice(0, 1).toUpperCase()}
          </div>
        )}
        <div className="min-w-0">
          <Heading className="flex items-center gap-1.5 text-[15px] font-bold">
            {title ?? name}
            {badge}
          </Heading>
          {subtitle ? (
            <div className="mt-1 text-[12px] text-muted-foreground">{subtitle}</div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
