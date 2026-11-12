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
    dot: "bg-[#ef8b7f]",
  },
  near: {
    label: "Asking near market",
    dot: "bg-[#f1cf76]",
  },
  below: {
    label: "Asking below market",
    dot: "bg-[#7ed0aa]",
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
    <section className="soft-card overflow-hidden" aria-label="Vehicle price insight">
      <div className="flex items-center justify-between gap-3 border-b border-border/60 bg-secondary/25 px-4 py-2">
        <div className="flex min-w-0 items-center gap-2.5">
          <img
            src="/images/brand/bluebird-error-bird.webp"
            alt=""
            aria-hidden="true"
            className="size-9 shrink-0 object-contain"
            width={36}
            height={36}
          />
          <h2 className="text-[16px] font-extrabold tracking-tight text-[#112e44]">
            Bluebird Insights
          </h2>
        </div>
        <img
          src="/images/brand/bluebird-insights-rosette.webp"
          alt=""
          aria-hidden="true"
          className="h-16 w-14 shrink-0 object-contain"
          width={56}
          height={64}
        />
      </div>
      <div className="px-4 pb-4 pt-3">
        <div
          aria-label={`Price rating: ${style.label}`}
          className="flex items-center gap-2 text-[14px] font-bold text-primary"
        >
          <span aria-hidden="true" className={`size-1.5 shrink-0 rounded-full ${style.dot}`} />
          {style.label}
        </div>
        <p className="mt-2 text-[11px] leading-relaxed text-muted-foreground">
          {delta === 0 ? (
            "Asking price matches the estimate."
          ) : (
            <>
              <strong className="font-semibold text-foreground">{wholeDollars(delta)}</strong>{" "}
              {insight.differenceCents < 0 ? "below" : "above"} the estimate.
            </>
          )}
        </p>
        <div
          className="mt-3"
          role="img"
          aria-label={`${style.label}. Asking price ${wholeDollars(insight.askingCents)}, estimated retail asking price ${wholeDollars(insight.estimateCents)}. The scale shows comparison bands, not a value range.`}
        >
          <div className="relative pt-6">
            <div
              className="absolute top-0 -translate-x-1/2 text-[#087ab5]"
              style={{ left: `${insight.pointerPercent}%` }}
              aria-hidden="true"
            >
              <span className="block whitespace-nowrap text-[10px] font-bold">This price</span>
              <svg viewBox="0 0 20 12" className="mx-auto mt-0.5 h-3 w-5 fill-current">
                <path d="M1 1h18L10 11z" />
              </svg>
            </div>
            <div
              className="grid h-3 grid-cols-3 gap-1 overflow-hidden rounded-full"
              aria-hidden="true"
            >
              <span className="bg-[#d66b60]" />
              <span className="bg-[#e8bf58]" />
              <span className="bg-[#49a887]" />
            </div>
          </div>
          <div
            className="mt-1.5 grid grid-cols-3 text-[10px] font-semibold text-muted-foreground"
            aria-hidden="true"
          >
            <span>Above</span>
            <span className="text-center">Near market</span>
            <span className="text-right">Below</span>
          </div>
        </div>
        <div className="mt-3 flex items-center justify-between gap-3 rounded-xl bg-secondary/55 px-3 py-2.5">
          <span className="text-[11px] text-muted-foreground">Est. retail asking price</span>
          <strong className="text-[20px] tracking-tight text-primary">
            {wholeDollars(insight.estimateCents)}
          </strong>
        </div>
        <details className="group mt-3 text-[11px] leading-relaxed text-muted-foreground">
          <summary className="flex cursor-pointer list-none items-center justify-between gap-2 font-semibold text-primary">
            Vehicle details &amp; methodology <Info size={16} aria-hidden="true" />
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
