import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ChartLineUp } from "@phosphor-icons/react";
import { useEffect, useState } from "react";
import { getVehiclePriceInsight } from "@/lib/vehicle-price-insights.functions";
import {
  valuationProviderNames,
  type VehiclePriceInsight as Insight,
} from "@/lib/vehicle-price-insights";
import { formatUsd } from "@/config/fees";

export function VehiclePriceInsightCard({ insight }: { insight: Insight }) {
  return (
    <section className="soft-card overflow-hidden" aria-label="Vehicle price insight">
      <div className="bg-primary/5 px-5 py-4">
        <h2 className="flex items-center gap-2 text-[14px] font-bold text-primary">
          <ChartLineUp size={19} aria-hidden="true" /> Price insight
        </h2>
        <p className="mt-2 text-[17px] font-bold text-primary">
          {insight.comparison === "below"
            ? "Below the estimated market price"
            : insight.comparison === "above"
              ? "Above the estimated market price"
              : "Near the estimated market price"}
        </p>
      </div>
      <div className="space-y-3 px-5 py-4">
        <div className="flex items-baseline justify-between gap-3">
          <span className="text-[12px] text-muted-foreground">Estimated retail asking price</span>
          <strong className="text-[19px] tracking-tight">{formatUsd(insight.estimateCents)}</strong>
        </div>
        <p className="text-[12px] leading-relaxed text-muted-foreground">
          An estimate based on vehicle details and market data. Options, condition, history,
          certification, incentives, and fees can change the value. This is not an appraisal or a
          sale-price guarantee.
        </p>
        <p className="border-t border-border/60 pt-3 text-[10px] leading-relaxed text-muted-foreground">
          Estimate from {valuationProviderNames[insight.provider]} · Checked{" "}
          {new Date(insight.updatedAt).toLocaleDateString("en-US", {
            month: "short",
            day: "numeric",
            timeZone: "America/Boise",
          })}
          .{" "}
          {insight.dataThrough ? (
            <>
              Market data through{" "}
              {new Date(insight.dataThrough).toLocaleDateString("en-US", {
                month: "short",
                day: "numeric",
                year: "numeric",
                timeZone: "America/Boise",
              })}
              .{" "}
            </>
          ) : null}
          Price comparison by Bluebird.
        </p>
      </div>
    </section>
  );
}

export function VehiclePriceInsight({ listingId }: { listingId: string }) {
  const fetchInsight = useServerFn(getVehiclePriceInsight);
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    setMounted(true);
  }, []);
  const query = useQuery({
    queryKey: ["vehicle-price-insight", listingId],
    queryFn: () => fetchInsight({ data: { listingId } }),
    enabled: mounted,
    staleTime: 5 * 60 * 1000,
    retry: false,
    refetchOnWindowFocus: false,
  });
  return query.data ? <VehiclePriceInsightCard insight={query.data} /> : null;
}
