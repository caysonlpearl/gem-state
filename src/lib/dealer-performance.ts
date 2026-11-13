import type { BusinessPerformanceRow } from "./business-performance";
export type DealerPerformanceBusiness = Omit<
  BusinessPerformanceRow,
  "conversionPercent" | "modeledSales"
>;
export type DealerPerformanceReport = {
  period: { since: string; until: string; days: number };
  trackingStartedAt: string;
  business: DealerPerformanceBusiness | null;
};

/** Only the authorized dealership leaves the server; internal sales assumptions stay private. */
export function dealerPerformanceView(
  report: {
    period: DealerPerformanceReport["period"];
    trackingStartedAt: string;
    businesses: BusinessPerformanceRow[];
  },
  slug: string,
): DealerPerformanceReport {
  const row = report.businesses.find(
    (business) => business.key === `dealer:${slug}` && business.dealerSlug === slug,
  );
  if (!row)
    return { period: report.period, trackingStartedAt: report.trackingStartedAt, business: null };
  const { conversionPercent: _conversion, modeledSales: _sales, ...business } = row;
  return { period: report.period, trackingStartedAt: report.trackingStartedAt, business };
}
