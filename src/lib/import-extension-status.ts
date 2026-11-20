export type ImportRunStatus = {
  label: string;
  startedAt: number;
  message: string;
  sourceProfileUrl?: string;
  done: number | null;
  total: number | null;
};

/** Observe the existing extension run. Polling never opens pages or starts a scan. */
export function watchImportRun(
  target: Window,
  update: (run: ImportRunStatus | null, journal?: ImportJournal) => void,
) {
  const request = () => target.postMessage({ type: "gemlist-ext-status" }, target.location.origin);
  const onMessage = (event: MessageEvent) => {
    if (event.source !== target || event.origin !== target.location.origin) return;
    const data = event.data;
    if (data?.type !== "gemlist-ext-status-result") return;
    const run = data.run;
    const journal =
      Array.isArray(data.pending) || data.journalError === true
        ? {
            last: data.last ?? null,
            pending: data.pending ?? [],
            journalError: data.journalError === true,
          }
        : undefined;
    if (run === null) update(null, journal);
    else if (
      run &&
      typeof run.label === "string" &&
      typeof run.message === "string" &&
      Number.isFinite(run.startedAt)
    ) {
      update(
        {
          label: run.label,
          message: run.message,
          startedAt: run.startedAt,
          ...(typeof run.sourceProfileUrl === "string"
            ? { sourceProfileUrl: run.sourceProfileUrl }
            : {}),
          done: Number.isFinite(run.done) ? run.done : null,
          total: Number.isFinite(run.total) ? run.total : null,
        },
        journal,
      );
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

export function supportsImportRunStatus(version: string, minimumPatch = 12) {
  const [major, minor, patch] = version.split(".").map(Number);
  return major > 1 || (major === 1 && (minor > 5 || (minor === 5 && patch >= minimumPatch)));
}

export type PendingImportReport = { requestId: string; sourceProfileUrl: string };
export type ImportJournal = {
  last: {
    requestId: string;
    phase: "running" | "completed" | "partial" | "interrupted" | "failed";
    startedAt: number;
    done: number;
    total: number;
    incomplete: number;
    staged?: number;
    updated?: number;
    message?: string;
  } | null;
  pending: PendingImportReport[];
  journalError?: boolean;
};

export function requestImportReport<T>(
  type: "gemlist-ext-report" | "gemlist-ext-saved",
  entry: PendingImportReport & { staged?: number; updated?: number },
): Promise<{ report?: T | null; saved?: boolean }> {
  return new Promise((resolve, reject) => {
    const token = crypto.randomUUID();
    const origin = window.location.origin;
    const cleanup = () => {
      clearTimeout(timeout);
      window.removeEventListener("message", receive);
    };
    function receive(event: MessageEvent) {
      if (
        event.source !== window ||
        event.origin !== origin ||
        event.data?.type !== "gemlist-ext-journal-result" ||
        event.data.token !== token
      )
        return;
      cleanup();
      if (event.data.journalError)
        reject(new Error("Chrome could not read or save scan recovery data."));
      else resolve(event.data);
    }
    const timeout = setTimeout(() => {
      cleanup();
      reject(new Error("Chrome did not respond. Check the import extension connection."));
    }, 15000);
    window.addEventListener("message", receive);
    window.postMessage({ ...entry, type, token }, origin);
  });
}
