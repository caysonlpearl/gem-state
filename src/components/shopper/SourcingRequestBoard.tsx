import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";

import { formatUsd } from "@/config/fees";
import { RelativeTime } from "@/components/ui/relative-time";
import { trackEvent } from "@/lib/analytics";
import { quoteStatusLabels } from "@/lib/market-labels";
import {
  getMyQuotes,
  getSourcingBoard,
  getSourcingRequestMedia,
  submitShopperQuote,
  withdrawShopperQuote,
  type BoardRequest,
} from "@/lib/sourcing.functions";

function toCents(value: string) {
  const cents = Math.round(Number(value.replace(/[^0-9.]/g, "")) * 100);
  return Number.isFinite(cents) ? cents : 0;
}

function QuoteForm({ request, onDone }: { request: BoardRequest; onDone: () => void }) {
  const queryClient = useQueryClient();
  const submit = useServerFn(submitShopperQuote);
  const fetchMedia = useServerFn(getSourcingRequestMedia);

  const [merchCost, setMerchCost] = useState("");
  const [comp, setComp] = useState("");
  const [shipping, setShipping] = useState("0");
  const [window, setWindow] = useState("7");
  const [validDays, setValidDays] = useState("7");
  const [note, setNote] = useState("");

  const media = useQuery({
    queryKey: ["sourcing-request-media", request.id],
    queryFn: () => fetchMedia({ data: { requestId: request.id } }),
    enabled: request.mediaCount > 0,
  });

  const submitMutation = useMutation({
    mutationFn: () =>
      submit({
        data: {
          requestId: request.id,
          merchCostCents: toCents(merchCost),
          shopperCompCents: toCents(comp),
          shippingEstimateCents: toCents(shipping),
          fulfillmentWindowDays: Number(window),
          validForDays: Number(validDays),
          availabilityNote: note || null,
        },
      }),
    onSuccess: async () => {
      await trackEvent("quote_submitted", {});
      await queryClient.invalidateQueries({ queryKey: ["sourcing-board"] });
      await queryClient.invalidateQueries({ queryKey: ["my-quotes"] });
      toast.success("Quote submitted.");
      onDone();
    },
    onError: (error) =>
      toast.error(error instanceof Error ? error.message : "Could not submit the quote."),
  });

  return (
    <form
      className="hairline-t space-y-3 px-4 py-4"
      onSubmit={(event) => {
        event.preventDefault();
        submitMutation.mutate();
      }}
    >
      {request.buyerNote && (
        <p className="text-[12px] text-muted-foreground">
          Buyer note: &ldquo;{request.buyerNote}&rdquo;
        </p>
      )}
      {media.data && media.data.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {media.data.map((item) => (
            <a
              key={item.mediaId}
              href={item.url}
              target="_blank"
              rel="noreferrer"
              className="text-[11.5px] text-muted-foreground underline underline-offset-2 hover:text-foreground"
            >
              Reference photo
            </a>
          ))}
        </div>
      )}
      <div className="grid gap-3 sm:grid-cols-3">
        <div>
          <label htmlFor="q-merch" className="text-[12px] font-medium">
            Merchandise cost (USD)
          </label>
          <input
            id="q-merch"
            inputMode="decimal"
            value={merchCost}
            onChange={(event) => setMerchCost(event.target.value)}
            placeholder="55.00"
            className="numeric mt-1.5 h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
          />
        </div>
        <div>
          <label htmlFor="q-comp" className="text-[12px] font-medium">
            Your compensation (USD)
          </label>
          <input
            id="q-comp"
            inputMode="decimal"
            value={comp}
            onChange={(event) => setComp(event.target.value)}
            placeholder="10.00"
            className="numeric mt-1.5 h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
          />
        </div>
        <div>
          <label htmlFor="q-shipping" className="text-[12px] font-medium">
            Shipping estimate (USD)
          </label>
          <input
            id="q-shipping"
            inputMode="decimal"
            value={shipping}
            onChange={(event) => setShipping(event.target.value)}
            className="numeric mt-1.5 h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
          />
        </div>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label htmlFor="q-window" className="text-[12px] font-medium">
            Fulfillment window (days)
          </label>
          <input
            id="q-window"
            inputMode="numeric"
            value={window}
            onChange={(event) => setWindow(event.target.value)}
            className="numeric mt-1.5 h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
          />
        </div>
        <div>
          <label htmlFor="q-valid" className="text-[12px] font-medium">
            Quote valid for (days)
          </label>
          <input
            id="q-valid"
            inputMode="numeric"
            value={validDays}
            onChange={(event) => setValidDays(event.target.value)}
            className="numeric mt-1.5 h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
          />
        </div>
      </div>
      <div>
        <label htmlFor="q-note" className="text-[12px] font-medium">
          Availability note (optional)
        </label>
        <textarea
          id="q-note"
          value={note}
          onChange={(event) => setNote(event.target.value.slice(0, 500))}
          rows={2}
          className="mt-1.5 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
        />
      </div>
      <button
        type="submit"
        disabled={submitMutation.isPending}
        className="inline-flex h-9 items-center rounded-md bg-primary px-3 text-[12.5px] font-medium text-primary-foreground disabled:opacity-60"
      >
        {submitMutation.isPending ? "Submitting…" : "Submit quote"}
      </button>
    </form>
  );
}

/** Approved-shopper board: open buyer sourcing requests, plus the shopper's own quote history. */
export function SourcingRequestBoard() {
  const queryClient = useQueryClient();
  const fetchBoard = useServerFn(getSourcingBoard);
  const fetchQuotes = useServerFn(getMyQuotes);
  const withdraw = useServerFn(withdrawShopperQuote);

  const [quoting, setQuoting] = useState<string | null>(null);
  const [tab, setTab] = useState<"board" | "quotes">("board");

  const board = useQuery({ queryKey: ["sourcing-board"], queryFn: () => fetchBoard() });
  const quotes = useQuery({ queryKey: ["my-quotes"], queryFn: () => fetchQuotes() });

  useEffect(() => {
    void trackEvent("sourcing_board_viewed", {});
  }, []);

  const withdrawMutation = useMutation({
    mutationFn: (quoteId: string) => withdraw({ data: { quoteId } }),
    onSuccess: async () => {
      await trackEvent("quote_withdrawn", {});
      await queryClient.invalidateQueries({ queryKey: ["my-quotes"] });
      await queryClient.invalidateQueries({ queryKey: ["sourcing-board"] });
      toast.success("Quote withdrawn.");
    },
    onError: (error) =>
      toast.error(error instanceof Error ? error.message : "Could not withdraw the quote."),
  });

  const requests = board.data ?? [];
  const myQuotes = quotes.data ?? [];

  return (
    <section className="mt-6 rounded-lg border border-border bg-card">
      <div className="hairline-b flex items-center gap-4 px-4 py-3">
        <h2 className="text-[13px] font-semibold tracking-tight">Sourcing requests</h2>
        <div className="ml-auto flex gap-1.5">
          <button
            type="button"
            onClick={() => setTab("board")}
            className={`h-7 rounded-md px-2.5 text-[11.5px] font-medium ${tab === "board" ? "bg-secondary" : "text-muted-foreground hover:bg-secondary/50"}`}
          >
            Open requests
          </button>
          <button
            type="button"
            onClick={() => setTab("quotes")}
            className={`h-7 rounded-md px-2.5 text-[11.5px] font-medium ${tab === "quotes" ? "bg-secondary" : "text-muted-foreground hover:bg-secondary/50"}`}
          >
            Your quotes
          </button>
        </div>
      </div>

      {tab === "board" && (
        <div className="px-4 py-3">
          <p className="text-[12px] leading-relaxed text-muted-foreground">
            Buyers who can&apos;t find a fixed-price offer post a custom request here, without their
            identity. Submit a fixed all-in quote; if the buyer accepts, an order is created
            automatically.
          </p>
          {board.isLoading && <p className="mt-3 text-[12.5px] text-muted-foreground">Loading…</p>}
          {!board.isLoading && requests.length === 0 && (
            <p className="mt-3 text-[12.5px] text-muted-foreground">No open requests right now.</p>
          )}
          {requests.length > 0 && (
            <ul className="mt-3 space-y-2">
              {requests.map((request) => (
                <li key={request.id} className="rounded-md border border-border">
                  <div className="flex flex-wrap items-center justify-between gap-2 px-3 py-2.5">
                    <span>
                      <span className="text-[13px] font-medium">{request.productName}</span>
                      <span className="block text-[11.5px] text-muted-foreground">
                        {request.variantLabel} ·{" "}
                        {request.maxBudgetCents != null
                          ? `up to ${formatUsd(request.maxBudgetCents)}`
                          : "no stated budget"}{" "}
                        · {request.quoteCount} quote(s) · <RelativeTime iso={request.createdAt} />
                      </span>
                    </span>
                    {request.myQuoteId ? (
                      <span className="text-[11.5px] text-muted-foreground">
                        You already quoted this
                      </span>
                    ) : (
                      <button
                        type="button"
                        onClick={() =>
                          setQuoting((current) => (current === request.id ? null : request.id))
                        }
                        className="h-8 shrink-0 rounded-md border border-input px-2.5 text-[12px] font-medium hover:bg-secondary"
                      >
                        {quoting === request.id ? "Close" : "Quote this"}
                      </button>
                    )}
                  </div>
                  {quoting === request.id && (
                    <QuoteForm request={request} onDone={() => setQuoting(null)} />
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {tab === "quotes" && (
        <div className="px-4 py-3">
          {quotes.isLoading && <p className="text-[12.5px] text-muted-foreground">Loading…</p>}
          {!quotes.isLoading && myQuotes.length === 0 && (
            <p className="text-[12.5px] text-muted-foreground">No quotes submitted yet.</p>
          )}
          {myQuotes.length > 0 && (
            <ul className="space-y-2">
              {myQuotes.map((quote) => (
                <li
                  key={quote.id}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-border px-3 py-2"
                >
                  <span>
                    <span className="text-[12.5px] font-medium">{quote.productName}</span>
                    <span className="block text-[11.5px] text-muted-foreground">
                      {quote.variantLabel} ·{" "}
                      {formatUsd(quote.merchCostCents + quote.shopperCompCents)} ·{" "}
                      {quoteStatusLabels[quote.status] ?? quote.status} ·{" "}
                      <RelativeTime iso={quote.createdAt} />
                    </span>
                  </span>
                  {quote.status === "submitted" && (
                    <button
                      type="button"
                      onClick={() => withdrawMutation.mutate(quote.id)}
                      disabled={withdrawMutation.isPending}
                      className="h-8 shrink-0 rounded-md border border-input px-2.5 text-[12px] font-medium hover:bg-secondary disabled:opacity-50"
                    >
                      Withdraw
                    </button>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </section>
  );
}
