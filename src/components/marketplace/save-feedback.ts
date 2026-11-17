import { toast } from "sonner";

/** Undo is a confirmed, account-bound write, never an optimistic success. */
export function savedFeedback({
  saved,
  title,
  onUndo,
  current,
}: {
  saved: boolean;
  title: string;
  onUndo: () => void;
  current: () => boolean;
}) {
  if (!current()) return;
  toast.success(saved ? "Saved to your favorites" : "Removed from favorites", {
    description: title,
    duration: 4000,
    action: saved
      ? {
          label: "Undo",
          onClick: () => {
            if (current()) onUndo();
          },
        }
      : undefined,
  });
}
