import { useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  getBusinessPerformance,
  saveBusinessSalesAssumption,
} from "@/lib/business-performance.functions";
import {
  businessDate,
  businessPerformanceCsv,
  type BusinessPerformanceRow,
} from "@/lib/business-performance";

export const Route = createFileRoute("/_authenticated/admin/business-performance")({
  validateSearch: (
    input: Record<string, unknown>,
  ): { business?: string; dealer?: string; days?: 7 | 30 | 90 } => ({
    ...(typeof input.business === "string" && input.business.length <= 300
      ? { business: input.business }
      : {}),
    ...(typeof input.dealer === "string" && /^[a-z0-9-]{1,80}$/.test(input.dealer)
      ? { dealer: input.dealer }
      : {}),
    ...([7, 30, 90].includes(Number(input.days))
      ? { days: Number(input.days) as 7 | 30 | 90 }
      : {}),
  }),
  head: () => ({
    meta: [
      { title: "Business performance — Bluebird operations" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: BusinessPerformancePage,
});
const number = (value: number | null) => (value == null ? "—" : value.toLocaleString());
function Stat({ label, value, note }: { label: string; value: number | null; note?: string }) {
  return (
    <div className="rounded-2xl border border-border bg-card p-5">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-2 text-3xl font-semibold tabular-nums">{number(value)}</p>
      {note ? <p className="mt-2 text-xs leading-relaxed text-muted-foreground">{note}</p> : null}
    </div>
  );
}
function SalesModel({ row }: { row: BusinessPerformanceRow }) {
  const save = useServerFn(saveBusinessSalesAssumption);
  const cache = useQueryClient();
  const [value, setValue] = useState(
    row.conversionPercent == null ? "" : String(row.conversionPercent),
  );
  const mutation = useMutation({
    mutationFn: () =>
      save({
        data: {
          businessKey: row.key,
          conversionPercent: value.trim() === "" ? null : Number(value),
        },
      }),
    onSuccess: () => cache.invalidateQueries({ queryKey: ["business-performance"] }),
  });
  return (
    <section className="rounded-2xl border border-border bg-secondary/30 p-5">
      <div className="flex flex-wrap items-start justify-between gap-5">
        <div className="max-w-2xl">
          <h3 className="text-base font-semibold">Sales model · Assumption only</h3>
          <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
            Purchases at the dealership are not verified by Bluebird. A removed vehicle is not
            counted as a sale. Enter a conversion assumption to model sales from unique browsers who
            clicked through, tapped a contact option, or submitted an inquiry.
          </p>
        </div>
        <div>
          <p className="text-xs text-muted-foreground">Modeled sales</p>
          <p className="mt-1 text-3xl font-semibold">
            {row.modeledSales == null
              ? "Not estimated"
              : "~" + row.modeledSales.toLocaleString(undefined, { maximumFractionDigits: 2 })}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            {number(row.interestedBrowsers)} interested browsers{" "}
            {row.conversionPercent == null ? "· no assumption set" : `× ${row.conversionPercent}%`}
          </p>
        </div>
      </div>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          mutation.mutate();
        }}
        className="mt-5 flex flex-wrap items-end gap-3"
      >
        <label className="text-xs font-medium">
          Assumed browser-to-sale conversion (%)
          <input
            type="number"
            min="0"
            max="100"
            step="0.01"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            placeholder="No assumption"
            className="mt-2 block h-10 w-56 rounded-lg border border-input bg-background px-3 text-sm"
          />
        </label>
        <button
          disabled={mutation.isPending}
          className="h-10 rounded-full bg-primary px-5 text-sm font-semibold text-primary-foreground"
        >
          {mutation.isPending ? "Saving…" : "Save assumption"}
        </button>
        <button type="button" onClick={() => setValue("")} className="h-10 px-3 text-sm underline">
          Clear field
        </button>
      </form>
      {mutation.error ? (
        <p role="alert" className="mt-3 text-sm text-destructive">
          {mutation.error.message}
        </p>
      ) : null}
    </section>
  );
}
function Trend({
  row,
  period,
}: {
  row: BusinessPerformanceRow;
  period: { since: string; until: string };
}) {
  if (!row.daily.length) return null;
  const points: { date: string; listingViews: number }[] = [];
  const last = businessDate(period.until);
  let day = businessDate(period.since);
  while (day && day <= last) {
    points.push({
      date: day,
      listingViews: row.daily.find((p) => p.date === day)?.listingViews ?? 0,
    });
    const next = new Date(day + "T12:00:00Z");
    next.setUTCDate(next.getUTCDate() + 1);
    day = next.toISOString().slice(0, 10);
  }
  const max = Math.max(1, ...points.map((day) => day.listingViews));
  return (
    <section className="rounded-2xl border border-border bg-card p-5">
      <h3 className="text-sm font-semibold">Listing views by day</h3>
      <div
        className="mt-5 flex h-32 items-end gap-1"
        role="img"
        aria-label={`Daily listing views for ${row.name}; ${row.listingViews} total`}
      >
        {points.map((day) => (
          <div
            key={day.date}
            title={`${day.date}: ${day.listingViews} listing views`}
            className="min-w-1 flex-1 rounded-t bg-primary/80"
            style={{ height: (day.listingViews / max) * 100 + "%" }}
          />
        ))}
      </div>
      <div className="mt-2 flex justify-between text-xs text-muted-foreground">
        <span>{points[0]?.date}</span>
        <span>{points.at(-1)?.date}</span>
      </div>
    </section>
  );
}
function BusinessPerformancePage() {
  const search = Route.useSearch();
  const navigate = Route.useNavigate();
  const days = search.days ?? 30;
  const fetchReport = useServerFn(getBusinessPerformance);
  const query = useQuery({
    queryKey: ["business-performance", days],
    queryFn: () => fetchReport({ data: { days } }),
    staleTime: 60000,
    refetchOnWindowFocus: false,
    retry: false,
  });
  const [filter, setFilter] = useState("");
  const [copied, setCopied] = useState(false);
  const data = query.data;
  const requested = search.dealer ? "dealer:" + search.dealer : search.business;
  const selectedKey = requested ? (data?.aliases[requested] ?? requested) : null;
  const selected = data?.businesses.find((row) => row.key === selectedKey);
  const rows = (data?.businesses ?? []).filter((row) =>
    `${row.name} ${row.city} ${row.state} ${row.sources.join(" ")}`
      .toLowerCase()
      .includes(filter.toLowerCase()),
  );
  const change = (business?: string) =>
    void navigate({ search: { days, ...(business ? { business } : {}) } });
  const exportCsv = () => {
    const blob = new Blob(
      [
        businessPerformanceCsv(
          selected ? [selected] : rows,
          data ? { period: data.period, trackingStartedAt: data.trackingStartedAt } : undefined,
        ),
      ],
      {
        type: "text/csv;charset=utf-8;",
      },
    );
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `bluebird-business-performance-${days}-days.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };
  const copy = async () => {
    if (!selected) return;
    let text = `In the last ${days} days, ${selected.name}'s listings on Bluebird received ${selected.listingClicks.toLocaleString()} listing-card clicks and ${selected.listingViews.toLocaleString()} detail-page views. The business had ${selected.uniqueBrowsers.toLocaleString()} measured browsers across its listings and business pages. We recorded ${selected.websiteClicks} dealership website clicks, ${selected.vehicleClicks} original-listing clicks, ${selected.calls} call-button clicks, and ${selected.inquiries} submitted inquiry conversations. Clicks do not verify completed calls or purchases. Business click tracking began ${data ? new Date(data.trackingStartedAt).toLocaleDateString() : "with this report"}; older totals include only events already recorded.`;
    if (selected.modeledSales != null)
      text += ` At an explicitly assumed ${selected.conversionPercent}% conversion from ${selected.interestedBrowsers} interested browsers, this models approximately ${selected.modeledSales} sales. This is an estimate, not confirmed sales.`;
    await navigator.clipboard.writeText(text);
    setCopied(true);
  };
  return (
    <main className="mx-auto max-w-[1400px] space-y-6 px-4 py-10 sm:px-8">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <Link to="/admin" className="text-xs text-muted-foreground hover:underline">
            Back to operations
          </Link>
          <p className="mt-5 text-[10px] font-semibold uppercase tracking-widest text-primary">
            Bluebird operations
          </p>
          <h1 className="mt-1 font-editorial text-3xl">Business performance</h1>
          <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
            Measured exposure and referrals for authorized feeds, API listings, and other business
            listings.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <select
            aria-label="Reporting period"
            value={days}
            onChange={(e) =>
              void navigate({ search: { ...search, days: Number(e.target.value) as 7 | 30 | 90 } })
            }
            className="h-10 rounded-full border border-input bg-background px-4 text-sm"
          >
            {[7, 30, 90].map((day) => (
              <option key={day} value={day}>
                Last {day} days
              </option>
            ))}
          </select>
          <button
            onClick={() => void query.refetch()}
            disabled={query.isFetching}
            className="h-10 rounded-full border border-input px-4 text-sm"
          >
            {query.isFetching ? "Refreshing…" : "Refresh"}
          </button>
          <button
            disabled={!data}
            onClick={exportCsv}
            className="h-10 rounded-full bg-primary px-5 text-sm font-semibold text-primary-foreground"
          >
            Export CSV
          </button>
        </div>
      </header>
      {query.isLoading ? (
        <p>Loading business performance…</p>
      ) : query.error ? (
        <p role="alert" className="rounded-xl border border-destructive/30 p-5 text-destructive">
          {query.error.message}
        </p>
      ) : data ? (
        <>
          <p className="rounded-xl bg-secondary/50 p-4 text-xs leading-relaxed text-muted-foreground">
            Staff, business-owner, demonstration, marked test, preview, and recognized bot activity
            is excluded. Views are detail-page visits; website clicks are referrals; call clicks are
            taps, not verified calls. New business-click tracking starts{" "}
            {new Date(data.trackingStartedAt).toLocaleDateString()}. Older totals include only
            events already recorded. Counts represent browsers, not verified people; one person
            using multiple devices may count more than once.
          </p>
          {selected ? (
            <>
              <div className="flex flex-wrap items-end justify-between gap-4">
                <div>
                  <button onClick={() => change()} className="text-xs text-primary underline">
                    All businesses
                  </button>
                  <h2 className="mt-3 text-2xl font-semibold">{selected.name}</h2>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {[selected.city, selected.state].filter(Boolean).join(", ")} ·{" "}
                    {selected.sources.join(" + ") || "Business page"}
                  </p>
                </div>
                <div className="flex gap-2">
                  {selected.dealerSlug ? (
                    <Link
                      to="/dealers/$slug"
                      params={{ slug: selected.dealerSlug }}
                      className="rounded-full border border-border px-4 py-2 text-sm"
                    >
                      View storefront
                    </Link>
                  ) : null}
                  <button
                    onClick={() => void copy().catch(() => setCopied(false))}
                    className="rounded-full border border-border px-4 py-2 text-sm"
                  >
                    {copied ? "Summary copied" : "Copy performance summary"}
                  </button>
                </div>
              </div>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <Stat label="Listing-card clicks" value={selected.listingClicks} />
                <Stat label="Dealer profile clicks" value={selected.profileClicks} />
                <Stat label="Listing detail views" value={selected.listingViews} />
                <Stat label="Unique measured browsers" value={selected.uniqueBrowsers} />
                <Stat label="Business profile views" value={selected.profileViews} />
                <Stat label="Current vehicle listings" value={selected.activeListings} />
                <Stat label="Business website clicks" value={selected.websiteClicks} />
                <Stat label="Original listing clicks" value={selected.vehicleClicks} />
                <Stat
                  label="Call / text / email taps"
                  value={selected.calls + selected.texts + selected.emails}
                  note={`${selected.calls} calls · ${selected.texts} texts · ${selected.emails} emails`}
                />
                <Stat
                  label="Submitted inquiry conversations"
                  value={selected.inquiries}
                  note={`${selected.saves} save actions · ${selected.interestedBrowsers} interested browsers`}
                />
              </div>
              <Trend row={selected} period={data.period} />
              {selected.kind === "dealer" ? (
                <SalesModel key={selected.key + ":" + selected.conversionPercent} row={selected} />
              ) : null}
              <section className="overflow-x-auto rounded-2xl border border-border">
                <h3 className="p-5 text-base font-semibold">Performance by listing</h3>
                <table className="w-full min-w-[850px] text-left text-sm">
                  <thead className="bg-secondary/50 text-xs text-muted-foreground">
                    <tr>
                      {[
                        "Listing",
                        "Source",
                        "Current inventory",
                        "Card clicks",
                        "Views",
                        "Website",
                        "Original listing",
                        "Contact taps",
                        "Inquiries",
                      ].map((h) => (
                        <th key={h} className="p-3">
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {selected.listings.map((listing) => (
                      <tr key={listing.id} className="border-t border-border">
                        <td className="max-w-xs p-3">
                          <Link
                            to="/listings/$listingId"
                            params={{ listingId: listing.id }}
                            className="font-medium text-primary hover:underline"
                          >
                            {listing.title}
                          </Link>
                        </td>
                        <td className="p-3">{listing.source}</td>
                        <td className="p-3 text-xs text-muted-foreground">
                          {listing.active ? "In current catalog" : "Not in current catalog"}
                        </td>
                        <td className="p-3 tabular-nums">{listing.listingClicks}</td>
                        <td className="p-3 tabular-nums">{listing.listingViews}</td>
                        <td className="p-3 tabular-nums">{listing.websiteClicks}</td>
                        <td className="p-3 tabular-nums">{listing.vehicleClicks}</td>
                        <td className="p-3 tabular-nums">
                          {listing.calls + listing.texts + listing.emails}
                        </td>
                        <td className="p-3 tabular-nums">{listing.inquiries}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {!selected.listings.length ? (
                  <p className="p-5 text-sm text-muted-foreground">
                    No listing-level activity recorded for this business yet.
                  </p>
                ) : null}
              </section>
            </>
          ) : (
            <>
              <label className="block text-xs font-medium">
                Find a business
                <input
                  value={filter}
                  onChange={(e) => setFilter(e.target.value)}
                  placeholder="Business, city, or inventory source"
                  className="mt-2 block h-11 w-full max-w-lg rounded-xl border border-input bg-background px-4 text-sm"
                />
              </label>
              <div className="overflow-x-auto rounded-2xl border border-border">
                <table className="w-full min-w-[1050px] text-left text-sm">
                  <thead className="bg-secondary/50 text-xs text-muted-foreground">
                    <tr>
                      {[
                        "Business",
                        "Inventory source",
                        "Current vehicles",
                        "Card clicks",
                        "Listing views",
                        "Profile views",
                        "Website clicks",
                        "Original listing clicks",
                        "Contact taps",
                        "Inquiries",
                      ].map((h) => (
                        <th key={h} className="p-3">
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((row) => (
                      <tr key={row.key} className="border-t border-border">
                        <td className="p-3">
                          <button
                            className="text-left font-semibold text-primary hover:underline"
                            onClick={() => change(row.key)}
                          >
                            {row.name}
                          </button>
                          <p className="mt-1 text-xs text-muted-foreground">
                            {[row.city, row.state].filter(Boolean).join(", ")} · {row.kind}
                          </p>
                        </td>
                        <td className="p-3 text-xs">
                          {row.sources.join(" + ") || "Business page"}
                        </td>
                        <td className="p-3 tabular-nums">{number(row.activeListings)}</td>
                        <td className="p-3 tabular-nums">{row.listingClicks}</td>
                        <td className="p-3 tabular-nums">{row.listingViews}</td>
                        <td className="p-3 tabular-nums">{row.profileViews}</td>
                        <td className="p-3 tabular-nums">{row.websiteClicks}</td>
                        <td className="p-3 tabular-nums">{row.vehicleClicks}</td>
                        <td className="p-3 tabular-nums">{row.calls + row.texts + row.emails}</td>
                        <td className="p-3 tabular-nums">{row.inquiries}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {!rows.length ? (
                  <p className="p-5 text-muted-foreground">No matching businesses.</p>
                ) : null}
              </div>
            </>
          )}
          {requested && !selected ? (
            <p role="status" className="text-sm text-muted-foreground">
              No attributable activity or current inventory was found for the requested business.
            </p>
          ) : null}
          {data.unattributedEvents ? (
            <p className="text-xs text-muted-foreground">
              {data.unattributedEvents.toLocaleString()} older imported-vehicle events could not be
              tied reliably to a business. They are excluded rather than assigned to the wrong
              dealership.
            </p>
          ) : null}
        </>
      ) : null}
    </main>
  );
}
