import { useEffect, useMemo, useState, type ComponentType } from "react";
import { Share } from "@capacitor/share";
import { toast } from "sonner";
import { ReviewsSectionView } from "../../../src/components/account/ReviewsSectionView";
import type { AccountLinkProps } from "../../../src/components/account/AccountProfileView";
import type { MobileAccountReviews } from "../../../src/lib/mobile-account-reviews.server";
import { api, apiOrigin } from "./client";
import { installIdentifier } from "./identity";
type Loaded = MobileAccountReviews & { installId: string };
export function NativeAccountReviews({
  ownerId,
  link,
  publicProfileReady,
}: {
  ownerId: string;
  link: ComponentType<AccountLinkProps>;
  publicProfileReady: boolean;
}) {
  const actor = useMemo(() => ({ userId: ownerId, installId: installIdentifier() }), [ownerId]);
  const [loaded, setLoaded] = useState<Loaded | null>(null),
    [error, setError] = useState(""),
    [version, setVersion] = useState(0),
    [sharing, setSharing] = useState(false);
  useEffect(() => {
    const controller = new AbortController();
    const signal = AbortSignal.any([controller.signal, AbortSignal.timeout(20000)]);
    setLoaded(null);
    setError("");
    api<MobileAccountReviews>("account/reviews", "GET", undefined, signal, actor)
      .then((reviews) => {
        if (controller.signal.aborted || installIdentifier() !== actor.installId) return;
        if (reviews.ownerId !== ownerId) throw Error("Your account changed. Please try again.");
        setLoaded({ ...reviews, installId: actor.installId });
      })
      .catch((e) => {
        if (!controller.signal.aborted && installIdentifier() === actor.installId)
          setError(
            signal.aborted
              ? "Your reviews could not be loaded. Please retry."
              : e instanceof Error
                ? e.message
                : "Your reviews could not be loaded. Please retry.",
          );
      });
    return () => controller.abort();
  }, [actor, ownerId, version]);
  if (error)
    return (
      <div
        role="alert"
        className="rounded-2xl border border-destructive/30 bg-destructive/5 p-4 text-sm"
      >
        {error}
        <button
          type="button"
          className="ml-3 min-h-11 font-semibold underline"
          onClick={() => setVersion((v) => v + 1)}
        >
          Retry reviews
        </button>
      </div>
    );
  if (!loaded || loaded.ownerId !== ownerId || loaded.installId !== installIdentifier())
    return (
      <p role="status" className="text-sm text-muted-foreground">
        Loading your reviews…
      </p>
    );
  const slug = loaded.sellerSlug;
  const safeSlug =
    publicProfileReady && typeof slug === "string" && /^[a-z0-9][a-z0-9-]{0,59}$/.test(slug)
      ? slug
      : undefined;
  return (
    <ReviewsSectionView
      rating={loaded.ratingAverage}
      reviews={loaded.reviews}
      sellerSlug={safeSlug}
      sharing={sharing}
      link={link}
      onShareReviewLink={async () => {
        if (!safeSlug) {
          toast.info("Complete seller setup before sharing your review link.");
          return;
        }
        if (sharing || installIdentifier() !== actor.installId) return;
        setSharing(true);
        try {
          await Share.share({
            title: "Review my Bluebird seller profile",
            url: `${apiOrigin}/sellers/${safeSlug}?review=1`,
          });
        } catch (e) {
          if (
            installIdentifier() === actor.installId &&
            !(e instanceof Error && /cancel|abort/i.test(e.message))
          )
            toast.error("Could not share the review link.");
        } finally {
          setSharing(false);
        }
      }}
    />
  );
}
