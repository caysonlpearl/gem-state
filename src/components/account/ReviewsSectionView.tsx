import type { ComponentType } from "react";
import { ArrowRight, ClipboardText } from "@phosphor-icons/react";
import type { SellerReview } from "../../lib/seller.functions";
import type { AccountLinkProps } from "./AccountProfileView";
import { AccountSectionHeader as SectionHeader } from "./AccountSectionView";
import { SectionTitle } from "./AccountViewParts";

export function ReviewsSectionView({
  rating,
  reviews,
  sellerSlug,
  onShareReviewLink,
  sharing = false,
  link: Link,
}: {
  rating?: number | null;
  reviews: SellerReview[];
  sellerSlug?: string | null;
  onShareReviewLink: () => void | Promise<void>;
  sharing?: boolean;
  link: ComponentType<AccountLinkProps>;
}) {
  const distribution = [5, 4, 3, 2, 1].map((score) => ({
    score,
    count: reviews.filter((review) => review.rating === score).length,
  }));
  return (
    <div className="space-y-6">
      <SectionHeader
        eyebrow="Trust profile"
        title="Reviews & reputation"
        body="See the reputation you have earned on Bluebird. Anyone can leave you a review from your public profile — share your link with people who know your work."
        action={
          sellerSlug ? (
            <Link
              href={`/sellers/${sellerSlug}`}
              className="inline-flex h-11 items-center gap-2 rounded-xl border border-input px-3 text-[12px] font-semibold hover:bg-secondary"
            >
              View public profile
              <ArrowRight size={14} />
            </Link>
          ) : undefined
        }
      />
      <section className="grid gap-6 rounded-2xl border border-border bg-card p-5 shadow-sm lg:grid-cols-[150px_minmax(0,1fr)]">
        <div className="text-center">
          <div className="mx-auto grid size-20 place-items-center rounded-full bg-secondary text-[24px] font-bold text-primary">
            {rating == null ? "—" : rating.toFixed(1)}
          </div>
          <p className="mt-2 text-[12px] font-semibold">
            {rating == null ? "No reviews yet" : "Average rating"}
          </p>
          <p className="mt-1 text-[11px] text-muted-foreground">{reviews.length} received</p>
        </div>
        <div className="space-y-2">
          {distribution.map((row) => (
            <div key={row.score} className="flex items-center gap-3 text-[11px]">
              <span className="w-8 shrink-0 whitespace-nowrap font-semibold">{row.score} star</span>
              <span className="h-2 flex-1 overflow-hidden rounded-full bg-secondary">
                <span
                  className="block h-full rounded-full bg-accent"
                  style={{ width: `${reviews.length ? (row.count / reviews.length) * 100 : 0}%` }}
                />
              </span>
              <span className="w-5 text-right text-muted-foreground">{row.count}</span>
            </div>
          ))}
          <button
            type="button"
            disabled={sharing}
            onClick={() => void onShareReviewLink()}
            className="mt-3 inline-flex min-h-11 items-center gap-1.5 text-[12px] font-semibold text-primary hover:underline"
          >
            <ClipboardText size={14} /> Share review link
          </button>
        </div>
      </section>
      <section className="rounded-2xl border border-border bg-card p-5 shadow-sm">
        <SectionTitle title="Reviews received" />
        <p className="mt-1 text-[11.5px] text-muted-foreground">
          Reviews from your community help members understand your reputation.
        </p>
        {reviews.length ? (
          <div className="mt-4 space-y-3">
            {reviews.map((review) => (
              <article
                key={review.id}
                className="border-t border-border pt-3 first:border-t-0 first:pt-0"
              >
                <div className="flex items-center gap-2">
                  <span className="font-semibold">{"★".repeat(review.rating)}</span>
                  <span className="text-[11px] text-muted-foreground">
                    {new Date(review.createdAt).toLocaleDateString()}
                  </span>
                </div>
                <p className="mt-2 text-[12px] leading-relaxed text-muted-foreground">
                  {review.comment || "No written comment."}
                </p>
              </article>
            ))}
          </div>
        ) : (
          <p className="mt-4 text-[12px] text-muted-foreground">No reviews yet.</p>
        )}
      </section>
    </div>
  );
}
