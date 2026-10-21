import { createFileRoute, notFound } from "@tanstack/react-router";
import { useSuspenseQuery } from "@tanstack/react-query";

import { MarketReport } from "@/components/classifieds/MarketReport";
import { marketReportHead, marketReportQuery } from "@/lib/market-report-route";

// /idaho/market-report/2026-10: one month's report, kept at its own URL.
export const Route = createFileRoute("/idaho/market-report/$month")({
  loader: async ({ context, params }) => {
    const data = await context.queryClient.ensureQueryData(marketReportQuery(params.month));
    if (!data) throw notFound();
    return data;
  },
  head: ({ loaderData }) => marketReportHead(loaderData),
  component: MonthReportRoute,
});

function MonthReportRoute() {
  const { month } = Route.useParams();
  const { data } = useSuspenseQuery(marketReportQuery(month));
  return data ? <MarketReport page={data} /> : null;
}
