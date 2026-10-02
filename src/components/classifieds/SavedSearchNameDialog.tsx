import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

type SavedSearchNameDialogProps = {
  open: boolean;
  name: string;
  mode: "create" | "rename";
  pending?: boolean;
  onOpenChange: (open: boolean) => void;
  onNameChange: (name: string) => void;
  onSubmit: () => void;
};

export function SavedSearchNameDialog({
  open,
  name,
  mode,
  pending = false,
  onOpenChange,
  onNameChange,
  onSubmit,
}: SavedSearchNameDialogProps) {
  const create = mode === "create";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="rounded-2xl border-border sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{create ? "Save this search" : "Rename saved search"}</DialogTitle>
          <DialogDescription>
            {create
              ? "Give this filter set a name so you can reopen it later and receive matching-listing alerts."
              : "Choose a short name that makes this saved search easy to find."}
          </DialogDescription>
        </DialogHeader>
        <form
          className="space-y-4"
          onSubmit={(event) => {
            event.preventDefault();
            onSubmit();
          }}
        >
          <label className="block text-[12.5px] font-semibold" htmlFor="saved-search-name">
            Search name
            <input
              id="saved-search-name"
              value={name}
              onChange={(event) => onNameChange(event.target.value)}
              className="field mt-2 w-full"
              placeholder="e.g. AWD SUVs under $30k"
              maxLength={80}
              autoFocus
              required
            />
          </label>
          <DialogFooter>
            <button
              type="button"
              className="h-10 rounded-xl border border-input px-4 text-[12.5px] font-semibold hover:bg-secondary"
              onClick={() => onOpenChange(false)}
              disabled={pending}
            >
              Cancel
            </button>
            <button
              type="submit"
              className="h-10 rounded-xl bg-primary px-4 text-[12.5px] font-semibold text-primary-foreground hover:opacity-90 disabled:opacity-60"
              disabled={pending || !name.trim()}
            >
              {pending ? "Saving…" : create ? "Save search" : "Rename search"}
            </button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
