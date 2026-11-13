import type { VehiclePriceInsight as Insight } from "@/lib/vehicle-price-insights";
import type { ReactNode } from "react";
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
  const band = insight.tolerancePct / 100;
  const rangeLow = Math.floor((insight.estimateCents * (1 - band)) / 10000) * 10000;
  const rangeHigh = Math.ceil((insight.estimateCents * (1 + band)) / 10000) * 10000;
  const inputs = new Set(insight.providerInputs ?? []);
  const method =
    insight.provider === "vehicles"
      ? `Compares the asking price with a market model estimate using this vehicle’s year, make, model${inputs.has("trim") ? ", trim" : ""}, mileage, condition and state. Near market means within ${Math.round(insight.tolerancePct)}% of the estimate. It estimates retail asking prices, rather than completed sale prices.`
      : `Compares the asking price with a VIN- and mileage-based retail estimate. Near market means within ${Math.round(insight.tolerancePct)}% of the estimate.`;
  const rangeMethod = `${method} The fair price range is Bluebird’s near-market band around that estimate (±${Math.round(insight.tolerancePct)}%), rounded outward to the nearest $100. It is a comparison guide, not a statistical confidence interval.`;
  return (
    <PriceAdvisorFrame method={rangeMethod}>
      <div className="px-5 pb-5 pt-4">
        <p className="text-[12px] font-semibold uppercase leading-[18px] tracking-[0.07em] text-[#5b626e]">
          Fair price range
        </p>
        <div className="mt-1">
          <p className="whitespace-nowrap text-[28px] font-bold leading-[36px] tracking-[-0.035em] text-[#16223c] tabular-nums">
            {wholeDollars(rangeLow)} – {wholeDollars(rangeHigh)}
          </p>
          <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1">
            <p
              aria-label={`Price rating: ${style.label}, ${delta}`}
              className={`inline-block rounded-full px-3 py-1 text-[14px] font-bold leading-5 ${style.pill}`}
            >
              {style.label}
            </p>
            <p className="whitespace-nowrap text-[12px] leading-[18px] text-[#5b626e]">{delta}</p>
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

function PriceAdvisorFrame({ children, method }: { children: ReactNode; method: string }) {
  return (
    <section
      className="relative rounded-[18px] border border-[#d8d5ce] bg-white text-[#18243b] shadow-[0_8px_24px_rgba(24,36,59,0.07)]"
      style={{ fontFamily: "Arial, Helvetica, sans-serif", fontFeatureSettings: "normal" }}
      aria-label="Vehicle price insight"
    >
      <div className="overflow-hidden rounded-[17px]">
        <header className="flex items-center gap-2.5 bg-[#0874bd] px-4 py-2.5 pr-10">
          <img
            src="/images/brand/bluebird-error-bird.webp"
            alt=""
            aria-hidden="true"
            className="size-11 shrink-0 object-contain"
            width={44}
            height={44}
          />
          <h2
            className="text-[16px] leading-5 tracking-[-0.025em] text-white"
            style={{ fontFamily: '"Manrope Variable", "Manrope", Arial, sans-serif' }}
          >
            <span className="font-extrabold">Bluebird</span>{" "}
            <span className="font-medium">Price Advisor</span>
          </h2>
        </header>
        {children}
        <footer className="border-t border-[#dedbd4] bg-[#f7f4ee] px-5 py-3.5 text-[12px] leading-[18px] text-[#5b626e]">
          <details>
            <summary className="flex cursor-pointer list-none flex-wrap items-center gap-x-2 gap-y-1">
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

export function VehiclePriceInsightView({
  value,
}: {
  value: Insight | { status: "unavailable"; reason: string } | null | undefined;
}) {
  if (!value) return null;
  if ("status" in value) {
    const serviceUnavailable = value.reason === "service_unavailable";
    return (
      <PriceAdvisorFrame method="Uses vehicle details and market pricing data. An estimate is shown only when the data passes our checks.">
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
  return <VehiclePriceInsightCard insight={value} />;
}
