import { useEffect } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";

import { trackEvent } from "@/lib/analytics";
import { getValidationSummary } from "@/lib/pilot.functions";

export const Route = createFileRoute("/_authenticated/admin/validation")({
  head: () => ({
    meta: [
      { title: "Validation summary — GemList operations" },
      {
        name: "description",
        content:
          "Administrator-only validation summary for GemList member activity and marketplace operations.",
      },
      { property: "og:title", content: "Validation summary — GemList operations" },
      {
        property: "og:description",
        content: "Administrator-only funnel summary for GemList marketplace operations.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: ValidationPage,
});

const groups: { title: string; events: string[] }[] = [
  { title: "Discovery", events: ["page_view", "search_performed", "search_no_results"] },
  {
    title: "Product and market",
    events: ["product_viewed", "variation_selected", "market_option_viewed"],
  },
  {
    title: "Buyer intent",
    events: ["bid_started", "bid_submitted", "buy_now_started", "form_abandoned"],
  },
  { title: "Supply", events: ["ask_started", "ask_submitted", "sell_now_started"] },
  {
    title: "Park sourcing",
    events: [
      "sourcing_option_viewed",
      "sourcing_option_selected",
      "sourcing_purchase_started",
      "price_confirmation_needed",
      "shopper_application_submitted",
      "shopper_availability_enabled",
    ],
  },
  {
    title: "Manual marketplace fulfilment",
    events: [
      "order_started",
      "payment_evidence_recorded",
      "purchase_evidence_confirmed",
      "shipment_recorded",
      "delivery_confirmed",
      "verified_sale_confirmed",
    ],
  },
];

const eventLabels: Record<string, string> = {
  page_view: "Page views",
  search_performed: "Searches",
  search_no_results: "Searches with no results",
  product_viewed: "Product views",
  variation_selected: "Variation selections",
  market_option_viewed: "Market data opened",
  bid_started: "Offer form opened",
  bid_submitted: "Offers submitted",
  buy_now_started: "Buy requests started",
  form_abandoned: "Offer/listing forms abandoned",
  ask_started: "Listing form opened",
  ask_submitted: "Listings submitted",
  sell_now_started: "Sell requests started",
  sourcing_option_viewed: "Sourcing options viewed",
  sourcing_option_selected: "Sourcing options selected",
  sourcing_purchase_started: "Sourcing purchases started",
  price_confirmation_needed: "Price confirmation needed",
  shopper_application_submitted: "Shopper applications",
  shopper_availability_enabled: "Shopper availability activations",
  order_started: "Orders started",
  payment_evidence_recorded: "External payment evidence recorded",
  purchase_evidence_confirmed: "Purchase evidence confirmed",
  shipment_recorded: "Shipments recorded",
  delivery_confirmed: "Deliveries confirmed",
  verified_sale_confirmed: "Verified sales",
};

function ValidationPage() {
  const fetchSummary = useServerFn(getValidationSummary);
  const summary = useQuery({
    queryKey: ["validation-summary"],
    queryFn: () => fetchSummary({ data: { windowDays: 30 } }),
  });

  useEffect(() => {
    void trackEvent("pilot_console_viewed", { view: "validation" });
  }, []);

  if (summary.isLoading) {
    return (
      <p className="mx-auto max-w-[1200px] px-4 py-10 text-[13px] text-muted-foreground sm:px-6">
        Loading validation summary…
      </p>
    );
  }

  if (summary.isError) {
    return (
      <div className="mx-auto max-w-[1200px] px-4 py-10 sm:px-6">
        <p className="text-[13px] text-muted-foreground">The validation summary failed to load.</p>
        <button
          type="button"
          onClick={() => void summary.refetch()}
          className="mt-2 inline-flex h-9 items-center rounded-md border border-input px-3 text-[12.5px] font-medium hover:bg-secondary"
        >
          Try again
        </button>
      </div>
    );
  }

  const data = summary.data;
  if (!data?.isAdmin) {
    return (
      <div className="mx-auto max-w-[720px] px-4 py-16 text-center sm:px-6">
        <h1 className="text-[20px] font-semibold tracking-tight">Not available</h1>
        <p className="mt-2 text-[13px] text-muted-foreground">
          The validation summary is restricted to administrators.
        </p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-[1200px] px-4 py-8 sm:px-6">
      <h1 className="text-[20px] font-semibold tracking-tight">Validation summary</h1>
      <p className="mt-1.5 max-w-2xl text-[12.5px] leading-relaxed text-muted-foreground">
        Last {data.windowDays} days. Marketplace activity excludes catalog samples and any event
        produced by an account holding a staff role. A rate is left blank when its denominator is
        zero — no conversion is estimated.
      </p>
      <Link
        to="/admin"
        className="mt-3 inline-flex h-9 items-center rounded-md border border-input px-3 text-[12.5px] font-medium hover:bg-secondary"
      >
        Operator queues
      </Link>

      <div className="mt-6 space-y-2.5">
        {groups.map((group) => (
          <section key={group.title} className="rounded-lg border border-border bg-card">
            <div className="hairline-b px-4 py-2.5">
              <h2 className="text-[13px] font-semibold tracking-tight">{group.title}</h2>
            </div>
            <table className="w-full text-[12.5px]">
              <caption className="sr-only">{group.title} event counts</caption>
              <thead>
                <tr className="text-left text-[10.5px] uppercase tracking-[0.07em] text-muted-foreground">
                  <th scope="col" className="px-4 py-2 font-medium">
                    Event
                  </th>
                  <th scope="col" className="px-4 py-2 text-right font-medium">
                    Real
                  </th>
                  <th scope="col" className="px-4 py-2 text-right font-medium">
                    Sample
                  </th>
                  <th scope="col" className="px-4 py-2 text-right font-medium">
                    Internal
                  </th>
                </tr>
              </thead>
              <tbody>
                {group.events.map((name) => (
                  <tr key={name} className="hairline-b">
                    <th scope="row" className="px-4 py-2 text-left font-normal">
                      {eventLabels[name] ?? name}
                    </th>
                    <td className="numeric px-4 py-2 text-right font-medium">
                      {data.real[name] ?? 0}
                    </td>
                    <td className="numeric px-4 py-2 text-right text-muted-foreground">
                      {data.demo[name] ?? 0}
                    </td>
                    <td className="numeric px-4 py-2 text-right text-muted-foreground">
                      {data.internal[name] ?? 0}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        ))}
      </div>

      <section className="mt-6 rounded-lg border border-border bg-card">
        <div className="hairline-b px-4 py-2.5">
          <h2 className="text-[13px] font-semibold tracking-tight">
            Validation questions — real activity only
          </h2>
        </div>
        <ul>
          {data.questions.map((q) => (
            <li key={q.question} className="hairline-b px-4 py-3 last:border-b-0">
              <p className="text-[12.5px] font-medium">{q.question}</p>
              <p className="numeric mt-0.5 text-[13px] font-semibold">
                {q.answer ?? "Not enough real data yet"}
              </p>
              <p className="mt-0.5 text-[11.5px] text-muted-foreground">{q.detail}</p>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
