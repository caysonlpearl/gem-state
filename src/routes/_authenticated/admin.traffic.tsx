import { useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";

import { getTrafficSummary, type TrafficRow } from "@/lib/traffic.functions";

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
            <th className="px-3 py-2 text-right font-semibold">Contacts</th>
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

function TrafficPage() {
  const [windowDays, setWindowDays] = useState<number>(30);
  const fetchSummary = useServerFn(getTrafficSummary);
  const summary = useQuery({
    queryKey: ["admin-traffic", windowDays],
    queryFn: () => fetchSummary({ data: { windowDays } }),
  });
  const data = summary.data;

  return (
    <main className="mx-auto max-w-[1120px] px-4 py-10 sm:px-8">
      <Link to="/admin" className="text-[12px] text-muted-foreground hover:text-foreground">
        ← Operations console
      </Link>
      <div className="mt-3 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Traffic and contacts</h1>
          <p className="mt-1 max-w-[70ch] text-[13px] text-muted-foreground">
            Where visits come from, and how many of them view a listing or contact a seller.
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
              ["Contacts", data.totals.contacts],
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
            accounts are excluded, but staff browsing while signed out can&apos;t be told apart.
            Some apps and browsers hide the referrer, so part of &ldquo;Direct&rdquo; is really from
            elsewhere.
          </p>
        </>
      )}
    </main>
  );
}
