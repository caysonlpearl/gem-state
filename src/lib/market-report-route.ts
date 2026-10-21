import { queryOptions } from "@tanstack/react-query";
import { brand } from "@/config/brand";
import { getMarketReport, type MarketReportPage } from "@/lib/market-report.functions";
import { idahoDate } from "@/lib/market-stats";
import { PUBLIC_PAGE_STALE_MS } from "@/lib/query-freshness";
import { jsonLdScript } from "@/lib/structured-data";

export const marketReportQuery = (month?: string) =>
  queryOptions({
    queryKey: ["market-report", month ?? null],
    staleTime: PUBLIC_PAGE_STALE_MS,
    queryFn: () => getMarketReport({ data: month ? { month } : {} }),
  });

export const reportPath = (month: string) => `/idaho/market-report/${month}`;

export function reportTitle(page: MarketReportPage) {
  return `Idaho marketplace report: ${page.report.label}`;
}

export function reportLead(page: MarketReportPage) {
  const { totals } = page.report;
  return `${totals.live.toLocaleString("en-US")} listings were live on ${brand.name} ${
    page.current ? "as of" : "at the end of"
  } ${page.current ? idahoDate(page.report.generatedAt) : page.report.label}, with ${totals.newThisMonth.toLocaleString(
    "en-US",
  )} posted and ${totals.soldThisMonth.toLocaleString("en-US")} marked sold during the month.`;
}

export function marketReportHead(page: MarketReportPage | null | undefined) {
  if (!page) return { meta: [{ name: "robots", content: "noindex" }] };
  const title = `${reportTitle(page)} — ${brand.name}`;
  const description = `${reportLead(page)} Median asking prices by category, listings by region, and the most-listed vehicles.`;
  const url = `${brand.urls.siteUrl}${reportPath(page.report.month)}`;
  return {
    meta: [
      { title },
      { name: "description", content: description },
      ...(page.indexable ? [] : [{ name: "robots", content: "noindex, follow" }]),
      { property: "og:title", content: title },
      { property: "og:description", content: description },
      { property: "og:type", content: "article" },
    ],
    scripts: [
      jsonLdScript({
        "@context": "https://schema.org",
        "@type": "Article",
        headline: reportTitle(page),
        description,
        url,
        mainEntityOfPage: url,
        dateModified: page.report.generatedAt,
        author: { "@type": "Organization", name: brand.name, url: brand.urls.siteUrl },
        publisher: { "@type": "Organization", name: brand.name, url: brand.urls.siteUrl },
        about: { "@type": "Place", name: "Idaho" },
        inLanguage: "en-US",
      }),
    ],
  };
}
