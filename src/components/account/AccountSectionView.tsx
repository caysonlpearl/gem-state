import type { ReactNode } from "react";

export function AccountSectionHeader({
  eyebrow,
  title,
  body,
  action,
}: {
  eyebrow: string;
  title: string;
  body?: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-4 border-b border-border pb-4">
      <div>
        <p className="font-mono text-[9px] uppercase tracking-[0.18em] text-primary">{eyebrow}</p>
        <h2 className="mt-1 text-[28px] font-bold tracking-tight">{title}</h2>
        {body && (
          <p className="mt-2 max-w-[68ch] text-[13px] leading-relaxed text-muted-foreground">
            {body}
          </p>
        )}
      </div>
      {action}
    </div>
  );
}

export function AccountEmptyState({
  title,
  body,
  action,
}: {
  title: string;
  body: string;
  action?: ReactNode;
}) {
  return (
    <div className="rounded-2xl border border-dashed border-border bg-secondary/20 px-5 py-12 text-center">
      <p className="text-[14px] font-semibold">{title}</p>
      <p className="mx-auto mt-2 max-w-[48ch] text-[12px] leading-relaxed text-muted-foreground">
        {body}
      </p>
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}
