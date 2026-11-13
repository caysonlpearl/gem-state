import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Flag, Star } from "@phosphor-icons/react";
import { toast } from "sonner";
import type { SellerReview } from "@/lib/seller.functions";
export type SellerReviewRuntime = {
  getReview: () => Promise<SellerReview | null>;
  submitReview: (data: { rating: number; comment: string | null }) => Promise<unknown>;
};
export function SellerReviewFormView({
  sellerId,
  sellerSlug,
  runtime,
}: {
  sellerId: string;
  sellerSlug: string;
  runtime: SellerReviewRuntime;
}) {
  const queryClient = useQueryClient();

  const myReview = useQuery({
    queryKey: ["my-seller-review", sellerId],
    queryFn: () => runtime.getReview(),
  });

  const [rating, setRating] = useState(5);
  const [comment, setComment] = useState("");
  const [editing, setEditing] = useState(false);
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    if (myReview.data && !dirty) {
      setRating(myReview.data.rating);
      setComment(myReview.data.comment ?? "");
    }
  }, [myReview.data, dirty]);

  const mutation = useMutation({
    mutationFn: () => runtime.submitReview({ rating, comment: comment.trim() || null }),
    onSuccess: async () => {
      setDirty(false);
      setEditing(false);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["seller", sellerSlug] }),
        queryClient.invalidateQueries({ queryKey: ["my-seller-review", sellerId] }),
      ]);
      toast.success("Review published on their profile.");
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Could not submit the review."),
  });

  if (myReview.isLoading)
    return (
      <p role="status" className="text-sm text-muted-foreground">
        Loading your review…
      </p>
    );
  if (myReview.isError)
    return (
      <div role="alert" className="border border-border bg-card p-4 text-sm">
        Your review could not be loaded.{" "}
        <button type="button" className="underline" onClick={() => void myReview.refetch()}>
          Retry your review
        </button>
      </div>
    );

  if (myReview.data && !editing) {
    return (
      <section className="border border-border bg-card px-5 py-4">
        <h3 className="text-[13px] font-semibold tracking-tight">Your review</h3>
        <p
          className="mt-2 flex items-center gap-1 text-primary"
          aria-label={`${myReview.data.rating} out of 5 stars`}
        >
          {Array.from({ length: 5 }, (_, i) => (
            <Star key={i} size={16} weight={i < myReview.data!.rating ? "fill" : "regular"} />
          ))}
        </p>
        {myReview.data.comment ? (
          <p className="mt-2 text-[12.5px] text-muted-foreground">{myReview.data.comment}</p>
        ) : null}
        <button
          type="button"
          onClick={() => setEditing(true)}
          className="mt-3 text-[12px] font-semibold text-primary hover:underline"
        >
          Edit your review
        </button>
      </section>
    );
  }

  return (
    <section className="border border-primary/40 bg-card px-5 py-5">
      <h3 className="font-editorial text-[19px] leading-tight tracking-[-0.02em]">
        {myReview.data ? "Edit your review" : "Leave a review"}
      </h3>
      <p className="mt-1 text-[12.5px] leading-relaxed text-muted-foreground">
        Signed-in members can leave one review per seller based on their experience. Submitting
        again updates your existing review, and members can flag reviews that need moderation.
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
                disabled={mutation.isPending}
                onClick={() => {
                  setDirty(true);
                  setRating(n);
                }}
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
            disabled={mutation.isPending}
            value={comment}
            onChange={(e) => {
              setDirty(true);
              setComment(e.target.value);
            }}
            rows={3}
            maxLength={1000}
            placeholder="How was your experience with this seller?"
            className="mt-1 w-full rounded-md border border-input bg-background p-2 text-[12.5px]"
          />
        </label>
        <div className="flex items-center gap-3">
          <button
            type="submit"
            disabled={mutation.isPending}
            className="inline-flex h-10 items-center bg-primary px-5 text-[12.5px] font-semibold text-primary-foreground disabled:opacity-50"
          >
            {mutation.isPending ? "Submitting…" : myReview.data ? "Save changes" : "Submit review"}
          </button>
          {myReview.data ? (
            <button
              type="button"
              disabled={mutation.isPending}
              onClick={() => {
                setDirty(false);
                setEditing(false);
              }}
              className="text-[12.5px] font-semibold text-muted-foreground hover:underline"
            >
              Cancel
            </button>
          ) : null}
        </div>
      </form>
    </section>
  );
}

export function SellerReviewFlagView({
  reviewId,
  onFlag,
}: {
  reviewId: string;
  onFlag: (data: { reviewId: string; reason: string | null }) => Promise<unknown>;
}) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [flagged, setFlagged] = useState(false);

  const mutation = useMutation({
    mutationFn: () => onFlag({ reviewId, reason: reason.trim() || null }),
    onSuccess: () => {
      setFlagged(true);
      setOpen(false);
      toast.success("Thanks — this review has been sent to Bluebird for review.");
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Could not flag this review."),
  });

  if (flagged) {
    return <span className="shrink-0 text-[10.5px] text-muted-foreground">Flagged</span>;
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex shrink-0 items-center gap-1 text-[10.5px] text-muted-foreground hover:text-destructive"
      >
        <Flag size={12} /> Flag
      </button>
    );
  }

  return (
    <div className="flex shrink-0 items-center gap-1.5">
      <input
        disabled={mutation.isPending}
        value={reason}
        onChange={(e) => setReason(e.target.value.slice(0, 500))}
        placeholder="Reason (optional)"
        className="h-7 w-[140px] rounded border border-input bg-background px-1.5 text-[10.5px]"
      />
      <button
        type="button"
        onClick={() => mutation.mutate()}
        disabled={mutation.isPending}
        className="text-[10.5px] font-semibold text-destructive hover:underline disabled:opacity-50"
      >
        Send
      </button>
      <button
        type="button"
        disabled={mutation.isPending}
        onClick={() => setOpen(false)}
        className="text-[10.5px] text-muted-foreground hover:underline"
      >
        Cancel
      </button>
    </div>
  );
}
