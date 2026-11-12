import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState, type ReactNode } from "react";
import { getVehiclePriceInsight } from "@/lib/vehicle-price-insights.functions";
import type { VehiclePriceInsight as Insight } from "@/lib/vehicle-price-insights";

const wholeDollars = (cents: number) =>
  new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(cents / 100);

const comparisonStyle = {
  above: { label: "Above market", pill: "bg-[#fbe8e5] text-[#9b302b]" },
  near: { label: "Fair price", pill: "bg-[#fbf0d0] text-[#78520b]" },
  below: { label: "Below market", pill: "bg-[#e4f3e9] text-[#256845]" },
} as const;

const roundHundred = (cents: number) => wholeDollars(Math.round(cents / 10000) * 10000);
const sealPoints = Array.from({ length: 24 }, (_, index) => {
  const angle = ((index * 15 - 90) * Math.PI) / 180;
  const radius = index % 2 === 0 ? 44 : 39;
  return `${50 + Math.cos(angle) * radius},${50 + Math.sin(angle) * radius}`;
}).join(" ");

export function VehiclePriceInsightCard({ insight }: { insight: Insight }) {
  const style = comparisonStyle[insight.comparison];
  const percent = (Math.abs(insight.differenceCents) / insight.estimateCents) * 100;
  const delta =
    insight.differenceCents === 0
      ? "At the estimate"
      : `${percent < 0.5 ? "<1" : Math.round(percent)}% ${insight.differenceCents < 0 ? "below" : "above"} estimate`;
  const pointer = 100 - insight.pointerPercent;
  const date = new Date(insight.updatedAt);
  const checked = Number.isFinite(date.getTime())
    ? date.toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
        timeZone: "America/Boise",
      })
    : null;
  const inputs = new Set(insight.providerInputs ?? []);
  const method =
    insight.provider === "vehicles"
      ? `Compares the asking price with a market model estimate using this vehicle’s year, make, model${inputs.has("trim") ? ", trim" : ""}, mileage, condition and state. Near market means within ${Math.round(insight.tolerancePct)}% of the estimate. It estimates retail asking prices, rather than completed sale prices.`
      : `Compares the asking price with a VIN- and mileage-based retail estimate. Near market means within ${Math.round(insight.tolerancePct)}% of the estimate.`;
  return (
    <PriceAdvisorFrame checked={checked} method={method}>
      <div className="px-5 pb-5 pt-4">
        <p className="text-[12px] font-semibold uppercase leading-[18px] tracking-[0.07em] text-[#5b626e]">
          Estimated market value
        </p>
        <div className="mt-1 grid grid-cols-[minmax(0,1fr)_auto] items-start gap-2">
          <p className="text-[36px] font-bold leading-[42px] tracking-[-0.035em] text-[#16223c] tabular-nums">
            {roundHundred(insight.estimateCents)}
          </p>
          <div className="pt-0.5 text-right">
            <p
              aria-label={`Price rating: ${style.label}, ${delta}`}
              className={`inline-block rounded-full px-3 py-1 text-[14px] font-bold leading-5 ${style.pill}`}
            >
              {style.label}
            </p>
            <p className="mt-1.5 whitespace-nowrap text-[12px] leading-[18px] text-[#5b626e]">
              {delta}
            </p>
          </div>
        </div>
        <div
          className="mt-5"
          role="img"
          aria-label={`${style.label}. Asking ${wholeDollars(insight.askingCents)}, ${delta}. Below market is green, near market is gold, above market is red.`}
        >
          <div className="relative pt-8">
            <span
              className="absolute top-0 -translate-x-1/2 whitespace-nowrap text-[14px] font-bold leading-5 text-[#18243b]"
              style={{ left: `clamp(56px, ${pointer}%, calc(100% - 56px))` }}
              aria-hidden="true"
            >
              Asking {wholeDollars(insight.askingCents)}
            </span>
            <svg
              viewBox="0 0 20 12"
              className="absolute top-[21px] h-2.5 w-4 -translate-x-1/2 fill-[#18243b]"
              style={{ left: `${pointer}%` }}
              aria-hidden="true"
            >
              <path d="M1 1h18L10 11z" />
            </svg>
            <div
              className="grid h-3 grid-cols-3 gap-0.5 overflow-hidden rounded-full"
              aria-hidden="true"
            >
              <span className="bg-[#329b6d]" />
              <span className="bg-[#e4b437]" />
              <span className="bg-[#cb433c]" />
            </div>
          </div>
          <div
            className="mt-2 grid grid-cols-3 text-[12px] leading-[18px] text-[#5b626e]"
            aria-hidden="true"
          >
            <span className={insight.comparison === "below" ? "font-bold text-[#18243b]" : ""}>
              Below market
            </span>
            <span
              className={`text-center ${insight.comparison === "near" ? "font-bold text-[#18243b]" : ""}`}
            >
              Near market
            </span>
            <span
              className={`text-right ${insight.comparison === "above" ? "font-bold text-[#18243b]" : ""}`}
            >
              Above market
            </span>
          </div>
        </div>
      </div>
    </PriceAdvisorFrame>
  );
}

function PriceAdvisorFrame({
  children,
  checked,
  method,
}: {
  children: ReactNode;
  checked: string | null;
  method: string;
}) {
  return (
    <section
      className="relative rounded-[18px] border border-[#d8d5ce] bg-white text-[#18243b] shadow-[0_8px_24px_rgba(24,36,59,0.07)]"
      style={{ fontFamily: "Arial, Helvetica, sans-serif", fontFeatureSettings: "normal" }}
      aria-label="Vehicle price insight"
    >
      <div className="overflow-hidden rounded-[17px]">
        <header className="flex items-center gap-2.5 bg-[#59cafa] px-4 py-3.5 pr-10">
          <img
            src="/images/brand/bluebird-error-bird.webp"
            alt=""
            aria-hidden="true"
            className="size-9 shrink-0 object-contain"
            width={36}
            height={36}
          />
          <h2
            className="text-[16px] leading-5 tracking-[-0.025em] text-[#123247]"
            style={{ fontFamily: '"Manrope Variable", "Manrope", Arial, sans-serif' }}
          >
            <span className="font-extrabold">Bluebird</span>{" "}
            <span className="font-medium">Price Advisor</span>
          </h2>
        </header>
        {children}
        <footer className="border-t border-[#dedbd4] bg-[#f7f4ee] px-5 py-3.5 text-[12px] leading-[18px] text-[#5b626e]">
          <p>Estimated retail asking price.</p>
          <details className="mt-1">
            <summary className="flex cursor-pointer list-none flex-wrap items-center gap-x-2 gap-y-1">
              {checked ? <span className="whitespace-nowrap">Checked {checked}.</span> : null}
              <span className="font-semibold text-[#175779] underline underline-offset-2">
                How it’s calculated
              </span>
            </summary>
            <p className="mt-2">{method}</p>
          </details>
        </footer>
      </div>
      <svg
        viewBox="0 0 100 100"
        className="pointer-events-none absolute -right-3 -top-4 h-[60px] w-[60px] drop-shadow-[0_2px_3px_rgba(0,0,0,0.16)]"
        aria-hidden="true"
      >
        <polygon
          points={sealPoints}
          fill="#17263f"
          stroke="white"
          strokeWidth="4"
          strokeLinejoin="round"
        />
        <circle cx="50" cy="50" r="31" fill="none" stroke="#c9aa60" strokeWidth="2" />
        <path
          d="M34 50L45 61L67 37"
          fill="none"
          stroke="#f5e3ad"
          strokeWidth="6"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
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
  if (!query.data) return null;
  if ("status" in query.data) {
    const serviceUnavailable = query.data.reason === "service_unavailable";
    return (
      <PriceAdvisorFrame
        checked={null}
        method="Uses vehicle details and market pricing data. An estimate is shown only when the data passes our checks."
      >
        <div className="px-5 py-5">
          <p className="text-[20px] font-semibold leading-7 text-[#16223c]">
            {serviceUnavailable ? "Price estimates unavailable" : "Estimate unavailable"}
          </p>
          <p className="mt-2 text-[13px] leading-5 text-[#5b626e]">
            {serviceUnavailable
              ? "Price estimates are temporarily unavailable. Please check again later."
              : "A reliable price estimate isn’t available for this vehicle right now."}
          </p>
        </div>
      </PriceAdvisorFrame>
    );
  }
  return <VehiclePriceInsightCard insight={query.data} />;
}
