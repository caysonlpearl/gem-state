import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState } from "react";
import { getVehiclePriceInsight } from "@/lib/vehicle-price-insights.functions";
import {
  valuationProviderNames,
  type VehiclePriceInsight as Insight,
} from "@/lib/vehicle-price-insights";

const wholeDollars = (cents: number) =>
  new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(cents / 100);

const comparisonStyle = {
  above: { label: "Above market", pill: "border-red-200 bg-red-50 text-red-800" },
  near: { label: "Fair price", pill: "border-blue-200 bg-blue-50 text-[#143e67]" },
  below: { label: "Below market", pill: "border-emerald-200 bg-emerald-50 text-emerald-800" },
} as const;

const roundHundred = (cents: number) => wholeDollars(Math.round(cents / 10000) * 10000);
const checkedDate = (date: string) => {
  const value = new Date(date);
  if (!Number.isFinite(value.getTime())) return null;
  const today = new Date().toLocaleDateString("en-US", { timeZone: "America/Boise" });
  return value.toLocaleDateString("en-US", { timeZone: "America/Boise" }) === today
    ? "checked today"
    : `checked ${value.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "America/Boise" })}`;
};

export function VehiclePriceInsightCard({ insight }: { insight: Insight }) {
  const style = comparisonStyle[insight.comparison];
  const percent = (Math.abs(insight.differenceCents) / insight.estimateCents) * 100;
  const delta =
    insight.differenceCents === 0
      ? "at estimate"
      : `${percent < 0.5 ? "<1" : Math.round(percent)}% ${insight.differenceCents < 0 ? "below" : "above"} estimate`;
  const inputs = new Set(insight.providerInputs ?? []);
  const method =
    insight.provider === "vehicles"
      ? `${["Year/make/model", ...(inputs.has("trim") ? ["trim"] : []), "mileage/condition/location"].join(", ")} · Vehicles.dev.`
      : `VIN and mileage retail estimate · ${valuationProviderNames[insight.provider]}.`;
  return (
    <section
      className="overflow-hidden rounded-[18px] border border-[#deded9] bg-white px-5 py-4 text-[#222b32]"
      style={{ fontFamily: "Arial, Helvetica, sans-serif", fontFeatureSettings: "normal" }}
      aria-label="Vehicle price insight"
    >
      <div className="mb-3 flex items-center justify-between gap-3">
        <h2
          className="text-[14px] font-semibold leading-5 tracking-normal text-[#112e44]"
          style={{ fontFamily: "inherit" }}
        >
          Bluebird Insights
        </h2>
        <img
          src="/images/brand/bluebird-error-bird.webp"
          alt=""
          aria-hidden="true"
          className="size-6 shrink-0 object-contain"
          width={24}
          height={24}
        />
      </div>
      <p
        aria-label={`Price rating: ${style.label}, ${delta}`}
        className={`inline-flex max-w-full flex-wrap items-center gap-x-1.5 rounded-full border px-3 py-1.5 text-[14px] font-semibold leading-5 ${style.pill}`}
      >
        <span>{style.label}</span>
        <span aria-hidden="true">·</span>
        <span>{delta}</span>
      </p>
      <p className="mt-3 text-[12px] leading-[18px] text-[#606970]">Estimated asking price</p>
      <p className="mt-1 text-[24px] font-semibold leading-8 tracking-[-0.02em] text-[#112e44] tabular-nums">
        ≈ {roundHundred(insight.estimateCents)}
      </p>
      <p className="mt-1 text-[12px] leading-[18px] text-[#606970]">
        {checkedDate(insight.updatedAt)}
      </p>
      <div
        className="mt-3"
        role="img"
        aria-label={`${style.label}, ${delta}. Asking price ${wholeDollars(insight.askingCents)}. The scale shows price comparison bands, not a statistical confidence interval.`}
      >
        <div className="relative pt-5">
          <div
            className="absolute top-0 -translate-x-1/2 text-[#087ab5]"
            style={{ left: `clamp(34px, ${insight.pointerPercent}%, calc(100% - 34px))` }}
            aria-hidden="true"
          >
            <span className="block whitespace-nowrap text-[12px] font-normal leading-3">
              Asking price
            </span>
          </div>
          <svg
            viewBox="0 0 20 12"
            className="absolute top-3.5 h-2 w-3 -translate-x-1/2 fill-[#087ab5]"
            style={{ left: `${insight.pointerPercent}%` }}
            aria-hidden="true"
          >
            <path d="M1 1h18L10 11z" />
          </svg>
          <div
            className="grid h-2.5 grid-cols-3 gap-0.5 overflow-hidden rounded-full"
            aria-hidden="true"
          >
            <span className="bg-[#ed4c4c]" />
            <span className="bg-[#f4c542]" />
            <span className="bg-[#23a76b]" />
          </div>
        </div>
        <div
          className="mt-1.5 grid grid-cols-3 text-[12px] font-normal leading-[18px] text-[#606970]"
          aria-hidden="true"
        >
          <span>Above</span>
          <span className="text-center">Fair</span>
          <span className="text-right">Below</span>
        </div>
      </div>
      <p className="mt-3 border-t border-[#ecece8] pt-3 text-[12px] leading-[18px] text-[#606970]">
        <span className="font-semibold text-[#112e44]">About this estimate:</span> {method}
      </p>
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
