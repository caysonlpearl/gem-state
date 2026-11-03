import { useEffect, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { processPhotoSourceCleanup } from "@/lib/photo-storage.functions";
import {
  removalPlanSchema,
  type PhotoRemovalPlan,
  type PhotoRemovalResult,
} from "@/lib/photo-source-removal";
import {
  runApprovedSourceRemoval,
  photoRemovalSampleEntries,
} from "@/lib/photo-source-removal.browser";

export function PhotoSourceRemoval() {
  const process = useServerFn(processPhotoSourceCleanup);
  const [plan, setPlan] = useState<PhotoRemovalPlan | null>(null);
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const [check, setCheck] = useState<PhotoRemovalResult | null>(null);
  const [progress, setProgress] = useState({ removed: 0, alreadyAbsent: 0, reviewed: 0 });
  const [journal, setJournal] = useState<Awaited<
    ReturnType<typeof runApprovedSourceRemoval>
  > | null>(null);
  const stop = useRef(false),
    generation = useRef(0);
  useEffect(
    () => () => {
      stop.current = true;
      generation.current++;
    },
    [],
  );
  async function choose(file: File | undefined) {
    const current = ++generation.current;
    setPlan(null);
    setCheck(null);
    setJournal(null);
    setError("");
    setProgress({ removed: 0, alreadyAbsent: 0, reviewed: 0 });
    if (!file) return;
    try {
      if (file.size > 64 * 1024 * 1024) throw new Error();
      const parsed = removalPlanSchema.parse(JSON.parse(await file.text()));
      if (current === generation.current) setPlan(parsed);
    } catch {
      if (current === generation.current)
        setError("Choose a valid private removal packet, at most 64 MiB.");
    }
  }
  async function inspect() {
    if (!plan || busy) return;
    setBusy(true);
    setError("");
    setCheck(null);
    try {
      setCheck(
        await process({
          data: { header: plan.header, entries: photoRemovalSampleEntries(plan), mode: "check" },
          signal: AbortSignal.timeout(30000),
        }),
      );
    } catch {
      setError("The read-only batch check did not complete. No removal was requested.");
    } finally {
      setBusy(false);
    }
  }
  async function remove() {
    if (!plan || busy || !check?.removalEnabled || !plan.header.reviewReady || check.gates.length)
      return;
    setBusy(true);
    setError("");
    setJournal(null);
    stop.current = false;
    setProgress({ removed: 0, alreadyAbsent: 0, reviewed: 0 });
    try {
      const result = await runApprovedSourceRemoval({
        plan,
        shouldStop: () => stop.current,
        progress: setProgress,
        step: (data) => process({ data, signal: AbortSignal.timeout(30000) }),
      });
      setJournal(result);
      if (result.status !== "complete")
        setError(
          "Stopped. Download the journal and reconcile the last batch before resuming; do not assume a failed observation means removal failed.",
        );
    } finally {
      setBusy(false);
      setCheck(null);
    }
  }
  function download() {
    if (!plan || !journal) return;
    const blob = new Blob(
      [
        JSON.stringify({
          kind: "photo-source-removal-journal",
          header: plan.header,
          observedAt: new Date().toISOString(),
          ...journal,
        }),
      ],
      { type: "application/json" },
    );
    const url = URL.createObjectURL(blob),
      link = document.createElement("a");
    link.href = url;
    link.download = `bluebird-source-removal-${Date.now()}.json`;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  const button =
    "rounded-lg border border-border bg-background px-3 py-2 text-[12px] font-semibold disabled:opacity-50";
  const gateLabels: Record<string, string> = {
    "retention-cutoff-not-reached": "Waiting for the retention cutoff",
    "post-retention-snapshot-required": "Capture a new source snapshot after the cutoff",
    "fresh-snapshot-required": "Refresh the source snapshot",
    "fresh-runtime-controls-required": "Refresh the server checks after the cutoff",
    "fresh-matching-r2-object-checks-required": "Refresh copy verification after the cutoff",
    "final-reviewed-plan-required": "Load the final reviewed packet",
    "batch-evidence-changed": "Some photos or records changed; review before removal",
    "current-source-recheck-unavailable": "The current source check is unavailable",
    "removal-permit-expired": "The removal window expired",
    "post-removal-verification-unavailable": "Reconcile the last batch before continuing",
    "approved-migration-incomplete": "The approved migration is incomplete",
  };
  return (
    <details className="rounded-xl border border-border bg-card px-4 py-3">
      <summary className="cursor-pointer text-[13px] font-semibold">
        Remove old Supabase photo copies
      </summary>
      <p className="mt-2 text-[12px] leading-relaxed text-muted-foreground">
        Remove only the exact reviewed Supabase copies after retention. Each batch rechecks source
        versions, R2 originals/previews and active photo operations. Listing records and R2 copies
        remain. Removal is disabled without the separate, expiring server permit for this packet and
        administrator.
      </p>
      <label className="mt-3 block text-[12px]">
        Private source-removal packet
        <input
          type="file"
          accept=".json,application/json"
          className="mt-1 block w-full"
          disabled={busy}
          onChange={(event) => void choose(event.target.files?.[0])}
        />
      </label>
      {plan && (
        <div className="mt-3 space-y-1 text-[12px]">
          <p>
            {plan.header.totalObjects.toLocaleString()} source copies ·{" "}
            {(plan.header.totalBytes / 1024 ** 3).toFixed(2)} GiB ·{" "}
            {plan.header.reviewReady
              ? "Final reviewed packet"
              : "Preview only — cannot enable removal"}
          </p>
          <p>
            Retention ends{" "}
            {new Intl.DateTimeFormat("en-US", {
              timeZone: "America/Boise",
              dateStyle: "medium",
              timeStyle: "short",
            }).format(new Date(plan.header.notBefore))}{" "}
            Boise time
          </p>
          <details className="mt-2 break-all">
            <summary className="cursor-pointer">Exact review identifiers</summary>
            <p>Project: {plan.header.projectRef}</p>
            {check?.operatorId && <p>Signed-in operator: {check.operatorId}</p>}
            <p>Removal scope: {plan.header.removalScopeSha256}</p>
            <p>Packet root: {plan.header.rootSha256}</p>
            <p>Source snapshot: {plan.header.sourceCapturedAt}</p>
          </details>
        </div>
      )}
      <div className="mt-3 flex flex-wrap gap-2">
        <button
          type="button"
          className={button}
          disabled={!plan || busy}
          onClick={() => void inspect()}
        >
          Check sample batch only
        </button>
        <button
          type="button"
          className={button}
          disabled={
            !plan?.header.reviewReady || busy || !check?.removalEnabled || !!check.gates.length
          }
          onClick={() => void remove()}
        >
          Remove approved Supabase copies
        </button>
        {busy && (
          <button
            type="button"
            className={button}
            onClick={() => {
              stop.current = true;
            }}
          >
            Stop after current batch
          </button>
        )}
        {journal && (
          <button type="button" className={button} onClick={download}>
            Download removal journal
          </button>
        )}
      </div>
      {check && (
        <p className="mt-3 text-[12px]">
          {
            check.results.filter(
              (row) => row.status === "checked" || row.status === "already-absent",
            ).length
          }{" "}
          copies checked · Removal {check.removalEnabled ? "enabled for this packet" : "disabled"}
          {check.gates.length
            ? ` · ${check.gates.map((gate) => gateLabels[gate] ?? "Review the latest check before continuing").join("; ")}`
            : ""}
        </p>
      )}
      {(busy || progress.reviewed > 0) && (
        <p role="status" className="mt-3 text-[12px]">
          {progress.reviewed.toLocaleString()} reviewed · {progress.removed.toLocaleString()}{" "}
          confirmed removed · {progress.alreadyAbsent.toLocaleString()} already absent
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
