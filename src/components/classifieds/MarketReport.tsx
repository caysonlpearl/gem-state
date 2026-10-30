import { CaretRight } from "@phosphor-icons/react";

import { BluebirdEmptyState } from "@/components/layout/BluebirdEmptyState";
import { brand } from "@/config/brand";
import type { MarketReportPage } from "@/lib/market-report.functions";
import { reportPath, reportTitle, reportLead } from "@/lib/market-report-route";
import { reportMonthLabel, wholeDollars } from "@/lib/market-stats";
import { categoryPagePath, placePath, vehiclePagePath } from "@/lib/place-pages";
import {
  EditorialCta,
  EditorialRelatedListings,
  EditorialReadTracker,
} from "@/components/editorial/EditorialCta";

function Table({
  caption,
  head,
  rows,
}: {
  caption: string;
  head: string[];
  rows: (string | number | { href: string; label: string })[][];
}) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[480px] text-left text-[13.5px]">
        <caption className="sr-only">{caption}</caption>
        <thead className="text-[11.5px] uppercase tracking-[0.06em] text-muted-foreground">
          <tr>
            {head.map((label, index) => (
              <th key={label} className={`py-2 font-semibold ${index ? "text-right" : ""}`}>
                {label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, rowIndex) => (
            <tr key={rowIndex} className="border-t border-border">
              {row.map((cell, index) => (
                <td key={index} className={`py-2 ${index ? "numeric text-right" : ""}`}>
                  {typeof cell === "object" ? (
                    <a href={cell.href} className="font-medium hover:text-primary">
                      {cell.label}
                    </a>
                  ) : (
                    cell
                  )}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** The monthly Idaho market report: counts and medians from Bluebird's own listings. */
export function MarketReport({ page }: { page: MarketReportPage }) {
  const { report } = page;
  const priced = report.categories.filter((row) => row.medianCents != null);
  return (
    <main className="mx-auto max-w-[1000px] space-y-10 px-4 py-6 sm:px-7 sm:py-8">
      {page.indexable && (
        <EditorialReadTracker articleId={`report:${report.month}`} topic="market-report" />
      )}
      <div>
        <nav
          aria-label="Breadcrumb"
          className="flex flex-wrap items-center gap-1.5 text-[12.5px] text-muted-foreground"
        >
          <a href="/browse" className="hover:text-foreground">
            Idaho
          </a>
          <CaretRight size={13} aria-hidden="true" />
          <span className="text-foreground">Market report</span>
        </nav>
        <h1 className="mt-4 text-[28px] font-bold leading-tight tracking-tight sm:text-[36px]">
          {reportTitle(page)}
        </h1>
        <p className="mt-2 max-w-[70ch] text-[15px] leading-relaxed text-muted-foreground">
          {reportLead(page)}
        </p>
        <dl className="mt-5 grid max-w-[720px] grid-cols-2 gap-3 sm:grid-cols-4">
          {[
            ["Live listings", report.totals.live.toLocaleString("en-US")],
            ["Posted this month", report.totals.newThisMonth.toLocaleString("en-US")],
            ["Sold this month", report.totals.soldThisMonth.toLocaleString("en-US")],
            [
              "Typical time to sell",
              report.daysToSell ? `${report.daysToSell.medianDays} days` : "Not enough sales yet",
            ],
          ].map(([label, value]) => (
            <div key={label} className="rounded-xl border border-border bg-card px-4 py-3">
              <dt className="text-[11.5px] text-muted-foreground">{label}</dt>
              <dd className="numeric mt-1 text-[17px] font-bold">{value}</dd>
            </div>
          ))}
        </dl>
      </div>

      {report.totals.live === 0 ? (
        <BluebirdEmptyState
          title="No listings to report yet"
          description="This report fills in from live Bluebird listings as they're posted."
        />
      ) : null}
      {page.indexable && (
        <EditorialCta articleId={`report:${report.month}`} placement="report_intro" compact />
      )}

      {priced.length ? (
        <section className="border-t border-border/70 pt-8">
          <h2 className="text-[20px] font-bold tracking-tight">Median asking price by category</h2>
          <p className="mt-1 text-[13px] text-muted-foreground">
            Categories with at least three priced listings. &ldquo;Typical range&rdquo; is the
            middle half of asking prices once a category has five or more.
          </p>
          <div className="mt-4">
            <Table
              caption="Median asking price by category"
              head={["Category", "Listings", "Median", "Typical range"]}
              rows={priced.map((row) => [
                { href: categoryPagePath(row.slug), label: row.name },
                row.count,
                wholeDollars(row.medianCents!),
                `${wholeDollars(row.lowCents!)} – ${wholeDollars(row.highCents!)}`,
              ])}
            />
          </div>
        </section>
      ) : null}

      {report.regions.length ? (
        <section className="border-t border-border/70 pt-8">
          <h2 className="text-[20px] font-bold tracking-tight">Listings by region</h2>
          <div className="mt-4">
            <Table
              caption="Listings by Idaho region"
              head={["Region", "Listings", "Biggest categories"]}
              rows={report.regions.map((row) => [
                { href: placePath(row.region), label: row.region },
                row.count,
                row.topCategories.join(", "),
              ])}
            />
          </div>
        </section>
      ) : null}

      {report.vehicles.length ? (
        <section className="border-t border-border/70 pt-8">
          <h2 className="text-[20px] font-bold tracking-tight">Most-listed cars and trucks</h2>
          <div className="mt-4">
            <Table
              caption="Most-listed vehicle models"
              head={["Make and model", "Listings", "Median asking price"]}
              rows={report.vehicles.map((row) => [
                { href: vehiclePagePath(row.make, row.model), label: `${row.make} ${row.model}` },
                row.count,
                row.medianCents != null ? wholeDollars(row.medianCents) : "—",
              ])}
            />
          </div>
        </section>
      ) : null}

      <section className="border-t border-border/70 pt-8 text-[13px] leading-relaxed text-muted-foreground">
        <h2 className="text-[16px] font-semibold text-foreground">How these numbers are made</h2>
        <p className="mt-2 max-w-[75ch]">
          Every figure comes from listings posted on {brand.name}: asking prices, not final sale
          prices, which buyers and sellers agree on directly. Jobs, services, homes and pets are
          counted but not priced, because pay, quotes, rent and pet fees don&apos;t make one
          comparable price. Sales are listings their sellers marked sold; time to sell is the median
          days from posting to sold, shown once at least five listings sold in the month.{" "}
          {page.current
            ? "This month's report updates as listings change and is kept as it stands at month's end."
            : `This report shows the numbers as they stood at the end of ${report.label}.`}
        </p>
      </section>

      {page.indexable && (
        <>
          <EditorialCta articleId={`report:${report.month}`} placement="report_end" />
          <EditorialRelatedListings articleId={`report:${report.month}`} />
        </>
      )}
      {page.months.length > 1 ? (
        <section className="border-t border-border/70 pt-8">
          <h2 className="text-[16px] font-semibold">Other months</h2>
          <ul className="mt-3 flex flex-wrap gap-2">
            {page.months
              .filter((month) => month !== report.month)
              .map((month) => (
                <li key={month}>
                  <a
                    href={reportPath(month)}
                    className="inline-flex min-h-11 items-center rounded-full border border-input bg-card px-4 text-[13px] font-medium hover:border-primary"
                  >
                    {reportMonthLabel(month)}
                  </a>
                </li>
              ))}
          </ul>
        </section>
      ) : null}
    </main>
  );
}
