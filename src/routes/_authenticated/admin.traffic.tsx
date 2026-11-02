import type { ConversionRow } from "@/lib/conversion-funnel";
import { useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";

import {
  getTrafficSummary,
  getSeoReviewReports,
  saveSeoBaseline,
  type TrafficRow,
} from "@/lib/traffic.functions";

export const Route = createFileRoute("/_authenticated/admin/traffic")({
  head: () => ({
    meta: [
      { title: "Traffic and contacts — Bluebird Marketplace operations" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: TrafficPage,
});

const CHANNEL_LABELS: Record<string, string> = {
  search: "Search engines",
  ai: "AI assistants",
  social: "Social sites",
  referral: "Other websites",
  direct: "Direct or typed in",
  email: "Email",
  paid: "Paid ads",
  campaign: "Tagged campaign links",
  share: "Seller share links",
  unknown: "Before tracking started",
};

const METHOD_LABELS: Record<string, string> = {
  message: "Message",
  call: "Call",
  text: "Text",
  email: "Email",
  apply: "Applied on Bluebird",
  apply_external: "Applied on employer's site",
};

const WINDOWS = [7, 30, 90] as const;

function rate(part: number, whole: number) {
  return whole > 0 ? `${Math.round((part / whole) * 1000) / 10}%` : "—";
}

function TrafficTable({ rows, label }: { rows: TrafficRow[]; label: "channel" | "source" }) {
  if (!rows.length) {
    return <p className="mt-3 text-[13px] text-muted-foreground">No visits recorded yet.</p>;
  }
  return (
    <div className="mt-3 overflow-x-auto rounded-lg border border-border">
      <table className="w-full min-w-[640px] text-left text-[13px]">
        <thead className="bg-secondary/60 text-[11.5px] uppercase tracking-[0.06em] text-muted-foreground">
          <tr>
            <th className="px-3 py-2 font-semibold">
              {label === "channel" ? "Channel" : "Source"}
            </th>
            <th className="px-3 py-2 text-right font-semibold">Visits</th>
            <th className="px-3 py-2 text-right font-semibold">Listing views</th>
            <th className="px-3 py-2 text-right font-semibold">Contact actions</th>
            <th className="px-3 py-2 text-right font-semibold">Visits that contacted</th>
            <th className="px-3 py-2 text-right font-semibold">Contact rate</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={`${row.channel}-${row.source}`} className="border-t border-border">
              <td className="px-3 py-2">
                {label === "channel" ? (
                  (CHANNEL_LABELS[row.channel] ?? row.channel)
                ) : (
                  <>
                    <span className="font-medium">{row.source}</span>{" "}
                    <span className="text-muted-foreground">
                      · {CHANNEL_LABELS[row.channel] ?? row.channel}
                    </span>
                  </>
                )}
              </td>
              <td className="numeric px-3 py-2 text-right">{row.visits}</td>
              <td className="numeric px-3 py-2 text-right">{row.listingViews}</td>
              <td className="numeric px-3 py-2 text-right">{row.contacts}</td>
              <td className="numeric px-3 py-2 text-right">{row.contactingVisits}</td>
              <td className="numeric px-3 py-2 text-right">
                {rate(row.contactingVisits, row.visits)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function ConversionTable({ rows }: { rows: ConversionRow[] }) {
  return (
    <div className="mt-3 overflow-x-auto rounded-lg border border-border">
      <table className="w-full min-w-[980px] text-left text-xs">
        <thead className="bg-secondary/60">
          <tr>
            {[
              "Segment",
              "Visits",
              "Results viewed",
              "Zero results",
              "Listing viewed",
              "Contact after view",
              "Inquiry after contact",
              "Posting started",
              "Submission attempted",
              "Submission accepted",
            ].map((label) => (
              <th key={label} scope="col" className="px-3 py-2 font-semibold">
                {label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.segment} className="border-t border-border">
              <th scope="row" className="px-3 py-2 font-medium">
                {row.segment}
              </th>
              {[
                row.visits,
                row.searched,
                row.noResults,
                row.viewed,
                row.contactedAfterView,
                row.inquiriesAfterContact,
                row.postingStarts,
                row.submissionAttempts,
                row.submittedAfterAttempt,
              ].map((value, index) => (
                <td key={index} className="numeric px-3 py-2">
                  {value}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function TrafficPage() {
  const [windowDays, setWindowDays] = useState<number>(30);
  const fetchSummary = useServerFn(getTrafficSummary);
  const summary = useQuery({
    queryKey: ["admin-traffic", windowDays],
    queryFn: () => fetchSummary({ data: { windowDays } }),
  });
  const data = summary.data;
  const readReviews = useServerFn(getSeoReviewReports);
  const reviews = useQuery({
    queryKey: ["admin-seo-reviews"],
    queryFn: () => readReviews(),
    enabled: data?.isAdmin === true,
  });
  const saveBaseline = useServerFn(saveSeoBaseline);
  const baseline = useMutation({
    mutationFn: () => saveBaseline(),
    onSuccess: () => {
      void reviews.refetch();
    },
  });

  function downloadReport() {
    if (!data?.isAdmin) return;
    downloadSavedReport({ capturedAt: new Date().toISOString(), ...data });
  }
  function downloadSavedReport(report: unknown) {
    const url = URL.createObjectURL(
      new Blob([JSON.stringify(report, null, 2)], {
        type: "application/json",
      }),
    );
    const link = document.createElement("a");
    link.href = url;
    link.download = `bluebird-traffic-${new Date().toISOString().slice(0, 10)}.json`;
    link.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  return (
    <main className="mx-auto max-w-[1120px] px-4 py-10 sm:px-8">
      <Link to="/admin" className="text-[12px] text-muted-foreground hover:text-foreground">
        ← Operations console
      </Link>
      <div className="mt-3 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Traffic and contacts</h1>
          <p className="mt-1 max-w-[70ch] text-[13px] text-muted-foreground">
            Where visits come from, what buyers do, and how public pages perform.
          </p>
        </div>
        <div className="flex gap-1 rounded-full border border-border p-1" role="group">
          {WINDOWS.map((days) => (
            <button
              key={days}
              type="button"
              onClick={() => setWindowDays(days)}
              aria-pressed={windowDays === days}
              className={`h-8 rounded-full px-3 text-[12.5px] font-medium ${
                windowDays === days ? "bg-primary text-primary-foreground" : "hover:bg-secondary"
              }`}
            >
              {days} days
            </button>
          ))}
        </div>
      </div>

      {summary.isLoading ? (
        <p className="mt-8 text-[13px] text-muted-foreground">Loading…</p>
      ) : summary.error ? (
        <p className="mt-8 text-[13px] text-destructive">Could not load traffic.</p>
      ) : !data?.isAdmin ? (
        <p className="mt-8 text-[13px] text-muted-foreground">Administrators only.</p>
      ) : (
        <>
          <dl className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
            {[
              ["Visits", data.totals.visits],
              ["Listing views", data.totals.listingViews],
              ["Contact actions", data.totals.contacts],
              [
                "Visits that contacted",
                `${data.totals.contactingVisits} (${rate(data.totals.contactingVisits, data.totals.visits)})`,
              ],
            ].map(([label, value]) => (
              <div key={label} className="rounded-lg border border-border bg-card px-4 py-3">
                <dt className="text-[11.5px] text-muted-foreground">{label}</dt>
                <dd className="numeric mt-1 text-[22px] font-bold">{value}</dd>
              </div>
            ))}
          </dl>

          <section className="mt-8">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h2 className="text-[17px] font-semibold">Completed actions</h2>
              <button
                type="button"
                onClick={downloadReport}
                className="min-h-10 rounded-full border border-input px-4 text-sm"
              >
                Download report
              </button>
            </div>
            <dl className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3">
              {[
                ["Inquiries sent", data.conversions.inquiriesSent],
                ["Listings saved", data.conversions.saveActions],
                ["Listings submitted", data.conversions.listingsSubmitted],
                ["Listing records approved", data.operations.approvedListings ?? "Unavailable"],
                ["Seller agreements completed", data.operations.sellerSetups ?? "Unavailable"],
                ["Sellers claimed", data.operations.claimedSellers ?? "Unavailable"],
              ].map(([label, value]) => (
                <div key={label} className="rounded-lg border border-border px-4 py-3">
                  <dt className="text-xs text-muted-foreground">{label}</dt>
                  <dd className="mt-1 text-xl font-semibold">{value}</dd>
                </div>
              ))}
            </dl>
            <p className="mt-3 max-w-[85ch] text-xs leading-relaxed text-muted-foreground">
              A sent inquiry is a message or application acknowledged by Bluebird. Call, text,
              email, and external application buttons record contact actions; they cannot confirm
              delivery. Inquiry tracking starts with this release. Approval, agreement, and claim
              counts come from saved marketplace records in this period and include
              operator-assisted activity.
            </p>
          </section>

          <section
            className="mt-10 rounded-xl border border-border p-5"
            aria-label="Saved SEO reviews"
          >
            <h2 className="text-[17px] font-semibold">Weekly and monthly SEO reviews</h2>
            <p className="mt-2 max-w-[90ch] text-xs leading-relaxed text-muted-foreground">
              Weekly reports save after 9am Boise time on Mondays; calendar-month reports save on
              the first. They cover completed UTC periods, exclude marked internal traffic, and
              remain private to administrators. Search Console indexing and keyword impressions are
              reviewed alongside these reports.
            </p>
            <button
              type="button"
              onClick={() => baseline.mutate()}
              disabled={baseline.isPending}
              className="mt-4 min-h-10 rounded-full border border-input px-4 text-sm disabled:opacity-50"
            >
              {baseline.isPending ? "Saving…" : "Save current 7-day baseline"}
            </button>
            {(baseline.error || reviews.error) && (
              <p className="mt-3 text-sm text-destructive">
                Saved SEO reviews are temporarily unavailable. Current traffic data is still shown
                below.
              </p>
            )}
            {baseline.isSuccess && (
              <p className="mt-3 text-sm">Baseline saved or already available for today.</p>
            )}
            <ul className="mt-4 space-y-3">
              {(reviews.data || []).map((report) => (
                <li
                  key={report.review}
                  className="flex flex-wrap items-center justify-between gap-3 border-t border-border pt-3 text-sm"
                >
                  <span>
                    <strong>{report.review}</strong>
                    <br />
                    {report.period.since.slice(0, 10)} to {report.period.until.slice(0, 10)} UTC ·{" "}
                    {report.funnel.organic.visits} organic visits ·{" "}
                    {report.funnel.organic.contactedAfterView} contacted after a view
                  </span>
                  <button
                    type="button"
                    onClick={() => downloadSavedReport(report)}
                    className="min-h-10 rounded-full border border-input px-4 text-xs"
                  >
                    Download saved report
                  </button>
                </li>
              ))}
            </ul>
          </section>

          <section className="mt-10">
            <h2 className="text-[17px] font-semibold">Observed visit progression</h2>
            <p className="mt-2 max-w-[90ch] text-xs leading-relaxed text-muted-foreground">
              Each column counts distinct recorded visits, not people or sales. Contact must follow
              a listing view; an inquiry must follow contact; an accepted submission must follow an
              attempt. These actions can involve different listings in the same visit. Results and
              zero-result views are separate signals, not required steps for a direct listing
              visitor.
            </p>
            <ConversionTable rows={[data.funnel.totals]} />
            <h3 className="mt-5 text-sm font-semibold">Organic search progression</h3>
            <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
              Search-engine visits only. Paid ads, AI referrals and direct visits are reported
              separately. Posting starts mean the listing form opened after seller setup; submission
              attempts are a later action. Older visits have no posting-start event.
            </p>
            <ConversionTable rows={[data.funnel.organic]} />
            <h3 className="mt-5 text-sm font-semibold">Organic landing pages</h3>
            <ConversionTable rows={data.funnel.byOrganicLandingPage} />
            <h3 className="mt-5 text-sm font-semibold">By acquisition channel</h3>
            <ConversionTable
              rows={data.funnel.byChannel.map((row) => ({
                ...row,
                segment: CHANNEL_LABELS[row.segment] ?? row.segment,
              }))}
            />
            <h3 className="mt-5 text-sm font-semibold">By screen size</h3>
            <ConversionTable rows={data.funnel.byDevice} />
            <h3 className="mt-5 text-sm font-semibold">By landing template</h3>
            <ConversionTable rows={data.funnel.byLandingTemplate} />
            <p className="mt-3 max-w-[90ch] text-xs leading-relaxed text-muted-foreground">
              Older visits may have unknown screen size. This report excludes{" "}
              {data.funnel.visitsWithoutStart} visits without a recorded start in this period,{" "}
              {data.funnel.eventsWithoutVisit} events without a visit ID, and{" "}
              {data.funnel.eventsWithoutTime} events without usable timing. Delivery outside
              Bluebird cannot be confirmed. Small samples are descriptive, not evidence that a
              design change improved conversion.
            </p>
          </section>

          <section className="mt-10">
            <h2 className="text-[17px] font-semibold">Articles to classifieds</h2>
            <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
              Attributed actions follow an article button in the same browser session for up to two
              hours. A contact action is distinct from a completed inquiry.
            </p>
            {data.editorial.length ? (
              <div className="mt-3 overflow-x-auto rounded-lg border border-border">
                <table className="w-full min-w-[800px] text-left text-xs">
                  <thead className="bg-secondary/60">
                    <tr>
                      {[
                        "Article",
                        "Reads",
                        "CTA clicks",
                        "Clicking visits",
                        "Listing views",
                        "Contacts",
                        "Inquiries",
                        "Posting starts",
                        "Submissions",
                      ].map((label) => (
                        <th scope="col" key={label} className="px-3 py-2">
                          {label}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {data.editorial.map((row) => (
                      <tr key={row.article} className="border-t border-border">
                        <th scope="row" className="px-3 py-2 font-medium">
                          {row.article}
                        </th>
                        {[
                          row.views,
                          row.clicks,
                          row.clickingVisits,
                          row.listingViews,
                          row.contacts,
                          row.inquiries,
                          row.postingStarts,
                          row.submissions,
                        ].map((value, index) => (
                          <td key={index} className="px-3 py-2">
                            {value}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="mt-3 text-sm text-muted-foreground">
                No eligible article activity recorded in this period yet.
              </p>
            )}
          </section>

          <section className="mt-10">
            <h2 className="text-[17px] font-semibold">Real-user page performance</h2>
            <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
              First-party measurements at the 75th percentile, grouped by the template where a full
              page load began and its screen size. These are separate from Google’s Core Web Vitals
              report. Small samples remain provisional.
            </p>
            {data.vitals.length ? (
              <div className="mt-3 overflow-x-auto rounded-lg border border-border">
                <table className="w-full min-w-[620px] text-left text-sm">
                  <thead className="bg-secondary/60">
                    <tr>
                      {[
                        "Page template",
                        "Screen",
                        "Metric",
                        "75th percentile",
                        "Samples",
                        "Assessment",
                      ].map((label) => (
                        <th key={label} className="px-3 py-2 font-semibold">
                          {label}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {data.vitals.map((metric) => (
                      <tr
                        key={`${metric.template}-${metric.device}-${metric.metric}`}
                        className="border-t border-border"
                      >
                        <td className="px-3 py-2">{metric.template}</td>
                        <td className="px-3 py-2">{metric.device}</td>
                        <td className="px-3 py-2">{metric.metric}</td>
                        <td className="numeric px-3 py-2">
                          {metric.unit === "score"
                            ? metric.p75.toFixed(3)
                            : `${Math.round(metric.p75)} ms`}
                        </td>
                        <td className="numeric px-3 py-2">{metric.samples}</td>
                        <td className="px-3 py-2">
                          {metric.samples < 20
                            ? "Early sample"
                            : metric.rating.replaceAll("-", " ")}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="mt-3 text-sm text-muted-foreground">
                Collecting measurements from public page visits. No real-user sample is available
                yet.
              </p>
            )}
          </section>

          <section className="mt-10">
            <h2 className="text-[17px] font-semibold">By channel</h2>
            <TrafficTable rows={data.byChannel} label="channel" />
          </section>

          <section className="mt-10">
            <h2 className="text-[17px] font-semibold">By source</h2>
            <TrafficTable rows={data.bySource} label="source" />
          </section>

          <div className="mt-10 grid gap-8 lg:grid-cols-2">
            <section>
              <h2 className="text-[17px] font-semibold">How buyers made contact</h2>
              {data.contactMethods.length ? (
                <ul className="mt-3 divide-y divide-border rounded-lg border border-border text-[13px]">
                  {data.contactMethods.map((item) => (
                    <li key={item.method} className="flex justify-between px-3 py-2">
                      <span>{METHOD_LABELS[item.method] ?? item.method}</span>
                      <span className="numeric font-medium">{item.count}</span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="mt-3 text-[13px] text-muted-foreground">No contacts yet.</p>
              )}
            </section>
            <section>
              <h2 className="text-[17px] font-semibold">Top landing pages</h2>
              {data.topLandingPages.length ? (
                <ul className="mt-3 divide-y divide-border rounded-lg border border-border text-[13px]">
                  {data.topLandingPages.map((page) => (
                    <li key={page.path} className="flex justify-between gap-3 px-3 py-2">
                      <span className="min-w-0 truncate">{page.path}</span>
                      <span className="numeric shrink-0 text-muted-foreground">
                        {page.visits} visits · {page.fromSearchOrAi} from search or AI
                      </span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="mt-3 text-[13px] text-muted-foreground">No visits recorded yet.</p>
              )}
            </section>
          </div>

          <p className="mt-10 text-[12px] leading-relaxed text-muted-foreground">
            A visit is one browser tab session, classified on its first page from the referring site
            or utm_ tags; only the referring domain is stored. Demo listings and signed-in staff
            accounts, marked QA visits, and recognized automated browsers are excluded. Anonymous
            events in a visit that later signs in as staff are excluded too; unmarked signed-out
            staff browsing can still be counted. Some apps and browsers hide the referrer, so part
            of &ldquo;Direct&rdquo; is really from elsewhere.
          </p>
        </>
      )}
    </main>
  );
}
