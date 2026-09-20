import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Eye } from "@phosphor-icons/react";

import { getVariantWatcherCount } from "@/lib/community.functions";

/**
 * Compact "N watching" pill shown beside the follow control on a product page.
 * Read-only presentation of a public aggregate — no member identities.
 */
export function WatcherCount({
  variantId,
  floating = false,
}: {
  variantId: string;
  floating?: boolean;
}) {
  const fetchCount = useServerFn(getVariantWatcherCount);
  const query = useQuery({
    queryKey: ["watcher-count", variantId],
    queryFn: () => fetchCount({ data: { variantId } }),
    staleTime: 30_000,
  });

  const count = query.data?.watcherCount ?? 0;
  if (query.isLoading || count <= 0) return null;

  return (
    <span
      className={
        floating
          ? "watcher-bob inline-flex items-center gap-1.5 rounded-full border border-brand-warm/45 bg-background/90 px-2.5 py-1 text-[12px] font-medium text-foreground shadow-lg backdrop-blur"
          : "inline-flex h-9 items-center gap-1.5 rounded-md border border-brand-warm/35 bg-brand-warm/10 px-2.5 text-[12.5px] font-medium text-foreground"
      }
      title="Members following this variation right now"
    >
      <Eye size={14} weight="fill" className="text-brand-warm" aria-hidden />
      <span className="numeric font-mono text-[13px] font-semibold tabular-nums">{count}</span>
      <span className="text-muted-foreground">watching</span>
    </span>
  );
}
