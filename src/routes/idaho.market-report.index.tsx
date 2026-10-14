import { createFileRoute, redirect } from "@tanstack/react-router";

import { reportMonthOf } from "@/lib/market-stats";

// /idaho/market-report always means this month's report, which lives at its
// own permanent URL; send visitors there so one page holds the content.
export const Route = createFileRoute("/idaho/market-report/")({
  beforeLoad: () => {
    throw redirect({
      to: "/idaho/market-report/$month",
      params: { month: reportMonthOf(new Date()) },
      statusCode: 302,
    });
  },
});
