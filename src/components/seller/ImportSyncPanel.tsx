import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getMyImportSync, updateMyImportSync } from "@/lib/seller-claims.functions";
import { toast } from "sonner";
export function ImportSyncPanel() {
  const get = useServerFn(getMyImportSync);
  const save = useServerFn(updateMyImportSync);
  const client = useQueryClient();
  const query = useQuery({ queryKey: ["my-import-sync"], queryFn: () => get() });
  const mutation = useMutation({
    mutationFn: (data: { sellerId: string; enabled: boolean }) => save({ data }),
    onSuccess: () => client.invalidateQueries({ queryKey: ["my-import-sync"] }),
    onError: (e) => toast.error(e.message),
  });
  if (query.isError)
    return (
      <p role="alert" className="text-sm text-destructive">
        Facebook sync settings could not load.{" "}
        <button className="underline" onClick={() => void query.refetch()}>
          Retry
        </button>
      </p>
    );
  if (!query.data?.length) return null;
  return (
    <section className="rounded-2xl border border-border bg-card p-4">
      <h2 className="font-semibold">Facebook listing sync</h2>
      <p className="mt-1 text-sm text-muted-foreground">
        Bluebird can check your imported listings for changes on Facebook. Your conflicting Bluebird
        edits are held for review.
      </p>
      {query.data.map((s) => (
        <div className="mt-3 flex flex-wrap items-center justify-between gap-3" key={s.id}>
          <span className="text-sm">
            {s.display_name} · {s.sync_enabled ? "Sync enabled" : "Sync paused"}
          </span>
          <button
            disabled={mutation.isPending}
            className="btn-secondary"
            onClick={() => mutation.mutate({ sellerId: s.id, enabled: !s.sync_enabled })}
          >
            {s.sync_enabled ? "Pause Facebook sync" : "Resume Facebook sync"}
          </button>
        </div>
      ))}
    </section>
  );
}
