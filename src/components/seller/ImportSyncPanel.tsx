import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getMyImportSync, updateMyImportSync } from "@/lib/seller-claims.functions";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
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
        <div className="mt-3" key={s.id}>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <span className="text-sm">
              {s.display_name} · {s.sync_enabled ? "Sync enabled" : "Sync paused"}
            </span>
            <Button
              disabled={mutation.isPending}
              variant="outline"
              className="min-h-11"
              onClick={() => mutation.mutate({ sellerId: s.id, enabled: !s.sync_enabled })}
            >
              {s.sync_enabled ? "Pause Facebook sync" : "Resume Facebook sync"}
            </Button>
          </div>
          {s.pendingListings.length > 0 && (
            <div className="mt-3 space-y-2">
              <p className="text-sm text-muted-foreground">
                Being prepared by Bluebird. These imports will appear with your other listings after
                submission and review.
              </p>
              {s.pendingListings.map((item) => (
                <div
                  key={item.id}
                  className="flex items-center gap-3 rounded-xl border border-border p-3"
                >
                  {item.imageUrl && (
                    <img src={item.imageUrl} alt="" className="h-12 w-12 rounded-lg object-cover" />
                  )}
                  <span className="min-w-0 break-words text-sm">{item.title}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      ))}
    </section>
  );
}
