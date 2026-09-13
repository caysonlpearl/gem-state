import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";

import { formatUsd } from "@/config/fees";
import { getPriceHistory } from "@/lib/community.functions";
import type { IllustrativeActivity } from "@/config/illustrative-activity";

/**
 * Daily market history for one variation, built from real captured snapshots
 * only. Nothing is interpolated or projected: days without a capture simply do
 * not appear, and `last sale` stays absent until a verified sale exists.
 */
export function PriceHistory({
  variantId,
  isDemo,
  illustrative,
}: {
  variantId: string;
  isDemo: boolean;
  illustrative?: IllustrativeActivity | null;
}) {
  const fetchHistory = useServerFn(getPriceHistory);
  const history = useQuery({
    queryKey: ["price-history", variantId],
    queryFn: () => fetchHistory({ data: { variantId } }),
    enabled: !isDemo,
  });

  if (isDemo && !illustrative) return null;

  // Real captured snapshots always win once they exist; illustrative rows are
  // only a placeholder for variations that have none yet.
  const realPoints = history.data ?? [];
  const points = realPoints.length > 0 ? realPoints : (illustrative?.history ?? []);
  const isIllustrative = realPoints.length === 0 && points.length > 0;
  const latest = points.length > 0 ? points[points.length - 1]! : null;

  return (
    <div className="mt-4 rounded-lg border border-border bg-card">
      <div className="hairline-b px-4 py-2.5">
        <h2 className="text-[13px] font-semibold tracking-tight">Market history</h2>
      </div>
      <div className="px-4 py-3">
        {history.isLoading && <p className="text-[12.5px] text-muted-foreground">Loading…</p>}

        {!history.isLoading && points.length === 0 && (
          <p className="text-[12.5px] leading-relaxed text-muted-foreground">
            <span className="font-medium text-foreground">No market history yet.</span> ParkVault
            records one snapshot of this variation each day. History appears once the first snapshot
            after the variation went live has been captured, and no values are estimated.
          </p>
        )}

        {points.length > 0 && (
          <>
            <p className="text-[12px] text-muted-foreground">
              {points.length} market snapshot{points.length === 1 ? "" : "s"}. A blank cell means
              nothing was on the book that day.
              {isIllustrative && " Preview—activity shown is illustrative."}
            </p>
            <div className="mt-3 overflow-x-auto">
              <table className="w-full min-w-[420px] text-left text-[12px]">
                <thead className="text-muted-foreground">
                  <tr>
                    <th className="pb-1.5 font-medium">Day</th>
                    <th className="pb-1.5 font-medium">Lowest price</th>
                    <th className="pb-1.5 font-medium">Highest bid</th>
                    <th className="pb-1.5 font-medium">Lowest sourcing</th>
                    <th className="pb-1.5 font-medium">Last sale</th>
                  </tr>
                </thead>
                <tbody>
                  {points
                    .slice()
                    .reverse()
                    .slice(0, 30)
                    .map((point, index) => (
                      <tr key={`${point.capturedOn}-${index}`} className="hairline-t">
                        <td className="numeric py-1.5">{point.capturedOn}</td>
                        <td className="numeric py-1.5">
                          {point.lowestAskCents != null ? formatUsd(point.lowestAskCents) : "—"}
                        </td>
                        <td className="numeric py-1.5">
                          {point.highestBidCents != null ? formatUsd(point.highestBidCents) : "—"}
                        </td>
                        <td className="numeric py-1.5">
                          {point.lowestSourcingAskCents != null
                            ? formatUsd(point.lowestSourcingAskCents)
                            : "—"}
                        </td>
                        <td className="numeric py-1.5">
                          {point.lastSaleCents != null ? formatUsd(point.lastSaleCents) : "—"}
                        </td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
            {latest && latest.lastSaleCents == null && (
              <p className="mt-2 text-[11.5px] leading-relaxed text-muted-foreground">
                No completed sale has been verified for this variation yet, so no last-sale price is
                shown.
              </p>
            )}
          </>
        )}
      </div>
    </div>
  );
}
