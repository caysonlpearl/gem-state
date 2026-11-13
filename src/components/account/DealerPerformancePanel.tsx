import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Link } from "@tanstack/react-router";
import {
  getMyDealerPerformance,
  getDealerPerformancePreview,
} from "@/lib/dealer-performance.functions";
import type { DealerPerformanceReport } from "@/lib/dealer-performance";

export function DealerPerformancePanel({
  dealerId,
  preview = false,
}: {
  dealerId: string;
  preview?: boolean;
}) {
  const [days, setDays] = useState<7 | 30 | 90>(30);
  const ownReport = useServerFn(getMyDealerPerformance);
  const previewReport = useServerFn(getDealerPerformancePreview);
  const query = useQuery({
    queryKey: ["dealer-performance", preview, dealerId, days],
    queryFn: () => (preview ? previewReport : ownReport)({ data: { dealerId, days } }),
    staleTime: 60_000,
    retry: 1,
  });
  return (
    <section className="space-y-5" aria-label="Dealership performance">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="text-xl font-semibold">Performance</h3>
          <p className="mt-1 text-xs text-muted-foreground">
            Your dealership and vehicle activity on Bluebird.
          </p>
        </div>
        <div
          className="flex gap-1 rounded-full border border-border p-1"
          aria-label="Performance period"
        >
          {([7, 30, 90] as const).map((value) => (
            <button
              key={value}
              type="button"
              aria-pressed={days === value}
              onClick={() => setDays(value)}
              className={`rounded-full px-3 py-2 text-xs ${days === value ? "bg-primary text-primary-foreground" : "hover:bg-secondary"}`}
            >
              {value} days
            </button>
          ))}
        </div>
      </div>
      {query.isPending ? (
        <p role="status" className="text-sm text-muted-foreground">
          Loading your performance…
        </p>
      ) : query.error ? (
        <div role="alert" className="text-sm">
          <p>Could not load performance.</p>
          <button
            type="button"
            onClick={() => query.refetch()}
            className="mt-2 font-semibold text-primary underline"
          >
            Try again
          </button>
        </div>
      ) : query.data ? (
        <DealerPerformanceView report={query.data} />
      ) : null}
    </section>
  );
}

export function DealerPerformanceView({ report }: { report: DealerPerformanceReport }) {
  const row = report.business;
  if (!row)
    return (
      <p className="text-sm text-muted-foreground">
        No tracked dealership activity is available yet.
      </p>
    );
  return (
    <div className="space-y-5">
      <dl className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        {[
          ["Listing views", row.listingViews],
          ["Listing clicks", row.listingClicks],
          ["Dealership views", row.profileViews],
          ["Visitor estimate", row.uniqueBrowsers],
          ["Saved vehicles", row.saves],
          ["Buyer inquiries", row.inquiries],
          ["Call clicks", row.calls],
          ["Email clicks", row.emails],
          ["Website clicks", row.websiteClicks],
          ["Directions", row.directions],
          ["Text clicks", row.texts],
          ["Active listings", row.activeListings ?? 0],
        ].map(([label, value]) => (
          <div key={label} className="rounded-xl border border-border bg-card p-4">
            <dt className="text-xs text-muted-foreground">{label}</dt>
            <dd className="mt-1 text-2xl font-bold tabular-nums">
              {Number(value).toLocaleString()}
            </dd>
          </div>
        ))}
      </dl>
      <p className="text-xs leading-relaxed text-muted-foreground">
        Staff, recognized bots, testing, and your dealership’s own recorded activity are filtered.
        Visitors are browser estimates. Views count once per listing per session. Contact clicks are
        not completed calls or sales. Tracking began{" "}
        {new Date(report.trackingStartedAt).toLocaleDateString("en-US")}.
      </p>
      <div className="overflow-x-auto rounded-xl border border-border">
        <table className="w-full min-w-[550px] text-left text-xs">
          <caption className="px-4 py-3 text-left text-sm font-semibold">
            Vehicle performance
          </caption>
          <thead className="bg-secondary/50">
            <tr>
              {["Vehicle", "Views", "Clicks", "Saves", "Messages", "Contact clicks"].map(
                (label) => (
                  <th key={label} className="px-3 py-3 font-semibold">
                    {label}
                  </th>
                ),
              )}
            </tr>
          </thead>
          <tbody>
            {row.listings.map((listing) => (
              <tr key={listing.id} className="border-t border-border">
                <td className="px-3 py-3">
                  {listing.active ? (
                    <Link
                      to="/listings/$listingId"
                      params={{ listingId: listing.id }}
                      className="font-semibold text-primary hover:underline"
                    >
                      {listing.title}
                    </Link>
                  ) : (
                    <span>
                      {listing.title}{" "}
                      <span className="text-muted-foreground">· no longer active</span>
                    </span>
                  )}
                </td>
                {[
                  listing.listingViews,
                  listing.listingClicks,
                  listing.saves,
                  listing.inquiries,
                  listing.calls + listing.texts + listing.emails + listing.websiteClicks,
                ].map((value, index) => (
                  <td key={index} className="px-3 py-3 tabular-nums">
                    {value}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
        {!row.listings.length ? (
          <p className="p-4 text-sm text-muted-foreground">
            Your vehicles and their activity will appear here.
          </p>
        ) : null}
      </div>
      {row.daily.length ? (
        <details className="rounded-xl border border-border p-4">
          <summary className="cursor-pointer text-sm font-semibold">Daily activity</summary>
          <div className="mt-3 max-h-80 overflow-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr>
                  {["Date", "Listing views", "Dealership views", "Messages"].map((label) => (
                    <th key={label} className="py-2">
                      {label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {row.daily.map((day) => (
                  <tr key={day.date} className="border-t border-border">
                    <td className="py-2">{day.date}</td>
                    <td>{day.listingViews}</td>
                    <td>{day.profileViews}</td>
                    <td>{day.inquiries}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </details>
      ) : null}
    </div>
  );
}
