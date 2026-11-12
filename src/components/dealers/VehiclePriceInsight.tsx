import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Info } from "@phosphor-icons/react";
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
  above: {
    label: "Asking above market",
  },
  near: {
    label: "Asking near market",
  },
  below: {
    label: "Asking below market",
  },
} as const;

export function VehiclePriceInsightCard({ insight }: { insight: Insight }) {
  const style = comparisonStyle[insight.comparison];
  const details = insight.vehicleDetails;
  const inputs = new Set(insight.providerInputs ?? []);
  const delta = Math.abs(insight.differenceCents);
  const fields = details
    ? [
        ["Vehicle", `${details.year} ${details.make} ${details.model}`],
        ["Trim", details.trim],
        ["Mileage", `${details.miles.toLocaleString("en-US")} mi`],
        [
          "Condition",
          details.certified ? "Certified pre-owned" : details.condition === "new" ? "New" : "Used",
        ],
        ["Market", details.state],
        ...(inputs.has("drivetrain") ? [["Drive", details.drivetrain?.toUpperCase()]] : []),
        ...(inputs.has("fuel") ? [["Fuel", details.fuel]] : []),
        ...(inputs.has("transmission") ? [["Transmission", details.transmission]] : []),
        ...(inputs.has("body_style") ? [["Body", details.bodyStyle]] : []),
        ...(inputs.has("color") ? [["Color", details.color]] : []),
        ...(inputs.has("base_msrp")
          ? [["MSRP", details.baseMsrp ? wholeDollars(details.baseMsrp * 100) : null]]
          : []),
      ].filter(([, value]) => value)
    : [];
  return (
    <section
      className="overflow-hidden rounded-[18px] border border-[#deded9] bg-white text-[#222b32]"
      style={{ fontFamily: "Arial, Helvetica, sans-serif", fontFeatureSettings: "normal" }}
      aria-label="Vehicle price insight"
    >
      <div className="flex items-center justify-between gap-3 border-b border-[#ecece8] px-5 py-3">
        <div className="flex min-w-0 items-center gap-2.5">
          <img
            src="/images/brand/bluebird-error-bird.webp"
            alt=""
            aria-hidden="true"
            className="size-8 shrink-0 object-contain"
            width={32}
            height={32}
          />
          <h2
            className="text-[14px] font-semibold leading-5 tracking-normal text-[#112e44]"
            style={{ fontFamily: "inherit" }}
          >
            Bluebird Insights
          </h2>
        </div>
        <img
          src="/images/brand/bluebird-insights-rosette.webp"
          alt=""
          aria-hidden="true"
          className="h-10 w-8 shrink-0 object-contain"
          width={32}
          height={40}
        />
      </div>
      <div className="px-5 pb-5 pt-4">
        <p className="text-[12px] leading-5 text-[#666c70]">Estimated retail asking price</p>
        <p className="mt-1 text-[30px] font-semibold leading-9 tracking-[-0.02em] text-[#112e44] tabular-nums">
          {wholeDollars(insight.estimateCents)}
        </p>
        <div className="mt-4 border-t border-[#ecece8] pt-4">
          <p
            aria-label={`Price rating: ${style.label}`}
            className="text-[14px] font-semibold leading-5"
          >
            {style.label}
          </p>
          <p className="mt-1 text-[12px] leading-[18px] text-[#666c70]">
            {delta === 0 ? (
              "Asking price matches estimate."
            ) : (
              <>
                {wholeDollars(delta)} {insight.differenceCents < 0 ? "below" : "above"} estimate
              </>
            )}
          </p>
        </div>
        <div
          className="mt-4"
          role="img"
          aria-label={`${style.label}. Asking price ${wholeDollars(insight.askingCents)}, estimated retail asking price ${wholeDollars(insight.estimateCents)}. The scale shows comparison bands, not a value range.`}
        >
          <div className="relative pt-5">
            <div
              className="absolute top-0 -translate-x-1/2 text-[#087ab5]"
              style={{ left: `${insight.pointerPercent}%` }}
              aria-hidden="true"
            >
              <span className="block whitespace-nowrap text-[10px] font-normal leading-3">
                Asking price
              </span>
              <svg viewBox="0 0 20 12" className="mx-auto mt-0.5 h-2 w-3 fill-current">
                <path d="M1 1h18L10 11z" />
              </svg>
            </div>
            <div
              className="grid h-2 grid-cols-3 gap-0.5 overflow-hidden rounded-full"
              aria-hidden="true"
            >
              <span className="bg-[#cb8077]" />
              <span className="bg-[#d9bb69]" />
              <span className="bg-[#6a9e89]" />
            </div>
          </div>
          <div
            className="mt-2 grid grid-cols-3 text-[11px] font-normal leading-4 text-[#666c70]"
            aria-hidden="true"
          >
            <span>Above market</span>
            <span className="text-center">Near market</span>
            <span className="text-right">Below market</span>
          </div>
        </div>
      </div>
      <div className="border-t border-[#ecece8] px-5 py-3.5">
        <details className="group text-[12px] leading-[18px] text-[#666c70]">
          <summary className="flex cursor-pointer list-none items-center justify-between gap-2 font-normal text-[#112e44]">
            About this estimate <Info size={16} aria-hidden="true" />
          </summary>
          {fields.length ? (
            <dl className="mt-3 space-y-1.5 rounded-xl bg-secondary/40 p-3">
              {fields.map(([label, value]) => (
                <div key={label} className="flex justify-between gap-4">
                  <dt>{label}</dt>
                  <dd className="text-right font-medium capitalize text-foreground">{value}</dd>
                </div>
              ))}
            </dl>
          ) : null}
          {insight.unconfirmedInputs?.length ? (
            <p className="mt-3">
              Some additional listing specifications are not reflected in this estimate. Only
              confirmed estimate factors are shown above.
            </p>
          ) : null}
          <p className="mt-3">
            Estimate source: {valuationProviderNames[insight.provider]}. Bluebird compares the
            asking price with this provider’s estimated retail asking price. “Near market” means
            within {Math.round(insight.tolerancePct)}% of the estimate, allowing for model
            uncertainty. The scale is not a confidence interval.
          </p>
          <p className="mt-2">
            Condition uses the listing’s new, used, or certified status. Wear, accident history,
            options, incentives, and fees may change the value. This is not an inspection,
            appraisal, or guaranteed sale price.
          </p>
          {insight.provider !== "vehicles" ? (
            <p className="mt-2">
              This provider identifies the vehicle by VIN; the details above describe the listing.
            </p>
          ) : null}
        </details>
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
