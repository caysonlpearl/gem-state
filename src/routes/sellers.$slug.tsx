import { useEffect, useRef, useState } from "react";
import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import { queryOptions, useMutation, useQuery, useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { CheckCircle, Flag, Star } from "@phosphor-icons/react";
import { toast } from "sonner";

import {
  flagSellerReview,
  getMySellerReview,
  getPublicSeller,
  submitSellerReview,
} from "@/lib/seller.functions";
import { SellerListingGrid } from "@/components/market/SellerListingGrid";
import { useAuth } from "@/hooks/useAuth";

const sellerQuery = (slug: string) =>
  queryOptions({ queryKey: ["seller", slug], queryFn: () => getPublicSeller({ data: { slug } }) });

export const Route = createFileRoute("/sellers/$slug")({
  validateSearch: (search: Record<string, unknown>): { review?: true } => ({
    ...(search["review"] ? { review: true as const } : {}),
  }),
  loader: async ({ context, params }) => {
    const seller = await context.queryClient.ensureQueryData(sellerQuery(params.slug));
    if (!seller) throw notFound();
    return { seller };
  },
  component: SellerPage,
  head: ({ loaderData }) => ({
    meta: [
      {
        title: loaderData?.seller
          ? `${loaderData.seller.displayName} — Seller on Gem State Classifieds`
          : `Seller profile — Gem State Classifieds`,
      },
      {
        name: "description",
        content: loaderData?.seller
          ? `${loaderData.seller.displayName}'s active listings on Gem State Classifieds.`
          : "Seller profile on Gem State Classifieds.",
      },
      { name: "robots", content: "noindex" },
    ],
  }),
  notFoundComponent: () => (
    <main className="mx-auto max-w-[720px] px-4 py-20 text-center">
      <h1 className="font-editorial text-[34px]">Seller not found</h1>
      <Link to="/browse" search={{}} className="mt-4 inline-block underline">
        Browse listings
      </Link>
    </main>
  ),
});

function SellerPage() {
  const { slug } = Route.useParams();
  const { review: focusReview } = Route.useSearch();
  const { data: seller } = useSuspenseQuery(sellerQuery(slug));
  const { user } = useAuth();
  const formRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (focusReview) formRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [focusReview]);

  if (!seller) return null;
  const isOwnProfile = user?.id === seller.userId;

  return (
    <main className="mx-auto max-w-[1180px] px-4 py-10 sm:px-8">
      <section className="border-b border-border pb-7">
        <div className="flex items-start gap-4">
          <div className="grid h-16 w-16 shrink-0 place-items-center overflow-hidden rounded-full bg-primary text-[22px] font-semibold text-primary-foreground">
            {seller.avatarUrl ? (
              <img src={seller.avatarUrl} alt="" className="h-full w-full object-cover" />
            ) : (
              seller.displayName.slice(0, 1).toUpperCase()
            )}
          </div>
          <div className="min-w-0">
            <h1 className="flex flex-wrap items-center gap-2 font-editorial text-[38px] font-normal tracking-[-0.035em]">
              {seller.displayName}
              {seller.payoutVerified ? (
                <CheckCircle
                  size={21}
                  weight="fill"
                  className="text-primary"
                  aria-label="Payout identity verified"
                />
              ) : null}
            </h1>
            <p className="text-[11.5px] text-muted-foreground">
              @{seller.slug} · Member since {new Date(seller.memberSince).getFullYear()}
            </p>
            {seller.bio ? (
              <p className="mt-3 max-w-[620px] text-[13px] leading-relaxed text-muted-foreground">
                {seller.bio}
              </p>
            ) : null}
          </div>
        </div>
        <div className="mt-5 grid max-w-[560px] grid-cols-3 gap-px bg-border border border-border">
          <Metric label="Active listings" value={seller.activeListingCount} />
          <Metric label="Verified sales" value={seller.completedSalesCount} />
          <Metric
            label="Rating"
            value={seller.ratingAverage == null ? "New" : `${seller.ratingAverage.toFixed(1)} / 5`}
            icon={seller.ratingAverage != null ? <Star size={12} weight="fill" /> : null}
          />
        </div>
      </section>
      <section className="pt-7">
        <div className="mb-5 flex items-end justify-between">
          <h2 className="font-editorial text-[27px] font-normal">Listings</h2>
          <span className="text-[11.5px] text-muted-foreground">Seller listings</span>
        </div>
        <SellerListingGrid listings={seller.listings} showProduct />
      </section>
      <section className="mt-10 border-t border-border pt-7">
        <div className="flex items-baseline justify-between gap-3">
          <h2 className="font-editorial text-[27px] font-normal">Seller reviews</h2>
          <span className="text-[11.5px] text-muted-foreground">{seller.reviewCount} total</span>
        </div>
        <div ref={formRef} className="mt-5 scroll-mt-20">
          {!isOwnProfile ? (
            user ? (
              <ReviewForm sellerId={seller.userId} sellerSlug={seller.slug} />
            ) : (
              <p className="border border-dashed border-input bg-card p-4 text-[12.5px] text-muted-foreground">
                <Link
                  to="/auth"
                  search={{ redirect: undefined }}
                  className="font-semibold text-primary hover:underline"
                >
                  Sign in
                </Link>{" "}
                to leave {seller.displayName} a review.
              </p>
            )
          ) : null}
        </div>
        {seller.reviews.length ? (
          <ul className="mt-6 grid gap-3 md:grid-cols-2">
            {seller.reviews.map((review) => (
              <li key={review.id} className="border border-border bg-card p-4">
                <p
                  className="flex gap-0.5 text-primary"
                  aria-label={`${review.rating} out of 5 stars`}
                >
                  {Array.from({ length: 5 }, (_, index) => (
                    <Star
                      key={index}
                      size={13}
                      weight={index < review.rating ? "fill" : "regular"}
                    />
                  ))}
                </p>
                <p className="mt-2 text-[12.5px] leading-relaxed">
                  {review.comment || "No written comment."}
                </p>
                <div className="mt-3 flex items-center justify-between gap-2">
                  <p className="text-[10.5px] text-muted-foreground">
                    {review.reviewerName ?? "Gem State member"} ·{" "}
                    {new Date(review.createdAt).toLocaleDateString()}
                  </p>
                  {user ? <ReviewFlagButton reviewId={review.id} /> : null}
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-6 text-[12.5px] text-muted-foreground">
            This seller has not received a review yet.
          </p>
        )}
      </section>
    </main>
  );
}

function ReviewForm({ sellerId, sellerSlug }: { sellerId: string; sellerSlug: string }) {
  const queryClient = useQueryClient();
  const fetchMyReview = useServerFn(getMySellerReview);
  const submit = useServerFn(submitSellerReview);

  const myReview = useQuery({
    queryKey: ["my-seller-review", sellerId],
    queryFn: () => fetchMyReview({ data: { sellerId } }),
  });

  const [rating, setRating] = useState(5);
  const [comment, setComment] = useState("");
  const [editing, setEditing] = useState(false);

  useEffect(() => {
    if (myReview.data) {
      setRating(myReview.data.rating);
      setComment(myReview.data.comment ?? "");
    }
  }, [myReview.data]);

  const mutation = useMutation({
    mutationFn: () => submit({ data: { sellerId, rating, comment: comment.trim() || null } }),
    onSuccess: async () => {
      setEditing(false);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["seller", sellerSlug] }),
        queryClient.invalidateQueries({ queryKey: ["my-seller-review", sellerId] }),
      ]);
      toast.success("Review published on their profile.");
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Could not submit the review."),
  });

  if (myReview.isLoading) return null;

  if (myReview.data && !editing) {
    return (
      <section className="border border-border bg-card px-5 py-4">
        <h3 className="text-[13px] font-semibold tracking-tight">Your review</h3>
        <p className="mt-2 flex items-center gap-1 text-primary" aria-label={`${myReview.data.rating} out of 5 stars`}>
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
        Rate this seller based on your experience with them.
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
              onClick={() => setEditing(false)}
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

function ReviewFlagButton({ reviewId }: { reviewId: string }) {
  const flag = useServerFn(flagSellerReview);
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [flagged, setFlagged] = useState(false);

  const mutation = useMutation({
    mutationFn: () => flag({ data: { reviewId, reason: reason.trim() || null } }),
    onSuccess: () => {
      setFlagged(true);
      setOpen(false);
      toast.success("Thanks — this review has been sent to Gem State for review.");
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
        onClick={() => setOpen(false)}
        className="text-[10.5px] text-muted-foreground hover:underline"
      >
        Cancel
      </button>
    </div>
  );
}

function Metric({
  label,
  value,
  icon,
}: {
  label: string;
  value: string | number;
  icon?: React.ReactNode;
}) {
  return (
    <div className="bg-card p-3">
      <p className="text-[10px] text-muted-foreground">{label}</p>
      <p className="numeric mt-1 flex items-center gap-1 text-[14px] font-semibold">
        {value}
        {icon}
      </p>
    </div>
  );
}
