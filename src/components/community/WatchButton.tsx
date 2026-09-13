import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Link } from "@tanstack/react-router";
import { toast } from "sonner";
import { Star } from "@phosphor-icons/react";

import { brand } from "@/config/brand";
import { useAuth } from "@/hooks/useAuth";
import { trackEvent } from "@/lib/analytics";
import { getWatchState, setWatchState } from "@/lib/community.functions";

/**
 * Follow one exact variation. The watchlist is private to its owner and is only
 * a saved reference — it is private to the member, and
 * the UI says so rather than implying alerts exist.
 */
export function WatchButton({
  productSlug,
  variantId,
  isDemo,
}: {
  productSlug: string;
  variantId: string;
  isDemo: boolean;
}) {
  const { isSignedIn } = useAuth();
  const queryClient = useQueryClient();
  const fetchState = useServerFn(getWatchState);
  const setState = useServerFn(setWatchState);

  const state = useQuery({
    queryKey: ["watch-state", variantId],
    queryFn: () => fetchState({ data: { variantId } }),
    enabled: isSignedIn && !isDemo,
  });

  const mutation = useMutation({
    mutationFn: (watching: boolean) => setState({ data: { variantId, watching } }),
    onSuccess: async (result) => {
      await trackEvent(result.watching ? "watchlist_added" : "watchlist_removed", {
        product_slug: productSlug,
      });
      await queryClient.invalidateQueries({ queryKey: ["watch-state", variantId] });
      await queryClient.invalidateQueries({ queryKey: ["my-watchlist"] });
      await queryClient.invalidateQueries({ queryKey: ["watcher-count", variantId] });
      toast.success(
        result.watching
          ? "Saved to your watchlist. It is private to you."
          : "Removed from your watchlist.",
      );
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : "Could not update."),
  });

  if (isDemo) return null;

  if (!isSignedIn) {
    return (
      <Link
        to={brand.urls.auth}
        className="inline-flex h-9 items-center gap-1.5 rounded-md border border-input px-3 text-[12.5px] font-medium hover:bg-secondary"
      >
        <Star size={14} />
        Sign in to follow this variation
      </Link>
    );
  }

  const watching = state.data?.watching ?? false;

  return (
    <button
      type="button"
      onClick={() => mutation.mutate(!watching)}
      disabled={mutation.isPending || state.isLoading}
      className="inline-flex h-9 items-center gap-1.5 rounded-md border border-input px-3 text-[12.5px] font-medium hover:bg-secondary disabled:opacity-60"
    >
      <Star size={14} weight={watching ? "fill" : "regular"} />
      {watching ? "Following this variation" : "Follow this variation"}
    </button>
  );
}
