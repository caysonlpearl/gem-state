import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  getPhotoMigrations,
  preparePhotoMigration,
  stepPhotoMigration,
} from "@/lib/photo-migration.functions";
import type { PhotoInventory, PhotoMigrationStatus } from "@/lib/photo-migration";

function size(bytes: number) {
  return `${(bytes / 1024 / 1024).toLocaleString(undefined, { maximumFractionDigits: 2 })} MiB`;
}
function MigrationControls() {
  const list = useServerFn(getPhotoMigrations),
    prepare = useServerFn(preparePhotoMigration),
    step = useServerFn(stepPhotoMigration);
  const runs = useQuery({ queryKey: ["photo-migrations"], queryFn: () => list(), retry: false });
  const [inventory, setInventory] = useState<PhotoInventory | null>(null);
  const [fileError, setFileError] = useState("");
  const [active, setActive] = useState<PhotoMigrationStatus | null>(null);
  const [note, setNote] = useState("");
  const stop = useRef(false);
  useEffect(
    () => () => {
      stop.current = true;
    },
    [],
  );
  const prep = useMutation({
    mutationFn: async () => {
      if (!inventory) throw new Error("Choose the metadata inventory first.");
      return prepare({ data: inventory });
    },
    onSuccess: (value) => {
      setActive(value);
    },
    onSettled: () => {
      void runs.refetch();
    },
  });
  const batch = useMutation({
    mutationFn: async ({ run, retry }: { run: PhotoMigrationStatus; retry: boolean }) => {
      stop.current = false;
      for (let n = 0; n < (retry ? 1 : 25); n++) {
        if (stop.current) break;
        const result = await step({ data: { id: run.id, retry } });
        setActive(result.status);
        if (result.state !== "copied") {
          setNote(
            result.state === "complete"
              ? "The approved range is verified."
              : result.state === "busy"
                ? "Another transfer request is running. Refresh the state after it finishes."
                : result.reason === "retry-limit"
                  ? "This group reached its retry allowance. Review it before making further changes."
                  : "Stopped. Review the transfer state before retrying.",
          );
          return;
        }
      }
      setNote(
        stop.current
          ? "Stopped after the current group."
          : "Batch finished. Review the totals before continuing.",
      );
    },
    onSettled: () => {
      void runs.refetch();
    },
  });
  const selected = active ?? runs.data?.runs[0];
  const busy = prep.isPending || batch.isPending;
  async function load(file: File | undefined) {
    setInventory(null);
    setFileError("");
    if (!file) return;
    try {
      if (file.size > 8 * 1024 * 1024) throw new Error("Inventory review is limited to 8 MiB.");
      const value = JSON.parse(await file.text());
      if (value.schemaVersion !== 1 || !Array.isArray(value.objects))
        throw new Error("Choose the metadata inventory, not the preflight report.");
      setInventory(value);
    } catch (error) {
      setFileError(error instanceof Error ? error.message : "Could not read the inventory.");
    }
  }
  return (
    <div className="mt-4 space-y-4 text-[13px]">
      <p className="text-muted-foreground">
        Prepare a private review from the metadata export. This does not download photos. Copying
        stays disabled until a server permit matches the run, inventory digest, approved group
        range, byte allowance and expiry.
      </p>
      <label className="block font-medium">
        Metadata inventory JSON
        <input
          type="file"
          accept="application/json,.json"
          disabled={busy}
          onChange={(event) => {
            void load(event.target.files?.[0]);
          }}
          className="mt-2 block w-full text-[12px]"
        />
      </label>
      <button
        type="button"
        className="btn-secondary"
        disabled={!inventory || busy}
        onClick={() => prep.mutate()}
      >
        Prepare transfer review
      </button>
      <button
        type="button"
        className="btn-secondary ml-2"
        disabled={busy}
        onClick={() => {
          void runs.refetch();
        }}
      >
        Refresh saved reviews
      </button>
      {(fileError || prep.error || runs.error || batch.error) && (
        <p role="alert" className="text-destructive">
          {fileError || (prep.error ?? runs.error ?? batch.error)?.message}
        </p>
      )}
      {!!runs.data?.runs.length && (
        <label className="block">
          Saved review
          <select
            className="field mt-2 w-full"
            disabled={busy}
            value={selected?.id ?? ""}
            onChange={(event) => {
              setActive(runs.data!.runs.find((run) => run.id === event.target.value) ?? null);
              setNote("");
            }}
          >
            {runs.data.runs.map((run) => (
              <option key={run.id} value={run.id}>
                {run.createdAt.slice(0, 10)} · {run.digest.slice(0, 12)} ·{" "}
                {run.totalGroups.toLocaleString()} groups
              </option>
            ))}
          </select>
        </label>
      )}
      {selected && (
        <>
          <dl className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)] gap-x-4 gap-y-2 rounded-lg border border-border p-4 text-[12px]">
            <dt>Run ID</dt>
            <dd className="break-all">{selected.id}</dd>
            <dt>Source project</dt>
            <dd>{selected.projectRef}</dd>
            <dt>Inventory SHA-256</dt>
            <dd className="break-all">{selected.digest}</dd>
            <dt>Proposed photo downloads</dt>
            <dd>
              {size(selected.totalSourceBytes)} / {selected.totalGroups.toLocaleString()} groups
            </dd>
            <dt>Verified groups</dt>
            <dd>{selected.completedGroups.toLocaleString()}</dd>
            <dt>Failed / running</dt>
            <dd>
              {selected.failedGroups} / {selected.runningGroups}
            </dd>
            <dt>Reserved photo-body allowance</dt>
            <dd>{size(selected.sourceBytesReserved)}</dd>
            <dt>Confirmed successful download bytes</dt>
            <dd>{size(selected.confirmedDownloadBytes)}</dd>
            <dt>Execution</dt>
            <dd>
              {selected.permit
                ? `First ${selected.permit.maxGroups} groups; ${size(selected.permit.maxSourceBytes)} cap; expires ${selected.permit.expiresAt}`
                : "Disabled — no matching server permit"}
            </dd>
            {selected.lastFailure && (
              <>
                <dt>Last stop reason</dt>
                <dd>{selected.lastFailure}</dd>
              </>
            )}
          </dl>
          <p className="text-[12px] text-muted-foreground">
            One group runs at a time. A batch handles at most 25 groups. Reservations include
            interrupted downloads and are not automatically refunded. Metadata traffic is separate;
            these counters are not the provider’s account billing meter. Source photos are retained.
          </p>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              className="btn-primary"
              disabled={!selected.permit || busy || selected.failedGroups > 0}
              onClick={() => {
                setNote("");
                batch.mutate({ run: selected, retry: false });
              }}
            >
              Run approved batch
            </button>
            <button
              type="button"
              className="btn-secondary"
              disabled={!selected.permit || busy || selected.failedGroups === 0}
              onClick={() => batch.mutate({ run: selected, retry: true })}
            >
              Retry failed group
            </button>
            {batch.isPending && (
              <button
                type="button"
                className="btn-secondary"
                onClick={() => {
                  stop.current = true;
                  setNote("The current group will finish, then stop.");
                }}
              >
                Stop after current group
              </button>
            )}
            <button
              type="button"
              className="btn-secondary"
              disabled={busy}
              onClick={() => {
                void runs.refetch().then((value) => {
                  const updated = value.data?.runs.find((run) => run.id === selected.id);
                  if (updated) setActive(updated);
                });
              }}
            >
              Refresh state
            </button>
          </div>
        </>
      )}
      {note && <p role="status">{note}</p>}
    </div>
  );
}
export function PhotoMigrationRunner() {
  const [open, setOpen] = useState(false);
  return (
    <section className="rounded-xl border border-border bg-card px-4 py-3">
      <button
        type="button"
        aria-expanded={open}
        className="text-[13px] font-semibold"
        onClick={() => setOpen(!open)}
      >
        Photo transfer review
      </button>
      {open && <MigrationControls />}
    </section>
  );
}
