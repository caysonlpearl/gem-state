import { useQuery, useQueryClient, type QueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { createSavedStateBatcher } from "@/lib/saved-state-batcher";
import { getSavedListingStates } from "@/lib/saved-state.functions";
import type { SavedStateKind } from "@/lib/saved-state-contract";

const readers = new WeakMap<QueryClient, Map<string, ReturnType<typeof createSavedStateBatcher>>>();
const keys: Record<SavedStateKind, string> = {
  products: "product-watch-state",
  jobs: "partner-job-saved",
  homes: "partner-home-saved",
  vehicles: "partner-vehicle-saved",
};

export function useListingSavedState(
  kind: SavedStateKind,
  id: string,
  viewerId: string | undefined,
  enabled = true,
) {
  const client = useQueryClient();
  const fetchStates = useServerFn(getSavedListingStates);
  return useQuery({
    // Keep the old per-listing prefix so existing mutation invalidations and
    // detail controls still work, and isolate state when the account changes.
    queryKey: [keys[kind], id, viewerId ?? "signed-out"],
    enabled: Boolean(viewerId) && enabled,
    staleTime: 5 * 60_000,
    refetchOnWindowFocus: false,
    retry: false,
    queryFn: async () => {
      if (!viewerId) return false;
      let scoped = readers.get(client);
      if (!scoped) {
        scoped = new Map();
        readers.set(client, scoped);
      }
      const key = `${viewerId}:${kind}`;
      let read = scoped.get(key);
      if (!read) {
        read = createSavedStateBatcher((ids) => fetchStates({ data: { kind, ids, viewerId } }));
        scoped.set(key, read);
      }
      return read(id);
    },
  });
}
