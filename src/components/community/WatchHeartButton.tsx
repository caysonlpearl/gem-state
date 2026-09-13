import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { Heart } from "@phosphor-icons/react";
import { toast } from "sonner";

import { brand } from "@/config/brand";
import { useAuth } from "@/hooks/useAuth";
import { trackEvent } from "@/lib/analytics";
import { getProductWatchState, setProductWatchState } from "@/lib/community.functions";

/**
 * Compact heart control for product cards. One tap saves the product to the
 * private watchlist. Signed-out members
 * are sent to sign in instead of seeing a silent failure.
 */
export function WatchHeartButton({
  productId,
  productSlug,
  productName,
  isDemo,
}: {
  productId: string;
  productSlug: string;
  productName: string;
  isDemo: boolean;
}) {
  const { isSignedIn } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const fetchState = useServerFn(getProductWatchState);
  const setState = useServerFn(setProductWatchState);

  const state = useQuery({
    queryKey: ["product-watch-state", productId],
    queryFn: () => fetchState({ data: { productId } }),
    enabled: isSignedIn && !isDemo,
  });

  const mutation = useMutation({
    mutationFn: (watching: boolean) => setState({ data: { productId, watching } }),
    onSuccess: async (result) => {
      await trackEvent(result.watching ? "watchlist_added" : "watchlist_removed", {
        product_slug: productSlug,
      });
      await queryClient.invalidateQueries({ queryKey: ["product-watch-state", productId] });
      await queryClient.invalidateQueries({ queryKey: ["watch-state", result.variantId] });
      await queryClient.invalidateQueries({ queryKey: ["my-watchlist"] });
      await queryClient.invalidateQueries({ queryKey: ["watcher-count", result.variantId] });
      toast.success(
        result.watching
          ? `Saved ${productName} to your watchlist. It is private to you.`
          : `Removed ${productName} from your watchlist.`,
      );
    },
    onError: (error) =>
      toast.error(error instanceof Error ? error.message : "Could not update your watchlist."),
  });

  if (isDemo) return null;

  const watching = state.data?.watching ?? false;

  return (
    <button
      type="button"
      aria-label={
        !isSignedIn
          ? `Sign in to save ${productName} to your watchlist`
          : watching
            ? `Remove ${productName} from your watchlist`
            : `Save ${productName} to your watchlist`
      }
      aria-pressed={isSignedIn ? watching : undefined}
      disabled={mutation.isPending}
      onClick={(event) => {
        event.preventDefault();
        event.stopPropagation();
        if (!isSignedIn) {
          void navigate({ to: brand.urls.auth });
          return;
        }
        mutation.mutate(!watching);
      }}
      className="inline-flex h-7 w-7 items-center justify-center rounded-full border border-border bg-card/95 text-muted-foreground shadow-sm backdrop-blur transition-colors hover:border-primary hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60"
    >
      <Heart
        size={14}
        weight={watching ? "fill" : "regular"}
        className={watching ? "text-brand-warm" : undefined}
      />
    </button>
  );
}
