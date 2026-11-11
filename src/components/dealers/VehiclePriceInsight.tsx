import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ChartLineUp, Info } from "@phosphor-icons/react";
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
    badge: "bg-red-50 text-red-800 ring-red-200",
    color: "#b8443b",
  },
  near: {
    label: "Asking near market",
    badge: "bg-amber-50 text-amber-900 ring-amber-200",
    color: "#b78323",
  },
  below: {
    label: "Asking below market",
    badge: "bg-emerald-50 text-emerald-800 ring-emerald-200",
    color: "#188568",
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
      <div className="flex items-center gap-3 border-b border-primary/10 bg-[#edf5fa] px-5 py-4">
        <span className="flex size-12 shrink-0 items-center justify-center rounded-2xl bg-white ring-1 ring-primary/10">
          <img
            src="/images/brand/bluebird-favicon-transparent.png"
            alt=""
            className="size-10 object-contain"
          />
        </span>
        <div>
          <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-primary/65">
            Bluebird Motors
          </p>
          <h2 className="mt-0.5 text-[17px] font-bold tracking-tight text-primary">
            Price insight
          </h2>
        </div>
        <ChartLineUp size={25} className="ml-auto text-primary/60" aria-hidden="true" />
      </div>
      <div className="px-5 py-5">
        <div
          className={`inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-[12px] font-bold ring-1 ring-inset ${style.badge}`}
        >
          <span
            className="size-1.5 rounded-full"
            style={{ backgroundColor: style.color }}
            aria-hidden="true"
          />
          {style.label}
        </div>
        <p className="mt-3 text-[12px] leading-relaxed text-muted-foreground">
          {delta === 0 ? (
            "Asking price matches the estimate."
          ) : (
            <>
              <strong className="font-semibold text-foreground">{wholeDollars(delta)}</strong>{" "}
              {insight.differenceCents < 0 ? "below" : "above"} the estimated retail asking price.
            </>
          )}
        </p>
        <div
          className="mt-6"
          role="img"
          aria-label={`${style.label}. Asking price ${wholeDollars(insight.askingCents)}, estimated retail asking price ${wholeDollars(insight.estimateCents)}. The scale shows comparison bands, not a value range.`}
        >
          <div className="relative pt-7">
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
              className="grid h-3.5 grid-cols-3 gap-1 overflow-hidden rounded-full"
              aria-hidden="true"
            >
              <span className="bg-[#d66b60]" />
              <span className="bg-[#e8bf58]" />
              <span className="bg-[#49a887]" />
            </div>
          </div>
          <div
            className="mt-2 grid grid-cols-3 text-[10px] font-semibold text-muted-foreground"
            aria-hidden="true"
          >
            <span>Above</span>
            <span className="text-center">Near market</span>
            <span className="text-right">Below</span>
          </div>
        </div>
        <div className="mt-5 flex items-center justify-between gap-3 rounded-xl bg-secondary/55 px-3.5 py-3">
          <span className="max-w-36 text-[11px] leading-relaxed text-muted-foreground">
            Estimated retail
            <br />
            asking price
          </span>
          <strong className="text-[22px] tracking-tight text-primary">
            {wholeDollars(insight.estimateCents)}
          </strong>
        </div>
        <details className="group mt-4 text-[11px] leading-relaxed text-muted-foreground">
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
            Compares the asking price with an estimated retail asking price. “Near market” means
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
      <div className="border-t border-border/60 bg-secondary/25 px-5 py-3 text-[10px] leading-relaxed text-muted-foreground">
        <p>
          <span className="font-semibold text-primary">
            Data: {valuationProviderNames[insight.provider]}
          </span>{" "}
          · Comparison by Bluebird
        </p>
        <p className="mt-0.5">
          Checked{" "}
          {new Date(insight.updatedAt).toLocaleDateString("en-US", {
            month: "short",
            day: "numeric",
            timeZone: "America/Boise",
          })}
          {insight.dataThrough ? (
            <>
              {" "}
              · Market data through{" "}
              {new Date(insight.dataThrough).toLocaleDateString("en-US", {
                month: "short",
                day: "numeric",
                year: "numeric",
                timeZone: "America/Boise",
              })}
            </>
          ) : null}
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
