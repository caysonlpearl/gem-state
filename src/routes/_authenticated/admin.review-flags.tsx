import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Star } from "@phosphor-icons/react";
import { toast } from "sonner";

import { RelativeTime } from "@/components/ui/relative-time";
import {
  adminResolveReviewFlag,
  getFlaggedSellerReviews,
  type FlaggedSellerReview,
} from "@/lib/seller.functions";

export const Route = createFileRoute("/_authenticated/admin/review-flags")({
  head: () => ({
    meta: [
      { title: "Flagged reviews · Gem State Classifieds" },
      { name: "description", content: "Review seller reviews flagged by members before removal." },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: ReviewFlagsPage,
});

function FlaggedReviewRow({ review }: { review: FlaggedSellerReview }) {
  const queryClient = useQueryClient();
  const resolve = useServerFn(adminResolveReviewFlag);

  const mutation = useMutation({
    mutationFn: (action: "dismiss" | "remove") =>
      resolve({ data: { reviewId: review.reviewId, action } }),
    onSuccess: async (_result, action) => {
      await queryClient.invalidateQueries({ queryKey: ["admin-review-flags"] });
      toast.success(action === "remove" ? "Review removed." : "Flag dismissed; review restored.");
    },
    onError: (error) =>
      toast.error(error instanceof Error ? error.message : "Could not record the decision."),
  });

  return (
    <li className="border-b border-border p-4 last:border-b-0">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-[260px] flex-1">
          <p className="text-[13px] font-semibold">
            Review of {review.sellerName}
            <span className="ml-2 font-normal text-muted-foreground">by {review.reviewerName}</span>
          </p>
          <p
            className="mt-1 flex items-center gap-0.5 text-primary"
            aria-label={`${review.rating} out of 5 stars`}
          >
            {Array.from({ length: 5 }, (_, index) => (
              <Star key={index} size={13} weight={index < review.rating ? "fill" : "regular"} />
            ))}
          </p>
          {review.comment ? (
            <p className="mt-2 max-w-[560px] text-[12.5px] leading-relaxed">{review.comment}</p>
          ) : (
            <p className="mt-2 text-[12px] text-muted-foreground">No written comment.</p>
          )}
          <p className="mt-2 text-[11px] text-muted-foreground">
            Reviewed <RelativeTime iso={review.reviewCreatedAt} />
          </p>
        </div>
        <div className="min-w-[220px]">
          <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
            {review.flags.length} flag{review.flags.length === 1 ? "" : "s"}
          </p>
          <ul className="mt-1.5 space-y-1.5">
            {review.flags.map((flag) => (
              <li key={flag.id} className="text-[11.5px] text-muted-foreground">
                <span className="font-medium text-foreground">{flag.flaggerName}</span>
                {flag.reason ? `: "${flag.reason}"` : " (no reason given)"} ·{" "}
                <RelativeTime iso={flag.createdAt} />
              </li>
            ))}
          </ul>
        </div>
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => mutation.mutate("dismiss")}
          disabled={mutation.isPending}
          className="h-9 rounded-md border border-input px-3 text-[12px] font-medium hover:bg-secondary disabled:opacity-50"
        >
          Dismiss flag, keep review
        </button>
        <button
          type="button"
          onClick={() => mutation.mutate("remove")}
          disabled={mutation.isPending}
          className="h-9 rounded-md bg-destructive px-3 text-[12px] font-semibold text-destructive-foreground disabled:opacity-50"
        >
          Remove review
        </button>
      </div>
    </li>
  );
}

function ReviewFlagsPage() {
  const fetchFlagged = useServerFn(getFlaggedSellerReviews);
  const { data, isLoading, isError } = useQuery({
    queryKey: ["admin-review-flags"],
    queryFn: () => fetchFlagged(),
  });

  return (
    <main className="mx-auto max-w-[900px] space-y-6 px-4 py-10 sm:px-6">
      <div>
        <p className="text-[10px] font-semibold uppercase tracking-[0.1em] text-primary">
          Gem State operations
        </p>
        <h1 className="mt-1 text-[22px] font-semibold tracking-tight">Flagged reviews</h1>
        <p className="mt-1 max-w-[680px] text-[13px] leading-relaxed text-muted-foreground">
          Any member can flag a seller review. Dismiss the flag to keep the review visible, or
          remove the review if it violates policy.
        </p>
      </div>
      <section className="rounded-lg border border-border bg-card">
        <div className="border-b border-border px-4 py-3">
          <h2 className="text-[13px] font-semibold">
            Awaiting review{" "}
            <span className="numeric text-muted-foreground">{data?.length ?? 0}</span>
          </h2>
        </div>
        {isLoading ? (
          <p className="px-4 py-8 text-[12.5px] text-muted-foreground">Loading…</p>
        ) : isError || !data ? (
          <p className="px-4 py-8 text-[12.5px] text-destructive">
            Flagged reviews could not be loaded.
          </p>
        ) : data.length === 0 ? (
          <p className="px-4 py-8 text-[12.5px] text-muted-foreground">
            No reviews are currently flagged.
          </p>
        ) : (
          <ul>
            {data.map((review) => (
              <FlaggedReviewRow key={review.reviewId} review={review} />
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}
