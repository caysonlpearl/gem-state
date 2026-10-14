import { createServerFn } from "@tanstack/react-start";

import {
  buildMarketReport,
  reportMonthOf,
  type MarketReport,
  type ReportListing,
  type ReportSale,
} from "@/lib/market-stats";
import { canonicalMake, canonicalModel } from "@/lib/place-pages";

/** The report goes into search results once it rests on this many live listings. */
export const MARKET_REPORT_MIN_LISTINGS = 200;

export type MarketReportPage = {
  report: MarketReport;
  current: boolean;
  indexable: boolean;
  /** Months with a saved report, newest first, for the archive links. */
  months: string[];
};

type Row = {
  price_cents: number;
  created_at: string;
  products: { categories: { slug: string; name: string } | null } | null;
  classified_listing_details:
    | {
        city: string | null;
        region: string | null;
        state: string | null;
        vehicle_make: string | null;
        vehicle_model: string | null;
      }
    | null
    | Record<string, unknown>[];
};

async function buildCurrentReport(admin: any): Promise<MarketReport> {
  const nowIso = new Date().toISOString();
  // Same visibility rules as the sitemap and the public browse pages.
  const { data: rows, error } = await admin
    .from("asks")
    .select(
      "price_cents, created_at, products!inner(status, categories(slug, name)), classified_listing_details!inner(city, region, state, vehicle_make, vehicle_model)",
    )
    .eq("status", "active")
    .eq("is_demo", false)
    .not("approved_at", "is", null)
    .gt("expires_at", nowIso)
    .eq("products.status", "published")
    .limit(45_000);
  if (error) throw new Error(error.message);

  const listings: ReportListing[] = ((rows ?? []) as Row[]).map((row) => {
    const details = (Array.isArray(row.classified_listing_details)
      ? row.classified_listing_details[0]
      : row.classified_listing_details) as Record<string, string | null> | null;
    const category = row.products?.categories ?? null;
    const make = category?.slug === "cars-trucks" ? canonicalMake(details?.["vehicle_make"]) : null;
    return {
      priceCents: row.price_cents,
      createdAt: row.created_at,
      categorySlug: category?.slug ?? null,
      categoryName: category?.name ?? null,
      city: details?.["city"] ?? null,
      region: details?.["region"] ?? null,
      state: details?.["state"] ?? null,
      make,
      model: make ? canonicalModel(make, details?.["vehicle_model"]) : null,
    };
  });

  // Sales sellers marked this month (never take-downs).
  const monthStart = new Date(Date.now() - 32 * 86_400_000).toISOString();
  const { data: soldRows } = await admin
    .from("asks")
    .select("created_at, sold_at, products!inner(categories(slug))")
    .eq("status", "cancelled")
    .eq("is_demo", false)
    .gte("sold_at", monthStart)
    .limit(45_000);
  const sales: ReportSale[] = ((soldRows ?? []) as any[]).map((row) => ({
    categorySlug: row.products?.categories?.slug ?? null,
    createdAt: row.created_at,
    soldAt: row.sold_at,
  }));

  return buildMarketReport(listings, sales);
}

/**
 * The current month's report is built live (and saved, so the month keeps
 * its end-of-month numbers); a past month is read from its saved report.
 */
export const getMarketReport = createServerFn({ method: "GET" })
  .validator((input: { month?: string }) => ({
    month: /^\d{4}-(0[1-9]|1[0-2])$/.test(String(input?.month ?? "")) ? String(input.month) : "",
  }))
  .handler(async ({ data }): Promise<MarketReportPage | null> => {
    const { shortCache } = await import("./short-cache.server");
    // A monthly report doesn't need minute-by-minute freshness.
    return shortCache(`market-report:${data.month}`, 15 * 60_000, async () => {
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      const admin = supabaseAdmin as any;
      const currentMonth = reportMonthOf(new Date());
      const { data: saved } = await admin
        .from("market_report_snapshots")
        .select("month")
        .order("month", { ascending: false })
        .limit(36);
      const months = new Set<string>((saved ?? []).map((row: { month: string }) => row.month));
      months.add(currentMonth);

      let report: MarketReport | null = null;
      const current = !data.month || data.month === currentMonth;
      if (current) {
        report = await buildCurrentReport(admin);
        // Awaited: a serverless host may stop background work once the
        // response is sent, and this save is what keeps the month's numbers.
        const { error } = await admin
          .from("market_report_snapshots")
          .upsert({ month: report.month, report, updated_at: new Date().toISOString() });
        if (error) console.error("market report snapshot not saved", error.message);
      } else {
        const { data: row } = await admin
          .from("market_report_snapshots")
          .select("report")
          .eq("month", data.month)
          .maybeSingle();
        report = (row?.report as MarketReport | undefined) ?? null;
      }
      if (!report) return null;
      return {
        report,
        current,
        indexable: report.totals.live >= MARKET_REPORT_MIN_LISTINGS,
        months: Array.from(months).sort().reverse(),
      };
    });
  });
