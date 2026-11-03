import { useEffect, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { checkPhotoCleanupTargets } from "@/lib/photo-storage.functions";
import { runPhotoCleanupChecks } from "@/lib/photo-source-cleanup.browser";
import {
  cleanupSnapshotTargets,
  parseCleanupSnapshot,
  type CleanupSnapshot,
  type CleanupObjectCheck,
  type CleanupControls,
} from "@/lib/photo-source-cleanup";

export function PhotoSourceCleanupCheck() {
  const probe = useServerFn(checkPhotoCleanupTargets);
  const [snapshot, setSnapshot] = useState<CleanupSnapshot | null>(null);
  const [fileName, setFileName] = useState("");
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState({ checked: 0, verified: 0 });
  const [output, setOutput] = useState<{
    controls: CleanupControls;
    targetChecks: CleanupObjectCheck[];
  } | null>(null);
  const [error, setError] = useState("");
  const stop = useRef(false);
  const loading = useRef(0);
  useEffect(
    () => () => {
      stop.current = true;
      loading.current++;
    },
    [],
  );
  const targets = snapshot ? cleanupSnapshotTargets(snapshot) : [];
  async function choose(file: File | undefined) {
    const load = ++loading.current;
    setSnapshot(null);
    setOutput(null);
    setError("");
    setProgress({ checked: 0, verified: 0 });
    if (!file) return;
    try {
      if (file.size > 64 * 1024 * 1024) throw new Error("Snapshot exceeds 64 MiB.");
      const value = parseCleanupSnapshot(JSON.parse(await file.text()));
      if (load !== loading.current) return;
      if (!cleanupSnapshotTargets(value).length)
        throw new Error("No completed migration photos with receipts were found.");
      setSnapshot(value);
      setFileName(file.name);
    } catch {
      if (load === loading.current)
        setError("Choose a valid private cleanup snapshot JSON file, at most 64 MiB.");
    }
  }
  async function run() {
    if (!snapshot || busy) return;
    stop.current = false;
    setBusy(true);
    setError("");
    setOutput(null);
    setProgress({ checked: 0, verified: 0 });
    try {
      const result = await runPhotoCleanupChecks({
        projectRef: snapshot.projectRef,
        targets,
        probe: (data) => probe({ data, signal: AbortSignal.timeout(20_000) }),
        shouldStop: () => stop.current,
        progress: setProgress,
      });
      if (result.controls) setOutput({ controls: result.controls, targetChecks: result.checks });
      if (result.status === "stopped")
        setError(
          "Stopped after the current read-only batch. Completed checks are retained in the download.",
        );
      if (result.status === "unverified")
        setError(
          "Some copies could not be verified. Checks stopped; download the partial snapshot for review.",
        );
      if (result.status === "error")
        setError(
          "Could not finish the checks. Completed checks are retained; review the partial snapshot before retrying.",
        );
    } catch {
      setError(
        "Could not finish the checks. Completed checks are retained; review the partial snapshot before retrying.",
      );
    } finally {
      setBusy(false);
    }
  }
  function download() {
    if (!snapshot || !output) return;
    const blob = new Blob([JSON.stringify({ ...snapshot, ...output })], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob),
      link = document.createElement("a");
    link.href = url;
    link.download = `bluebird-cleanup-checked-${new Date().toISOString().replace(/[:.]/g, "-")}.json`;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  return (
    <details className="rounded-xl border border-border bg-card px-4 py-3">
      <summary className="cursor-pointer text-[13px] font-semibold">
        Read-only cleanup verification
      </summary>
      <p className="mt-2 text-[12px] leading-relaxed text-muted-foreground">
        Choose the private SQL snapshot to check stored R2 originals and previews in small batches.
        This checks headers only, uses no marketplace API allowance, and never copies or deletes
        photos. Completed checks can be downloaded for the local review tool. Retention and separate
        deletion approval still apply.
      </p>
      <label className="mt-3 block text-[12px]">
        Cleanup snapshot JSON
        <input
          className="mt-1 block w-full"
          type="file"
          accept=".json,application/json"
          disabled={busy}
          onChange={(event) => void choose(event.target.files?.[0])}
        />
      </label>
      {snapshot && (
        <p className="mt-2 text-[12px]">
          {fileName} · {targets.length.toLocaleString()} stored copies to check
        </p>
      )}
      <div className="mt-3 flex flex-wrap gap-2">
        <button
          type="button"
          className="btn-secondary"
          disabled={!snapshot || busy}
          onClick={() => void run()}
        >
          {busy ? "Checking R2 copies…" : "Verify R2 copies"}
        </button>
        {busy && (
          <button
            type="button"
            className="btn-secondary"
            onClick={() => {
              stop.current = true;
            }}
          >
            Stop after this batch
          </button>
        )}
        {output && !busy && (
          <button type="button" className="btn-secondary" onClick={download}>
            Download checked snapshot
          </button>
        )}
      </div>
      {(busy || progress.checked > 0) && (
        <p role="status" className="mt-3 text-[12px]">
          {progress.checked.toLocaleString()} of {targets.length.toLocaleString()} checked ·{" "}
          {progress.verified.toLocaleString()} verified
        </p>
      )}
      {error && (
        <p role="alert" className="mt-3 text-[12px] text-destructive">
          {error}
        </p>
      )}
    </details>
  );
}
