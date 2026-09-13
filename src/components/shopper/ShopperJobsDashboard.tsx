import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Link } from "@tanstack/react-router";
import { toast } from "sonner";

import { formatUsd } from "@/config/fees";
import { supabase } from "@/integrations/supabase/client";
import { orderStatusLabels } from "@/lib/market-labels";
import {
  confirmSourcingPurchase,
  getMyShopperJobs,
  startShopping,
  type ShopperJob,
} from "@/lib/shopper.functions";
import { reportSourcingUnavailable } from "@/lib/stripe-marketplace.functions";

const ALLOWED_TYPES = ["image/jpeg", "image/png", "image/webp", "image/heic", "application/pdf"];
const MAX_BYTES = 8 * 1024 * 1024;

/** Receipts are private: they go straight to the private evidence bucket. */
async function uploadReceipt(file: File, userId: string) {
  if (!ALLOWED_TYPES.includes(file.type)) {
    throw new Error("Upload a JPEG, PNG, WebP, HEIC or PDF receipt.");
  }
  if (file.size > MAX_BYTES) throw new Error("Files must be 8 MB or smaller.");
  const path = `${userId}/sourcing-receipt-${crypto.randomUUID()}`;
  const { error } = await supabase.storage
    .from("order-evidence")
    .upload(path, file, { contentType: file.type, upsert: false });
  if (error) throw new Error(error.message);
  return path;
}

type Tab = "to_shop" | "shopping" | "to_ship" | "shipped" | "closed";

const tabs: Array<{ id: Tab; label: string }> = [
  { id: "to_shop", label: "New jobs" },
  { id: "shopping", label: "Shopping now" },
  { id: "to_ship", label: "To ship" },
  { id: "shipped", label: "Shipped" },
  { id: "closed", label: "Closed" },
];

function bucketOf(job: ShopperJob): Tab {
  if (["cancelled", "refunded", "unavailable", "completed", "delivered"].includes(job.status)) {
    return "closed";
  }
  if (["shipped", "in_transit"].includes(job.status)) return "shipped";
  if (job.purchaseConfirmedAt) return "to_ship";
  if (job.shoppingStartedAt) return "shopping";
  return "to_shop";
}

/**
 * A Park Shopper's paid jobs, start to finish.
 *
 * Every job here is already paid for by the buyer — ParkVault never sends a job
 * to a shopper on the promise of payment. The shopper marks that they're
 * shopping, confirms what they actually paid with a receipt, then ships from
 * the order page using the same tools sellers use.
 */
export function ShopperJobsDashboard({ userId }: { userId: string }) {
  const queryClient = useQueryClient();
  const fetchJobs = useServerFn(getMyShopperJobs);
  const begin = useServerFn(startShopping);
  const confirm = useServerFn(confirmSourcingPurchase);
  const unavailable = useServerFn(reportSourcingUnavailable);

  const [tab, setTab] = useState<Tab>("to_shop");
  const [openJob, setOpenJob] = useState<string | null>(null);
  const [actualCost, setActualCost] = useState("");
  const [receipt, setReceipt] = useState<File | null>(null);

  const jobs = useQuery({ queryKey: ["shopper-jobs"], queryFn: () => fetchJobs() });
  const rows = jobs.data ?? [];
  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: ["shopper-jobs"] });
    void queryClient.invalidateQueries({ queryKey: ["my-orders"] });
  };

  const grouped = useMemo(() => {
    const map: Record<Tab, ShopperJob[]> = {
      to_shop: [],
      shopping: [],
      to_ship: [],
      shipped: [],
      closed: [],
    };
    for (const job of rows) map[bucketOf(job)].push(job);
    return map;
  }, [rows]);

  const startMutation = useMutation({
    mutationFn: (orderId: string) => begin({ data: { orderId } }),
    onSuccess: () => {
      toast.success("Marked as shopping. The buyer can see you're on it.");
      invalidate();
    },
    onError: (error) =>
      toast.error(error instanceof Error ? error.message : "Could not start this job."),
  });

  const confirmMutation = useMutation({
    mutationFn: async (job: ShopperJob) => {
      if (!receipt) throw new Error("Attach a photo of your receipt.");
      const cents = Math.round(Number(actualCost.replace(/[^0-9.]/g, "")) * 100);
      if (!Number.isFinite(cents) || cents < 1)
        throw new Error("Enter what you paid for the item.");
      if (cents > job.buyerMaxPurchaseCents) {
        throw new Error(
          `That is above the ${formatUsd(job.buyerMaxPurchaseCents)} maximum the buyer approved.`,
        );
      }
      const receiptPath = await uploadReceipt(receipt, userId);
      return confirm({ data: { orderId: job.orderId, actualCostCents: cents, receiptPath } });
    },
    onSuccess: (result) => {
      setOpenJob(null);
      setActualCost("");
      setReceipt(null);
      toast.success(
        result.balanceDueCents > 0
          ? `Purchase recorded. The buyer owes ${formatUsd(result.balanceDueCents)} before you ship.`
          : result.refundDueCents > 0
            ? result.refundIssued
              ? `Purchase recorded. ${formatUsd(result.refundDueCents)} was refunded to the buyer.`
              : `Purchase recorded. ${formatUsd(result.refundDueCents)} is awaiting refund processing.`
            : "Purchase recorded. Ship the item from the order page.",
      );
      invalidate();
    },
    onError: (error) =>
      toast.error(error instanceof Error ? error.message : "Could not record this purchase."),
  });

  const unavailableMutation = useMutation({
    mutationFn: (orderId: string) => unavailable({ data: { orderId } }),
    onSuccess: (result) => {
      toast.success(
        result.refunded
          ? "Marked unavailable. The buyer has been refunded in full."
          : "Marked unavailable. The buyer's refund is being processed.",
      );
      invalidate();
    },
    onError: (error) =>
      toast.error(error instanceof Error ? error.message : "Could not close this job."),
  });

  return (
    <section className="rounded-lg border border-border bg-card">
      <div className="hairline-b flex flex-wrap items-center justify-between gap-2 px-4 py-3">
        <h2 className="text-[13px] font-semibold tracking-tight">Shopping jobs</h2>
        <span className="numeric text-[11.5px] text-muted-foreground">
          {jobs.isLoading ? "Loading…" : `${rows.length} paid job${rows.length === 1 ? "" : "s"}`}
        </span>
      </div>

      <div className="hairline-b flex flex-wrap gap-1 px-3 py-2">
        {tabs.map((item) => (
          <button
            key={item.id}
            type="button"
            aria-pressed={tab === item.id}
            onClick={() => setTab(item.id)}
            className={`h-8 rounded-md px-3 text-[12px] font-medium ${
              tab === item.id
                ? "bg-foreground text-background"
                : "border border-input hover:bg-secondary"
            }`}
          >
            {item.label}
            <span className="numeric ml-1.5 opacity-70">{grouped[item.id].length}</span>
          </button>
        ))}
      </div>

      <div className="space-y-2.5 px-4 py-3">
        {jobs.isError && (
          <p className="text-[12.5px] font-medium text-destructive">
            Couldn&apos;t load your jobs right now.{" "}
            <button
              type="button"
              onClick={() => void jobs.refetch()}
              className="underline underline-offset-2"
            >
              Try again
            </button>
          </p>
        )}

        {!jobs.isLoading && !jobs.isError && grouped[tab].length === 0 && (
          <p className="text-[12.5px] text-muted-foreground">
            {tab === "to_shop"
              ? "No new jobs. Buyers pay up front, so a job only lands here once it's funded."
              : "Nothing in this stage."}
          </p>
        )}

        {grouped[tab].map((job) => (
          <article key={job.orderId} className="rounded-md border border-border px-3 py-2.5">
            <div className="flex items-start gap-3">
              {job.imageSrc ? (
                <img
                  src={job.imageSrc}
                  alt=""
                  loading="lazy"
                  className="h-14 w-14 shrink-0 rounded-md border border-border object-cover"
                />
              ) : (
                <span
                  aria-hidden="true"
                  className="grid h-14 w-14 shrink-0 place-items-center rounded-md border border-border bg-secondary text-[10px] text-muted-foreground"
                >
                  No photo
                </span>
              )}
              <div className="min-w-0 flex-1">
                <Link
                  to="/orders/$orderId"
                  params={{ orderId: job.orderId }}
                  className="text-[13px] font-semibold hover:underline"
                >
                  {job.productName}
                </Link>
                <p className="text-[11.5px] text-muted-foreground">
                  {job.variantLabel} · {job.coverageLabel}
                </p>
                <p className="numeric mt-1 text-[11.5px] text-muted-foreground">
                  {orderStatusLabels[job.status] ?? job.status} · Order {job.orderNumber}
                </p>
              </div>
              <div className="text-right text-[11.5px]">
                <p className="numeric text-[13px] font-semibold">{formatUsd(job.payoutCents)}</p>
                <p className="text-muted-foreground">your payout</p>
              </div>
            </div>

            <dl className="mt-2.5 grid gap-x-4 gap-y-1 text-[11.5px] sm:grid-cols-2">
              <Row label="Item budget" value={formatUsd(job.itemBudgetCents)} />
              <Row label="Buyer's approved maximum" value={formatUsd(job.buyerMaxPurchaseCents)} />
              <Row label="Your earnings" value={formatUsd(job.shopperFeeCents)} />
              <Row
                label="Buyer-paid ParkVault fee"
                value={formatUsd(job.platformServiceFeeCents)}
              />
              {job.actualCostCents != null && (
                <Row label="You paid in park" value={formatUsd(job.actualCostCents)} />
              )}
              {job.balanceDueCents > 0 && (
                <Row label="Buyer balance due" value={formatUsd(job.balanceDueCents)} />
              )}
              {job.refundDueCents > 0 && (
                <Row label="Refund pending to buyer" value={formatUsd(job.refundDueCents)} />
              )}
            </dl>

            {bucketOf(job) === "to_shop" && (
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  disabled={startMutation.isPending}
                  onClick={() => startMutation.mutate(job.orderId)}
                  className="h-9 rounded-md bg-primary px-3 text-[12.5px] font-medium text-primary-foreground disabled:opacity-60"
                >
                  I&apos;m shopping for this
                </button>
                <UnavailableButton job={job} mutation={unavailableMutation} />
              </div>
            )}

            {bucketOf(job) === "shopping" && (
              <div className="mt-3">
                {openJob === job.orderId ? (
                  <form
                    className="hairline-t space-y-2.5 pt-3"
                    onSubmit={(event) => {
                      event.preventDefault();
                      confirmMutation.mutate(job);
                    }}
                  >
                    <label className="block text-[12px] font-medium">
                      What you actually paid for the item (USD)
                      <input
                        inputMode="decimal"
                        value={actualCost}
                        onChange={(event) => setActualCost(event.target.value)}
                        className="numeric mt-1.5 h-10 w-full rounded-md border border-input bg-background px-3 text-sm sm:w-48"
                      />
                    </label>
                    <label className="block text-[12px] font-medium">
                      Receipt photo
                      <input
                        type="file"
                        accept={ALLOWED_TYPES.join(",")}
                        onChange={(event) => setReceipt(event.target.files?.[0] ?? null)}
                        className="mt-1.5 block w-full text-[12px]"
                      />
                    </label>
                    <p className="text-[11.5px] leading-relaxed text-muted-foreground">
                      Paid less than the estimate and ParkVault refunds the buyer the difference
                      automatically. Paid more, up to the {formatUsd(job.buyerMaxPurchaseCents)}{" "}
                      they approved, and they&apos;re asked for the difference before you ship.
                    </p>
                    <div className="flex flex-wrap items-center gap-3">
                      <button
                        type="submit"
                        disabled={confirmMutation.isPending}
                        className="h-9 rounded-md bg-primary px-3 text-[12.5px] font-medium text-primary-foreground disabled:opacity-60"
                      >
                        {confirmMutation.isPending ? "Recording…" : "I bought it"}
                      </button>
                      <button
                        type="button"
                        onClick={() => setOpenJob(null)}
                        className="text-[12.5px] text-muted-foreground underline underline-offset-2"
                      >
                        Cancel
                      </button>
                    </div>
                  </form>
                ) : (
                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        setOpenJob(job.orderId);
                        setActualCost((job.itemBudgetCents / 100).toFixed(2));
                        setReceipt(null);
                      }}
                      className="h-9 rounded-md bg-primary px-3 text-[12.5px] font-medium text-primary-foreground"
                    >
                      I bought it
                    </button>
                    <UnavailableButton job={job} mutation={unavailableMutation} />
                  </div>
                )}
              </div>
            )}

            {bucketOf(job) === "to_ship" && (
              <p className="mt-3 text-[12px]">
                {job.balanceDueCents > 0 ? (
                  <span className="text-muted-foreground">
                    Waiting on the buyer to pay the {formatUsd(job.balanceDueCents)} balance before
                    you ship.
                  </span>
                ) : (
                  <Link
                    to="/orders/$orderId"
                    params={{ orderId: job.orderId }}
                    className="inline-flex h-9 items-center rounded-md bg-primary px-3 text-[12.5px] font-medium text-primary-foreground"
                  >
                    Ship this item
                  </Link>
                )}
              </p>
            )}

            {(bucketOf(job) === "shipped" || bucketOf(job) === "closed") && (
              <p className="mt-3 text-[12px]">
                <Link
                  to="/orders/$orderId"
                  params={{ orderId: job.orderId }}
                  className="underline underline-offset-2"
                >
                  View order
                </Link>
              </p>
            )}
          </article>
        ))}
      </div>
    </section>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="numeric font-medium">{value}</dd>
    </div>
  );
}

function UnavailableButton({
  job,
  mutation,
}: {
  job: ShopperJob;
  mutation: ReturnType<typeof useMutation<{ refunded: boolean }, Error, string>>;
}) {
  return (
    <button
      type="button"
      disabled={mutation.isPending}
      onClick={() => {
        if (
          window.confirm(
            "Mark this item unavailable? The buyer is refunded in full and the job closes.",
          )
        ) {
          mutation.mutate(job.orderId);
        }
      }}
      className="h-9 rounded-md border border-input px-3 text-[12.5px] font-medium hover:bg-secondary disabled:opacity-60"
    >
      Couldn&apos;t find it
    </button>
  );
}
