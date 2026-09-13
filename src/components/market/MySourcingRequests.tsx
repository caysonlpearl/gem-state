import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Link, useNavigate } from "@tanstack/react-router";
import { toast } from "sonner";

import { formatUsd } from "@/config/fees";
import { RelativeTime } from "@/components/ui/relative-time";
import { trackEvent } from "@/lib/analytics";
import { sourcingRequestStatusLabels } from "@/lib/market-labels";
import {
  acceptShopperQuote,
  cancelSourcingRequest,
  getMySourcingRequests,
} from "@/lib/sourcing.functions";

/** A buyer's custom sourcing requests and the quotes shoppers have submitted on them. */
export function MySourcingRequests() {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const fetchRequests = useServerFn(getMySourcingRequests);
  const accept = useServerFn(acceptShopperQuote);
  const cancel = useServerFn(cancelSourcingRequest);

  const requests = useQuery({
    queryKey: ["my-sourcing-requests"],
    queryFn: () => fetchRequests(),
  });

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ["my-sourcing-requests"] });

  const acceptMutation = useMutation({
    mutationFn: (quoteId: string) => accept({ data: { quoteId } }),
    onSuccess: async (result) => {
      await trackEvent("quote_accepted", {});
      await invalidate();
      toast.success("Quote accepted.");
      await navigate({ to: "/orders/$orderId", params: { orderId: result.orderId } });
    },
    onError: (error) =>
      toast.error(error instanceof Error ? error.message : "Could not accept that quote."),
  });

  const cancelMutation = useMutation({
    mutationFn: (requestId: string) => cancel({ data: { requestId } }),
    onSuccess: async () => {
      await trackEvent("sourcing_request_cancelled", {});
      await invalidate();
      toast.success("Request cancelled.");
    },
    onError: (error) =>
      toast.error(error instanceof Error ? error.message : "Could not cancel the request."),
  });

  const items = requests.data ?? [];

  return (
    <section className="mt-8">
      <h2 className="text-[13px] font-semibold tracking-tight">Your sourcing requests</h2>
      <p className="mt-1 text-[12px] text-muted-foreground">
        Custom quotes from approved shoppers on items with no fixed-price sourcing offer.
      </p>

      {requests.isLoading && <p className="mt-2 text-[13px] text-muted-foreground">Loading…</p>}
      {!requests.isLoading && items.length === 0 && (
        <p className="mt-2 text-[13px] text-muted-foreground">
          No sourcing requests yet. Open a product and use &ldquo;Request sourcing&rdquo; when no
          offer fits.
        </p>
      )}

      {items.length > 0 && (
        <ul className="mt-3 space-y-3">
          {items.map((request) => {
            const liveQuotes = request.quotes.filter((q) => q.status === "submitted");
            return (
              <li key={request.id} className="rounded-lg border border-border bg-card">
                <div className="hairline-b flex flex-wrap items-center justify-between gap-2 px-4 py-2.5">
                  <span>
                    <Link
                      to="/products/$slug"
                      params={{ slug: request.productSlug }}
                      className="text-[13px] font-medium hover:underline"
                    >
                      {request.productName}
                    </Link>
                    <span className="block text-[11.5px] text-muted-foreground">
                      {request.variantLabel} ·{" "}
                      {sourcingRequestStatusLabels[request.status] ?? request.status} ·{" "}
                      <RelativeTime iso={request.createdAt} />
                    </span>
                  </span>
                  {request.status === "open" && (
                    <button
                      type="button"
                      onClick={() => cancelMutation.mutate(request.id)}
                      disabled={cancelMutation.isPending}
                      className="h-8 rounded-md border border-input px-2.5 text-[12px] font-medium hover:bg-secondary disabled:opacity-50"
                    >
                      Cancel request
                    </button>
                  )}
                </div>

                <div className="px-4 py-3">
                  {request.maxBudgetCents != null && (
                    <p className="text-[12px] text-muted-foreground">
                      Your budget:{" "}
                      <span className="numeric">{formatUsd(request.maxBudgetCents)}</span>
                    </p>
                  )}

                  {liveQuotes.length === 0 ? (
                    <p className="mt-1 text-[12.5px] text-muted-foreground">
                      No quotes yet. Approved shoppers who cover this item can respond any time
                      before the request expires.
                    </p>
                  ) : (
                    <ul className="mt-2 space-y-2">
                      {liveQuotes.map((quote) => (
                        <li
                          key={quote.id}
                          className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-border px-3 py-2"
                        >
                          <span>
                            <span className="numeric text-[13px] font-semibold">
                              {formatUsd(quote.deliveredEstimateCents)}
                            </span>
                            <span className="ml-2 text-[11.5px] text-muted-foreground">
                              delivered · within {quote.fulfillmentWindowDays} days · shopper{" "}
                              {quote.shopperRef}
                              {quote.shopperReviewCount ? (
                                <>
                                  {" "}
                                  · {quote.shopperAvgRating?.toFixed(1)}★ (
                                  {quote.shopperReviewCount})
                                </>
                              ) : null}
                            </span>
                            {quote.availabilityNote && (
                              <span className="mt-0.5 block text-[11.5px] text-muted-foreground">
                                &ldquo;{quote.availabilityNote}&rdquo;
                              </span>
                            )}
                          </span>
                          <button
                            type="button"
                            onClick={() => acceptMutation.mutate(quote.id)}
                            disabled={acceptMutation.isPending}
                            className="h-8 shrink-0 rounded-md bg-primary px-2.5 text-[12px] font-medium text-primary-foreground disabled:opacity-50"
                          >
                            Accept quote
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
