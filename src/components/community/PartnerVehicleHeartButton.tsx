import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useRef } from "react";
import { SavedHeart } from "@/components/marketplace/SavedHeart";
import { savedFeedback } from "@/components/marketplace/save-feedback";
import { toast } from "sonner";

import { useListingSavedState } from "@/hooks/useListingSavedState";
import { brand } from "@/config/brand";
import { useAuth } from "@/hooks/useAuth";
import { setPartnerVehicleSaved } from "@/lib/saved-vehicles.functions";

export function PartnerVehicleHeartButton({
  listingId,
  title,
  className,
}: {
  listingId: string;
  title: string;
  className?: string;
}) {
  const { isSignedIn, user } = useAuth();
  const currentOwner = useRef(user?.id);
  currentOwner.current = user?.id;
  useEffect(() => {
    currentOwner.current = user?.id;
    return () => {
      currentOwner.current = undefined;
    };
  }, [user?.id]);
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const setSaved = useServerFn(setPartnerVehicleSaved);
  const state = useListingSavedState("vehicles", listingId, user?.id);
  const mutation = useMutation({
    mutationFn: async (saved: boolean) => {
      const feedbackOwner = user?.id;
      return { ...(await setSaved({ data: { listingId, saved } })), feedbackOwner };
    },
    onSuccess: async (result) => {
      await queryClient.invalidateQueries({ queryKey: ["partner-vehicle-saved", listingId] });
      await queryClient.invalidateQueries({ queryKey: ["listing-stats"] });
      await queryClient.invalidateQueries({ queryKey: ["my-saved-partner-vehicles"] });
      const owner = result.feedbackOwner;
      savedFeedback({
        saved: result.saved,
        title: title,
        current: () => Boolean(owner) && currentOwner.current === owner,
        onUndo: () => mutation.mutate(false),
      });
    },
    onError: (error) =>
      toast.error(error instanceof Error ? error.message : "Could not update saved vehicles."),
  });
  const saved = state.data ?? false;
  return (
    <button
      type="button"
      aria-label={
        !isSignedIn
          ? `Sign in to save ${title}`
          : saved
            ? `Remove ${title} from saved vehicles`
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
      <SavedHeart saved={saved} />
    </button>
  );
}
