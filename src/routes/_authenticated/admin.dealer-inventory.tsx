import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { dealerInventoryFeedV1 } from "@/config/dealer-inventory-sample";
import {
  applyDealerInventoryFeed,
  createDealerInventorySource,
  getDealerInventorySources,
  getDealerInventorySyncRuns,
  previewDealerInventoryFeed,
  setDealerInventorySourceStatus,
} from "@/lib/dealer-inventory.functions";

export const Route = createFileRoute("/_authenticated/admin/dealer-inventory")({
  head: () => ({
    meta: [
      { title: "Dealer inventory feeds · Gem State Classifieds" },
      { name: "description", content: "Import and validate dealership inventory feeds." },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: DealerInventoryPage,
});

type PreviewResult = Awaited<ReturnType<typeof previewDealerInventoryFeed>>;

function DealerInventoryPage() {
  const queryClient = useQueryClient();
  const fetchSources = useServerFn(getDealerInventorySources);
  const createSource = useServerFn(createDealerInventorySource);
  const fetchSyncRuns = useServerFn(getDealerInventorySyncRuns);
  const previewFeed = useServerFn(previewDealerInventoryFeed);
  const applyFeed = useServerFn(applyDealerInventoryFeed);
  const setSourceStatus = useServerFn(setDealerInventorySourceStatus);
  const { data: sources, isLoading } = useQuery({
    queryKey: ["dealer-inventory-sources"],
    queryFn: () => fetchSources(),
  });
  const [name, setName] = useState("Mock dealership feed");
  const [providerName, setProviderName] = useState(
    "Mock source — replace when a dealer is available",
  );
  const [feedUrl, setFeedUrl] = useState("");
  const [schedule, setSchedule] = useState("");
  const [mappingJson, setMappingJson] = useState("");
  const [sourceId, setSourceId] = useState("");
  const [csv, setCsv] = useState("");
  const [filename, setFilename] = useState("dealership-inventory.csv");
  const [preview, setPreview] = useState<PreviewResult | null>(null);

  const selectedSourceId = sourceId || sources?.[0]?.id || "";
  const selectedSource = useMemo(
    () => sources?.find((source) => source.id === selectedSourceId) ?? null,
    [selectedSourceId, sources],
  );
  const { data: syncRuns, isLoading: syncRunsLoading } = useQuery({
    queryKey: ["dealer-inventory-sync-runs", selectedSourceId],
    queryFn: () => fetchSyncRuns({ data: { sourceId: selectedSourceId } }),
    enabled: Boolean(selectedSourceId),
  });

  const createMutation = useMutation({
    mutationFn: () => {
      let mappingProfile: Record<string, string> = {};
      if (mappingJson.trim()) {
        const parsed: unknown = JSON.parse(mappingJson);
        if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
          throw new Error("Field mapping must be a JSON object.");
        }
        mappingProfile = parsed as Record<string, string>;
      }
      return createSource({
        data: {
          name,
          providerName: providerName || null,
          sourceType: "manual_upload",
          fileFormat: "csv",
          feedUrl: feedUrl || null,
          schedule: schedule || null,
          minimumRowCount: 1,
          deactivationGraceRuns: 2,
          mappingProfile,
        },
      });
    },
    onSuccess: async (source) => {
      setSourceId(source.id);
      await queryClient.invalidateQueries({ queryKey: ["dealer-inventory-sources"] });
      toast.success("Inventory source created.");
    },
    onError: (error) =>
      toast.error(error instanceof Error ? error.message : "Could not create source."),
  });

  const previewMutation = useMutation({
    mutationFn: () => {
      if (!selectedSourceId) throw new Error("Create or select an inventory source first.");
      if (!csv.trim()) throw new Error("Paste a CSV feed or load the sample feed first.");
      return previewFeed({ data: { sourceId: selectedSourceId, csv, filename, dryRun: true } });
    },
    onSuccess: (result) => {
      setPreview(result);
      toast.success("Feed preview ready.");
    },
    onError: (error) =>
      toast.error(error instanceof Error ? error.message : "Could not preview feed."),
  });

  const statusMutation = useMutation({
    mutationFn: (status: "active" | "paused") => {
      if (!selectedSourceId) throw new Error("Select an inventory source first.");
      return setSourceStatus({ data: { sourceId: selectedSourceId, status } });
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["dealer-inventory-sources"] });
      toast.success("Inventory source status updated.");
    },
    onError: (error) =>
      toast.error(error instanceof Error ? error.message : "Could not update source status."),
  });

  const applyMutation = useMutation({
    mutationFn: () => {
      if (!selectedSourceId) throw new Error("Create or select an inventory source first.");
      if (!csv.trim()) throw new Error("Paste a CSV feed or load the sample feed first.");
      return applyFeed({ data: { sourceId: selectedSourceId, csv, filename, dryRun: false } });
    },
    onSuccess: async (result) => {
      setPreview(null);
      await queryClient.invalidateQueries({ queryKey: ["dealer-inventory-sources"] });
      toast.success(
        `Feed applied: ${result.createdCount ?? 0} created, ${result.updatedCount ?? 0} updated.`,
      );
    },
    onError: (error) =>
      toast.error(error instanceof Error ? error.message : "Could not apply feed."),
  });

  if (isLoading)
    return (
      <p className="mx-auto max-w-[1000px] px-4 py-10 text-[13px] text-muted-foreground">
        Loading…
      </p>
    );

  return (
    <main className="mx-auto max-w-[1100px] space-y-6 px-4 py-10 sm:px-6">
      <header>
        <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
          Operations
        </p>
        <h1 className="mt-1 text-[24px] font-semibold tracking-tight">Dealer inventory feeds</h1>
        <p className="mt-2 max-w-[780px] text-[13px] leading-relaxed text-muted-foreground">
          Provider-neutral CSV intake for the dealership integration foundation. Imported records
          stay in the inventory layer until a future moderation step links them to public GemList
          listings.
        </p>
      </header>

      <section className="grid gap-6 lg:grid-cols-[320px_1fr]">
        <div className="space-y-4 rounded-lg border border-border bg-card p-4">
          <div>
            <h2 className="text-[14px] font-semibold">Inventory source</h2>
            <p className="mt-1 text-[12px] text-muted-foreground">
              Create a temporary source now; replace its provider details when a real dealership is
              available.
            </p>
          </div>
          {sources && sources.length > 0 ? (
            <label className="block text-[12px] font-medium">
              Existing source
              <select
                value={selectedSourceId}
                onChange={(event) => setSourceId(event.target.value)}
                className="mt-1 h-9 w-full rounded-md border border-input bg-background px-2 text-[12px]"
              >
                {sources.map((source) => (
                  <option key={source.id} value={source.id}>
                    {source.name}
                  </option>
                ))}
              </select>
            </label>
          ) : null}
          <label className="block text-[12px] font-medium">
            Source name
            <Input
              value={name}
              onChange={(event) => setName(event.target.value)}
              className="mt-1"
            />
          </label>
          <label className="block text-[12px] font-medium">
            Provider note
            <Input
              value={providerName}
              onChange={(event) => setProviderName(event.target.value)}
              className="mt-1"
            />
          </label>
          <label className="block text-[12px] font-medium">
            Feed URL (future HTTPS source)
            <Input
              value={feedUrl}
              onChange={(event) => setFeedUrl(event.target.value)}
              placeholder="https://…"
              className="mt-1"
            />
          </label>
          <label className="block text-[12px] font-medium">
            Schedule note
            <Input
              value={schedule}
              onChange={(event) => setSchedule(event.target.value)}
              placeholder="For example: daily at 2 AM"
              className="mt-1"
            />
          </label>
          <label className="block text-[12px] font-medium">
            Column mapping JSON (optional)
            <Textarea
              value={mappingJson}
              onChange={(event) => setMappingJson(event.target.value)}
              rows={3}
              placeholder={'{"stock_number":"DealerStockNo","vin":"VIN"}'}
              className="mt-1 font-mono text-[11px]"
            />
          </label>
          <Button
            type="button"
            variant="outline"
            onClick={() => createMutation.mutate()}
            disabled={createMutation.isPending}
            className="w-full"
          >
            {createMutation.isPending ? "Creating…" : "Create source"}
          </Button>
          {selectedSource ? (
            <div className="space-y-2 text-[11px] text-muted-foreground">
              <p>
                Status: {selectedSource.status} · Format: {selectedSource.file_format.toUpperCase()}
              </p>
              {selectedSource.last_success_at ? (
                <p>
                  Last successful sync: {new Date(selectedSource.last_success_at).toLocaleString()}
                </p>
              ) : null}
              {selectedSource.last_error ? (
                <p className="text-destructive">Last error: {selectedSource.last_error}</p>
              ) : null}
              <div className="flex gap-2">
                {selectedSource.status === "paused" ? (
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() => statusMutation.mutate("active")}
                    disabled={statusMutation.isPending}
                  >
                    Reactivate source
                  </Button>
                ) : (
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() => statusMutation.mutate("paused")}
                    disabled={statusMutation.isPending}
                  >
                    Pause source
                  </Button>
                )}
              </div>
            </div>
          ) : null}
        </div>

        <div className="space-y-4 rounded-lg border border-border bg-card p-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="text-[14px] font-semibold">CSV feed</h2>
              <p className="mt-1 text-[12px] text-muted-foreground">
                Use the sample dealership feed to test create, update, sold, and photo behavior.
              </p>
            </div>
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={() => setCsv(dealerInventoryFeedV1)}
            >
              Load sample feed
            </Button>
          </div>
          <label className="block text-[12px] font-medium">
            Upload CSV file
            <Input
              type="file"
              accept=".csv,text/csv"
              className="mt-1 cursor-pointer text-[12px]"
              onChange={async (event) => {
                const file = event.target.files?.[0];
                if (!file) return;
                setFilename(file.name);
                setCsv(await file.text());
                setPreview(null);
              }}
            />
          </label>
          <Input
            value={filename}
            onChange={(event) => setFilename(event.target.value)}
            aria-label="Feed filename"
          />
          <Textarea
            value={csv}
            onChange={(event) => setCsv(event.target.value)}
            rows={15}
            placeholder="Paste a dealership CSV feed here…"
            className="font-mono text-[11px]"
          />
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => previewMutation.mutate()}
              disabled={previewMutation.isPending || !selectedSourceId}
            >
              {previewMutation.isPending ? "Previewing…" : "Preview feed"}
            </Button>
            <Button
              type="button"
              onClick={() => applyMutation.mutate()}
              disabled={
                applyMutation.isPending || !selectedSourceId || !preview || preview.rejected
              }
            >
              {applyMutation.isPending ? "Applying…" : "Apply valid rows"}
            </Button>
          </div>
        </div>
      </section>

      {selectedSourceId ? (
        <section className="space-y-3 rounded-lg border border-border bg-card p-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-[14px] font-semibold">Sync health</h2>
              <p className="mt-1 text-[12px] text-muted-foreground">
                Every applied feed is recorded so changes can be traced back to a specific file and
                run.
              </p>
            </div>
            <span className="rounded-full bg-secondary px-2 py-1 text-[11px]">
              {syncRuns?.length ?? 0} recorded run{syncRuns?.length === 1 ? "" : "s"}
            </span>
          </div>
          {syncRunsLoading ? (
            <p className="text-[12px] text-muted-foreground">Loading sync history…</p>
          ) : syncRuns && syncRuns.length > 0 ? (
            <div className="overflow-x-auto rounded-md border border-border">
              <table className="w-full min-w-[760px] text-left text-[11px]">
                <thead className="bg-secondary/50">
                  <tr>
                    <th className="px-3 py-2">Started</th>
                    <th className="px-3 py-2">File</th>
                    <th className="px-3 py-2">Status</th>
                    <th className="px-3 py-2">Rows</th>
                    <th className="px-3 py-2">Changes</th>
                    <th className="px-3 py-2">Errors</th>
                  </tr>
                </thead>
                <tbody>
                  {syncRuns.slice(0, 10).map((run) => (
                    <tr key={run.id} className="border-t border-border">
                      <td className="px-3 py-2">{new Date(run.started_at).toLocaleString()}</td>
                      <td className="px-3 py-2 font-mono">{run.source_filename || "—"}</td>
                      <td className="px-3 py-2">{run.status}</td>
                      <td className="px-3 py-2">
                        {run.valid_row_count}/{run.received_row_count}
                      </td>
                      <td className="px-3 py-2">
                        +{run.created_count} · {run.updated_count} updated · {run.stale_count} stale
                      </td>
                      <td className="px-3 py-2">{run.invalid_row_count}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="rounded-md border border-dashed border-border px-3 py-4 text-[12px] text-muted-foreground">
              No syncs yet. Preview the sample feed, then apply it to create the first traceable
              run.
            </p>
          )}
        </section>
      ) : null}

      {preview ? (
        <section className="space-y-4 rounded-lg border border-border bg-card p-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-[14px] font-semibold">Preview</h2>
              <p className="mt-1 text-[12px] text-muted-foreground">
                Invalid rows are quarantined; only valid rows can be applied.
              </p>
            </div>
            <div className="flex flex-wrap gap-2 text-[11px]">
              <span className="rounded-full bg-secondary px-2 py-1">
                Received {preview.receivedRowCount}
              </span>
              <span className="rounded-full bg-secondary px-2 py-1">
                Valid {preview.validRowCount}
              </span>
              <span className="rounded-full bg-secondary px-2 py-1">
                Errors {preview.invalidRowCount}
              </span>
            </div>
          </div>
          {preview.rejectReason ? (
            <p className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-[12px] text-destructive">
              {preview.rejectReason}
            </p>
          ) : null}
          <div className="grid gap-2 sm:grid-cols-4">
            {(
              [
                ["New", preview.diff.created],
                ["Updated", preview.diff.updated],
                ["Unchanged", preview.diff.unchanged],
                ["Would become stale", preview.diff.stale],
              ] as const
            ).map(([label, count]) => (
              <div key={label} className="rounded-md border border-border p-3">
                <p className="text-[11px] text-muted-foreground">{label}</p>
                <p className="mt-1 text-[18px] font-semibold">{count}</p>
              </div>
            ))}
          </div>
          {preview.errors.length > 0 ? (
            <div className="rounded-md border border-amber-300/40 bg-amber-50/60 p-3">
              <h3 className="text-[12px] font-semibold">Quarantined row errors</h3>
              <ul className="mt-2 space-y-1 text-[11px] text-muted-foreground">
                {preview.errors.slice(0, 8).map((error, index) => (
                  <li key={`${error.rowNumber}-${index}`}>
                    Row {error.rowNumber}
                    {error.field ? ` · ${error.field}` : ""}: {error.message}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
          <div className="overflow-x-auto rounded-md border border-border">
            <table className="w-full min-w-[640px] text-left text-[11px]">
              <thead className="bg-secondary/50">
                <tr>
                  <th className="px-3 py-2">Key</th>
                  <th className="px-3 py-2">Vehicle</th>
                  <th className="px-3 py-2">Price</th>
                  <th className="px-3 py-2">Status</th>
                  <th className="px-3 py-2">Photos</th>
                </tr>
              </thead>
              <tbody>
                {preview.preview.map((row) => (
                  <tr key={row.sourceRecordKey} className="border-t border-border">
                    <td className="px-3 py-2 font-mono">{row.sourceRecordKey}</td>
                    <td className="px-3 py-2">{row.title}</td>
                    <td className="px-3 py-2">
                      $
                      {(row.priceCents / 100).toLocaleString(undefined, {
                        minimumFractionDigits: 2,
                      })}
                    </td>
                    <td className="px-3 py-2">{row.inventoryStatus}</td>
                    <td className="px-3 py-2">{row.photoCount}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}
    </main>
  );
}
