import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

type BluebirdEmptyStateProps = {
  title: string;
  description?: ReactNode;
  eyebrow?: string;
  children?: ReactNode;
  className?: string;
};

/** A consistent, friendly illustration for empty, missing, and recoverable error states. */
export function BluebirdEmptyState({
  title,
  description,
  eyebrow = "Bluebird marketplace",
  children,
  className,
}: BluebirdEmptyStateProps) {
  return (
    <div className={cn("soft-card px-5 py-8 sm:px-8 sm:py-9", className)}>
      <div className="mx-auto flex max-w-2xl flex-col items-center gap-5 sm:flex-row sm:gap-7 sm:text-left">
        <div className="grid h-28 w-28 shrink-0 place-items-center rounded-full bg-secondary/70 p-3 sm:h-32 sm:w-32">
          <img
            src="/images/brand/bluebird-error-bird.webp"
            alt=""
            aria-hidden="true"
            width={320}
            height={267}
            // Usually below the fold (empty listing rows); don't let React
            // preload it ahead of what the page needs to paint.
            loading="lazy"
            decoding="async"
            className="h-full w-full object-contain"
          />
        </div>
        <div className="min-w-0 text-center sm:text-left">
          {eyebrow ? (
            <p className="font-mono text-[9px] font-semibold uppercase tracking-[0.18em] text-primary">
              {eyebrow}
            </p>
          ) : null}
          <h1 className="mt-1 text-[18px] font-semibold tracking-tight text-foreground">{title}</h1>
          {description ? (
            <div className="mt-2 max-w-[52ch] text-[13px] leading-relaxed text-muted-foreground">
              {description}
            </div>
          ) : null}
          {children ? (
            <div className="mt-5 flex flex-wrap justify-center gap-2 sm:justify-start">
              {children}
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
