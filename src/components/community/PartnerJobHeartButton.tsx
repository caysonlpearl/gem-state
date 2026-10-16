import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { Heart } from "@phosphor-icons/react";
import { toast } from "sonner";

import { brand } from "@/config/brand";
import { useAuth } from "@/hooks/useAuth";
import { trackEvent } from "@/lib/analytics";
import { getPartnerJobSaved, setPartnerJobSaved } from "@/lib/saved-jobs.functions";

/**
 * The save heart for partner (Adzuna) jobs: same look and behavior as
 * WatchHeartButton, saving to the member's saved jobs instead of the
 * product watchlist (partner jobs aren't Bluebird products).
 */
export function PartnerJobHeartButton({
  listingId,
  title,
  className,
}: {
  listingId: string;
  title: string;
  className?: string;
}) {
  const { isSignedIn } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const fetchState = useServerFn(getPartnerJobSaved);
  const setState = useServerFn(setPartnerJobSaved);

  const state = useQuery({
    queryKey: ["partner-job-saved", listingId],
    queryFn: () => fetchState({ data: { listingId } }),
    enabled: isSignedIn,
  });

  const mutation = useMutation({
    mutationFn: (saved: boolean) => setState({ data: { listingId, saved } }),
    onSuccess: async (result) => {
      await trackEvent(result.saved ? "watchlist_added" : "watchlist_removed", {
        partner_job: listingId,
      });
      await queryClient.invalidateQueries({ queryKey: ["partner-job-saved", listingId] });
      await queryClient.invalidateQueries({ queryKey: ["my-saved-partner-jobs"] });
      await queryClient.invalidateQueries({ queryKey: ["listing-stats"] });
      toast.success(result.saved ? `Saved ${title}.` : `Removed ${title} from your saved jobs.`);
    },
    onError: (error) =>
      toast.error(error instanceof Error ? error.message : "Could not update your saved jobs."),
  });

  const saved = state.data?.saved ?? false;

  return (
    <button
      type="button"
      aria-label={
        !isSignedIn
          ? `Sign in to save ${title}`
          : saved
            ? `Remove ${title} from saved jobs`
            : `Save ${title}`
      }
      aria-pressed={isSignedIn ? saved : undefined}
      disabled={mutation.isPending}
      onClick={(event) => {
        event.preventDefault();
        event.stopPropagation();
        if (!isSignedIn) {
          void navigate({ to: brand.urls.auth });
          return;
        }
        mutation.mutate(!saved);
      }}
      className={
        className ??
        "relative inline-flex h-7 w-7 items-center justify-center rounded-full before:absolute before:-inset-2 before:content-[''] border border-border bg-card/95 text-muted-foreground shadow-sm backdrop-blur transition-colors hover:border-primary hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60"
      }
    >
      <Heart
        size={14}
        weight={saved ? "fill" : "regular"}
        className={saved ? "text-brand-warm" : undefined}
      />
    </button>
  );
}
