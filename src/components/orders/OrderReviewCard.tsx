import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Star } from "@phosphor-icons/react";
import { toast } from "sonner";

import { trackEvent } from "@/lib/analytics";
import { getOrderOperations, submitOrderReview } from "@/lib/pilot.functions";

/**
 * Prominent, standalone rating card. Reviews are only accepted once an order is
 * completed, so this renders nothing until then.
 */
export function OrderReviewCard({ orderId, role }: { orderId: string; role: "buyer" | "seller" }) {
  const queryClient = useQueryClient();
  const fetchOps = useServerFn(getOrderOperations);
  const review = useServerFn(submitOrderReview);
  const [rating, setRating] = useState(5);
  const [comment, setComment] = useState("");

  const ops = useQuery({
    queryKey: ["order-ops", orderId],
    queryFn: () => fetchOps({ data: { orderId } }),
  });

  const mutation = useMutation({
    mutationFn: () => review({ data: { orderId, rating, comment: comment.trim() || null } }),
    onSuccess: async () => {
      await trackEvent("review_submitted", { rating });
      await queryClient.invalidateQueries({ queryKey: ["order-ops", orderId] });
      toast.success("Thanks — your review is published on their profile.");
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Could not submit the review."),
  });

  const data = ops.data;
  if (!data) return null;

  const counterparty = role === "buyer" ? "seller" : "buyer";

  if (data.myReviewRating != null) {
    return (
      <section className="rounded-xl border border-border bg-card px-5 py-4">
        <h2 className="text-[13px] font-semibold tracking-tight">Your review</h2>
        <p
          className="mt-2 flex items-center gap-1 text-primary"
          aria-label={`${data.myReviewRating} out of 5 stars`}
        >
          {Array.from({ length: 5 }, (_, i) => (
            <Star key={i} size={16} weight={i < (data.myReviewRating ?? 0) ? "fill" : "regular"} />
          ))}
        </p>
        <p className="mt-2 text-[12.5px] text-muted-foreground">
          You rated this {counterparty} {data.myReviewRating} out of 5. Thanks for helping keep Gem
          State honest.
        </p>
      </section>
    );
  }

  if (!data.canReview) return null;

  return (
    <section className="rounded-xl border border-primary/40 bg-card px-5 py-5">
      <h2 className="font-editorial text-[21px] leading-tight tracking-[-0.02em]">
        Rate your {counterparty}
      </h2>
      <p className="mt-1 text-[12.5px] leading-relaxed text-muted-foreground">
        Your rating appears on their public profile and helps other members buy with confidence.
      </p>

      <form
        className="mt-4 space-y-3"
        onSubmit={(e) => {
          e.preventDefault();
          mutation.mutate();
        }}
      >
        <fieldset>
          <legend className="text-[11.5px] text-muted-foreground">Rating</legend>
          <div className="mt-1 flex items-center gap-1">
            {[1, 2, 3, 4, 5].map((n) => (
              <button
                key={n}
                type="button"
                onClick={() => setRating(n)}
                aria-label={`${n} star${n === 1 ? "" : "s"}`}
                aria-pressed={rating === n}
                className="rounded p-1 text-primary transition-transform hover:scale-110 focus-visible:outline-2 focus-visible:outline-ring motion-reduce:transition-none"
              >
                <Star size={26} weight={n <= rating ? "fill" : "regular"} />
              </button>
            ))}
            <span className="numeric ml-2 text-[12.5px] text-muted-foreground">{rating} / 5</span>
          </div>
        </fieldset>

        <label className="block">
          <span className="text-[11.5px] text-muted-foreground">Comment (optional)</span>
          <textarea
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            rows={3}
            maxLength={1000}
            placeholder={`How did it go with this ${counterparty}?`}
            className="mt-1 w-full rounded-md border border-input bg-surface p-2 text-[12.5px]"
          />
        </label>

        <button
          type="submit"
          disabled={mutation.isPending}
          className="inline-flex h-11 items-center bg-primary px-5 text-[12.5px] font-semibold text-primary-foreground disabled:opacity-50"
        >
          {mutation.isPending ? "Submitting…" : "Submit review"}
        </button>
      </form>
    </section>
  );
}
