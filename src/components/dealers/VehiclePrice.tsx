import { formatClassifiedPrice } from "@/lib/classifieds-display";
import { vehiclePriceComparison } from "@/lib/vehicle-shopping";

export function VehiclePrice({
  listing,
  compact = false,
  inlineComparison = false,
}: {
  listing: Parameters<typeof vehiclePriceComparison>[0];
  compact?: boolean;
  inlineComparison?: boolean;
}) {
  const comparison = vehiclePriceComparison(listing);
  const money = (cents: number) => formatClassifiedPrice(cents, { wholeDollars: true });
  return (
    <div
      className={
        inlineComparison
          ? "flex flex-wrap items-center gap-x-4 gap-y-2"
          : compact
            ? "space-y-1"
            : "space-y-2"
      }
    >
      <p
        className={`numeric font-bold leading-none tracking-tight text-primary ${compact ? "text-[22px]" : "text-[38px] sm:text-[44px]"}`}
      >
        {money(listing.priceCents)}
      </p>
      {comparison ? (
        <div
          className={`flex flex-wrap items-center gap-x-3 gap-y-1 ${compact ? "text-[10.5px]" : "text-[12px]"}`}
        >
          <span className="text-muted-foreground">
            {comparison.label} <s>{money(comparison.cents)}</s>
          </span>
          <span className="rounded-full bg-emerald-50 px-2 py-1 font-semibold text-emerald-800">
            {money(comparison.savingsCents)} below{" "}
            {comparison.label === "MSRP" ? "MSRP" : "previous price"}
          </span>
        </div>
      ) : null}
    </div>
  );
}
