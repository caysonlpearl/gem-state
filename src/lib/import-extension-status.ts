export type ImportRunStatus = {
  label: string;
  startedAt: number;
  message: string;
  sourceProfileUrl?: string;
  done: number | null;
  total: number | null;
};

/** Observe the existing extension run. Polling never opens pages or starts a scan. */
export function watchImportRun(target: Window, update: (run: ImportRunStatus | null) => void) {
  const request = () => target.postMessage({ type: "gemlist-ext-status" }, target.location.origin);
  const onMessage = (event: MessageEvent) => {
    if (event.source !== target || event.origin !== target.location.origin) return;
    const data = event.data;
    if (data?.type !== "gemlist-ext-status-result") return;
    const run = data.run;
    if (run === null) update(null);
    else if (
      run &&
      typeof run.label === "string" &&
      typeof run.message === "string" &&
      Number.isFinite(run.startedAt)
    ) {
      update({
        label: run.label,
        message: run.message,
        startedAt: run.startedAt,
        ...(typeof run.sourceProfileUrl === "string"
          ? { sourceProfileUrl: run.sourceProfileUrl }
          : {}),
        done: Number.isFinite(run.done) ? run.done : null,
        total: Number.isFinite(run.total) ? run.total : null,
      });
    }
  };
  target.addEventListener("message", onMessage);
  request();
  const timer = target.setInterval(request, 3000);
  return () => {
    target.clearInterval(timer);
    target.removeEventListener("message", onMessage);
  };
}

export function supportsImportRunStatus(version: string) {
  const [major, minor, patch] = version.split(".").map(Number);
  return major > 1 || (major === 1 && (minor > 5 || (minor === 5 && patch >= 12)));
}
