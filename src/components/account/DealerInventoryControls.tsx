import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import {
  setDealerInventoryVisibility,
  reportDealerInventoryDetails,
} from "@/lib/dealer-inventory-controls.functions";
import type { DealerAccountInventory } from "@/lib/dealer-onboarding.functions";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

type Action = "hidden" | "sold" | "visible" | "report";
const labels: Record<Action, string> = {
  hidden: "Hide vehicle",
  sold: "Mark sold",
  visible: "Restore vehicle",
  report: "Report incorrect details",
};
export function DealerInventoryControls({
  record,
  preview = false,
}: {
  record: DealerAccountInventory["records"][number];
  preview?: boolean;
}) {
  const [action, setAction] = useState<Action | null>(null);
  const [reason, setReason] = useState("");
  const client = useQueryClient();
  const setVisibility = useServerFn(setDealerInventoryVisibility);
  const report = useServerFn(reportDealerInventoryDetails);
  const mutation = useMutation({
    mutationFn: async () => {
      if (preview || !action) throw Error("This preview cannot save inventory changes.");
      return action === "report"
        ? report({ data: { recordId: record.id, details: reason } })
        : setVisibility({ data: { recordId: record.id, visibility: action, reason } });
    },
    onSuccess: async () => {
      toast.success(
        action === "report"
          ? "Report submitted to Bluebird for review."
          : action === "visible"
            ? "Dealer hold removed. Feed availability and moderation still apply."
            : action === "sold"
              ? "Vehicle marked sold and hidden from Bluebird."
              : "Vehicle hidden from Bluebird.",
      );
      setAction(null);
      setReason("");
      await Promise.all([
        client.invalidateQueries({ queryKey: ["my-dealer-inventory"] }),
        client.invalidateQueries({ queryKey: ["dealer-performance"] }),
      ]);
    },
    onError: (error) =>
      toast.error(error instanceof Error ? error.message : "Could not update inventory."),
  });
  const open = (value: Action) => {
    setReason("");
    mutation.reset();
    setAction(value);
  };
  const suppressed = record.dealerVisibility === "hidden" || record.dealerVisibility === "sold";
  return (
    <>
      <div
        className="flex flex-wrap gap-x-3 gap-y-2 text-xs font-semibold text-primary"
        aria-label={`Manage ${record.title}`}
      >
        {suppressed ? (
          <button type="button" onClick={() => open("visible")} className="hover:underline">
            Restore
          </button>
        ) : (
          <>
            <button type="button" onClick={() => open("hidden")} className="hover:underline">
              Hide
            </button>
            <button type="button" onClick={() => open("sold")} className="hover:underline">
              Mark sold
            </button>
          </>
        )}
        <button type="button" onClick={() => open("report")} className="hover:underline">
          {record.detailReportOpen ? "Update report" : "Report details"}
        </button>
      </div>
      <Dialog
        open={Boolean(action)}
        onOpenChange={(value) => {
          if (!value && !mutation.isPending) setAction(null);
        }}
      >
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle>{action ? labels[action] : "Manage inventory"}</DialogTitle>
            <DialogDescription>{record.title}</DialogDescription>
          </DialogHeader>
          <p className="text-sm leading-relaxed text-muted-foreground">
            {action === "report"
              ? "Tell Bluebird what is incorrect. Reporting does not change the listing or its visibility. Prices and photos should be corrected in your inventory feed."
              : action === "visible"
                ? "Remove your dealership’s hold. The vehicle appears only if it is still available in the feed and passes Bluebird’s listing checks."
                : "This vehicle will be hidden from Bluebird until you restore it. Feed refreshes will not undo this choice. Your feed’s prices, photos, and availability remain unchanged."}
          </p>
          <form
            onSubmit={(event) => {
              event.preventDefault();
              if (!preview) mutation.mutate();
            }}
            className="space-y-4"
          >
            <label className="block text-sm font-medium">
              {action === "report" ? "What needs correcting?" : "Note (optional)"}
              <textarea
                value={reason}
                onChange={(event) => setReason(event.target.value)}
                required={action === "report"}
                minLength={action === "report" ? 5 : undefined}
                maxLength={500}
                rows={3}
                className="mt-2 w-full rounded-xl border border-input bg-background p-3 text-sm"
              />
            </label>
            {preview ? (
              <p className="text-xs text-muted-foreground">
                Preview only. No inventory changes or reports will be saved.
              </p>
            ) : null}
            {mutation.error ? (
              <p role="alert" className="text-sm text-destructive">
                {mutation.error.message}
              </p>
            ) : null}
            <div className="flex justify-end gap-2">
              <button
                type="button"
                disabled={mutation.isPending}
                onClick={() => setAction(null)}
                className="rounded-full border border-input px-4 py-2 text-sm"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={
                  preview || mutation.isPending || (action === "report" && reason.trim().length < 5)
                }
                className="rounded-full bg-primary px-5 py-2 text-sm font-semibold text-primary-foreground disabled:opacity-50"
              >
                {mutation.isPending ? "Saving…" : action ? labels[action] : "Save"}
              </button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
