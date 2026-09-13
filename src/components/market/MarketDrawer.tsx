import { useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { X } from "@phosphor-icons/react";

import { formatUsd } from "@/config/fees";
import type { DemoVariantMarket } from "@/config/demo-market";
import { getVariantDepth, type DepthRow } from "@/lib/market.functions";
import { trackEvent } from "@/lib/analytics";

/**
 * Market-data drawer: a right-side panel on desktop, a full-screen sheet on
 * mobile. Rows are anonymous by construction — the underlying views project
 * price, variation, condition and quantity and nothing else. There are no
 * charts and no price movement, because no verified history exists yet.
 */
const conditionLabels: Record<string, string> = {
  new_with_tags: "New with tags",
  new_without_tags: "New without tags",
  used_excellent: "Used — excellent",
  used_good: "Used — good",
};

const tabs = [
  { id: "bids", label: "Offers" },
  { id: "asks", label: "Listings" },
  { id: "sales", label: "Verified sales" },
] as const;
type TabId = (typeof tabs)[number]["id"];

export function MarketDrawer({
  open,
  onClose,
  variantId,
  variantLabel,
  productName,
  demoMarket,
  illustrativeSales,
}: {
  open: boolean;
  onClose: () => void;
  variantId: string;
  variantLabel: string;
  productName: string;
  demoMarket?: DemoVariantMarket | null;
  illustrativeSales?: DemoVariantMarket["sales"] | undefined;
}) {
  const [tab, setTab] = useState<TabId>("asks");
  const panelRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const fetchDepth = useServerFn(getVariantDepth);

  const depth = useQuery({
    queryKey: ["variant-depth", variantId],
    queryFn: () => fetchDepth({ data: { variantId } }),
    enabled: open && Boolean(variantId) && !demoMarket,
  });

  useEffect(() => {
    if (open)
      void trackEvent(
        "market_option_viewed",
        { surface: "market_drawer" },
        { isDemo: Boolean(demoMarket) },
      );
  }, [open, demoMarket]);

  // Focus management: move focus into the panel on open, trap Tab inside it,
  // and close on Escape.
  useEffect(() => {
    if (!open) return;
    closeRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose();
        return;
      }
      if (e.key !== "Tab" || !panelRef.current) return;
      const focusable = panelRef.current.querySelectorAll<HTMLElement>(
        'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
      );
      if (focusable.length === 0) return;
      const first = focusable[0]!;
      const last = focusable[focusable.length - 1]!;
      if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      } else if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  const actual = demoMarket ?? depth.data;
  // Real verified sales always win once they exist; illustrative sales are
  // only a placeholder for variations that have none yet.
  const realSales = actual?.sales ?? [];
  const usingIllustrativeSales = realSales.length === 0 && Boolean(illustrativeSales?.length);
  const data = usingIllustrativeSales
    ? { asks: actual?.asks ?? [], bids: actual?.bids ?? [], sales: illustrativeSales! }
    : actual;
  const isLoading = !demoMarket && depth.isLoading;
  const isError = !demoMarket && depth.isError;

  return (
    <div className="fixed inset-0 z-50">
      <button
        type="button"
        aria-label="Close market data"
        onClick={onClose}
        className="absolute inset-0 bg-background/80"
      />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label={`Market data for ${productName}, ${variantLabel}`}
        className="absolute inset-0 flex flex-col border-border bg-card sm:inset-y-0 sm:left-auto sm:right-0 sm:w-[420px] sm:border-l"
      >
        <div className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-3 border-b border-border px-4 py-3.5">
          <div className="min-w-0">
            <h2 className="truncate text-[13.5px] font-semibold tracking-tight">Market data</h2>
            <p className="truncate text-[11.5px] text-muted-foreground">
              {productName} · {variantLabel}
            </p>
          </div>
          <button
            ref={closeRef}
            type="button"
            onClick={onClose}
            className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-md border border-input transition-colors hover:bg-secondary"
          >
            <X size={16} aria-hidden="true" />
            <span className="sr-only">Close market data</span>
          </button>
        </div>

        <div role="tablist" aria-label="Market data views" className="flex gap-1 px-3 py-2">
          {tabs.map((t) => (
            <button
              key={t.id}
              role="tab"
              type="button"
              aria-selected={tab === t.id}
              aria-controls={`market-panel-${t.id}`}
              id={`market-tab-${t.id}`}
              onClick={() => setTab(t.id)}
              className={[
                "inline-flex h-9 flex-1 items-center justify-center rounded-md text-[12.5px] font-medium transition-colors",
                tab === t.id
                  ? "bg-secondary text-secondary-foreground"
                  : "text-muted-foreground hover:bg-secondary/60",
              ].join(" ")}
            >
              {t.id === "sales" && usingIllustrativeSales ? "Last sales" : t.label}
            </button>
          ))}
        </div>

        {usingIllustrativeSales && (
          <p className="px-4 pb-2 text-xs text-muted-foreground">
            Preview—activity shown is illustrative.
          </p>
        )}
        {demoMarket && (
          <div className="mx-4 mb-2 border border-brand-warm/35 bg-brand-warm/10 px-3 py-2.5">
            <p className="text-[10px] font-semibold uppercase tracking-[0.1em] text-brand-warm">
              Demo market data
            </p>
            <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">
              Every offer, listing and sale below is illustrative mock data. No real member or
              transaction is represented.
            </p>
          </div>
        )}

        <div
          className="min-h-0 flex-1 overflow-y-auto px-4 pb-6"
          role="tabpanel"
          id={`market-panel-${tab}`}
          aria-labelledby={`market-tab-${tab}`}
          tabIndex={0}
        >
          <p aria-live="polite" className="sr-only">
            {isLoading ? "Loading market data" : "Market data updated"}
          </p>

          {isLoading && (
            <p className="py-6 text-[12.5px] text-muted-foreground">Loading market data…</p>
          )}
          {isError && (
            <div className="py-6">
              <p className="text-[12.5px] text-muted-foreground">
                Market data could not be loaded.
              </p>
              <button
                type="button"
                onClick={() => void depth.refetch()}
                className="mt-2 inline-flex h-9 items-center rounded-md border border-input px-3 text-[12.5px] font-medium transition-colors hover:bg-secondary"
              >
                Try again
              </button>
            </div>
          )}

          {data && tab === "asks" && (
            <DepthTable
              rows={data.asks}
              priceHeading="Price"
              empty="No active listings on this variation yet."
              showCondition
            />
          )}
          {data && tab === "bids" && (
            <DepthTable
              rows={data.bids}
              priceHeading="Offer"
              empty="No active offers on this variation yet."
            />
          )}
          {data && tab === "sales" && (
            <>
              {data.sales.length === 0 ? (
                <p className="py-6 text-[12.5px] text-muted-foreground">
                  No verified sales yet. A sale only appears here after payment evidence, purchase
                  evidence and confirmed delivery.
                </p>
              ) : (
                <table className="mt-1 w-full text-[12.5px]">
                  <caption className="sr-only">
                    {usingIllustrativeSales
                      ? "Illustrative sales for this variation"
                      : "Verified sales for this variation"}
                  </caption>
                  <thead>
                    <tr className="text-left text-[10.5px] uppercase tracking-[0.07em] text-muted-foreground">
                      <th scope="col" className="py-2 font-medium">
                        Sale price
                      </th>
                      <th scope="col" className="py-2 font-medium">
                        Source
                      </th>
                      <th scope="col" className="py-2 text-right font-medium">
                        Date
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.sales.map((s, i) => (
                      <tr key={`${s.soldAt}-${i}`} className="hairline-b">
                        <td className="numeric py-2 font-medium">{formatUsd(s.priceCents)}</td>
                        <td className="py-2 text-muted-foreground">
                          {s.origin === "sourcing" ? "Park-sourced" : "In hand"}
                        </td>
                        <td className="numeric py-2 text-right text-muted-foreground">
                          {new Date(s.soldAt).toISOString().slice(0, 10)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </>
          )}

          <p className="mt-5 text-[11.5px] leading-relaxed text-muted-foreground">
            {demoMarket
              ? "This preview is display-only. It does not create marketplace records, affect validation metrics or imply a completed sale."
              : "Rows are anonymous: ParkVault never shows who placed a listing or offer."}
          </p>
        </div>
      </div>
    </div>
  );
}

function DepthTable({
  rows,
  priceHeading,
  empty,
  showCondition = false,
}: {
  rows: DepthRow[];
  priceHeading: string;
  empty: string;
  showCondition?: boolean;
}) {
  if (rows.length === 0) {
    return <p className="py-6 text-[12.5px] text-muted-foreground">{empty}</p>;
  }
  return (
    <table className="mt-1 w-full text-[12.5px]">
      <caption className="sr-only">{priceHeading} depth for this variation</caption>
      <thead>
        <tr className="text-left text-[10.5px] uppercase tracking-[0.07em] text-muted-foreground">
          <th scope="col" className="py-2 font-medium">
            {priceHeading}
          </th>
          {showCondition && (
            <th scope="col" className="py-2 font-medium">
              Condition
            </th>
          )}
          <th scope="col" className="py-2 text-right font-medium">
            Quantity
          </th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r, i) => (
          <tr key={`${r.priceCents}-${r.condition ?? "any"}-${i}`} className="hairline-b">
            <td className="numeric py-2 font-medium">{formatUsd(r.priceCents)}</td>
            {showCondition && (
              <td className="py-2 text-muted-foreground">
                {r.condition ? (conditionLabels[r.condition] ?? r.condition) : "—"}
              </td>
            )}
            <td className="numeric py-2 text-right text-muted-foreground">{r.quantity}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
