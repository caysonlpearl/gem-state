import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { Heart } from "@phosphor-icons/react";
import { toast } from "sonner";

import { useListingSavedState } from "@/hooks/useListingSavedState";
import { brand } from "@/config/brand";
import { useAuth } from "@/hooks/useAuth";
import { setPartnerHomeSaved } from "@/lib/saved-homes.functions";

export function PartnerHomeHeartButton({
  listingId,
  title,
  className,
}: {
  listingId: string;
  title: string;
  className?: string;
}) {
  const { isSignedIn, user } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const setState = useServerFn(setPartnerHomeSaved);
  const state = useListingSavedState("homes", listingId, user?.id);
  const mutation = useMutation({
    mutationFn: (saved: boolean) => setState({ data: { listingId, saved } }),
    onSuccess: async (result) => {
      await queryClient.invalidateQueries({ queryKey: ["partner-home-saved", listingId] });
      await queryClient.invalidateQueries({ queryKey: ["listing-stats"] });
      await queryClient.invalidateQueries({ queryKey: ["my-saved-partner-homes"] });
      toast.success(result.saved ? `Saved ${title}.` : `Removed ${title} from saved homes.`);
    },
    onError: (error) =>
      toast.error(error instanceof Error ? error.message : "Could not update saved homes."),
  });
  const saved = state.data ?? false;
  return (
    <button
      type="button"
      aria-label={
        !isSignedIn
          ? `Sign in to save ${title}`
          : saved
            ? `Remove ${title} from saved homes`
            : `Save ${title}`
      }
      aria-pressed={isSignedIn ? saved : undefined}
      disabled={mutation.isPending}
      onClick={(event) => {
        event.preventDefault();
        event.stopPropagation();
        if (!isSignedIn) void navigate({ to: brand.urls.auth });
        else mutation.mutate(!saved);
      }}
      className={
        className ??
        "relative inline-flex h-7 w-7 items-center justify-center rounded-full border border-border bg-card/95 text-muted-foreground shadow-sm backdrop-blur transition-colors hover:border-primary hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60"
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
