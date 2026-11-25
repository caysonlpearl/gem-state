export type ImportRunStatus = {
  label: string;
  requestId?: string;
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
          ...(typeof run.requestId === "string" ? { requestId: run.requestId } : {}),
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
    readIssues?: {
      sourceProfileUrl: string;
      unreadable: number;
      unreadableReasons?: unknown;
      sourceIssue?: string;
    }[];
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

type RefreshProgress = {
  sourceProfileUrl?: string;
  message?: string;
  done?: number;
  total?: number;
};

export function requestSellerImportScan<T>(
  target: Window,
  request: { requestId: string; profiles: unknown[]; streamReports: boolean },
  version: string,
  onProgress: (progress: RefreshProgress) => void,
  onReport: (report: T) => void,
): Promise<string | undefined> {
  const origin = target.location.origin;
  const hasRunStatus = supportsImportRunStatus(version);
  const startTimeout = hasRunStatus ? 15000 : 60000;
  const idleTimeout = request.streamReports ? 90000 : 8 * 60 * 1000;

  return new Promise((resolve) => {
    let started = false;
    let timer: number;
    let stopWatching: (() => void) | undefined;

    function finish(error?: string) {
      target.clearTimeout(timer);
      stopWatching?.();
      target.removeEventListener("message", onMessage);
      resolve(error);
    }

    function activity() {
      started = true;
      target.clearTimeout(timer);
      timer = target.setTimeout(
        () => finish("The importer stopped sending progress. Check its status before retrying."),
        idleTimeout,
      );
    }

    function onMessage(event: MessageEvent) {
      if (
        event.source !== target ||
        event.origin !== origin ||
        event.data?.requestId !== request.requestId
      )
        return;
      const { type, error, report } = event.data;
      switch (type) {
        case "gemlist-fb-refresh-started":
        case "gemlist-fb-refresh-heartbeat":
          activity();
          break;
        case "gemlist-fb-refresh-progress":
          activity();
          onProgress(event.data);
          break;
        case "gemlist-fb-profile-result":
          activity();
          onReport(report);
          break;
        case "gemlist-fb-refresh-result":
          finish(error);
          break;
      }
    }

    target.addEventListener("message", onMessage);
    if (hasRunStatus) {
      stopWatching = watchImportRun(target, (run, journal) => {
        const last = journal?.last;
        if (last?.requestId === request.requestId && last.phase === "interrupted") {
          finish("Chrome interrupted the scan. Completed seller results can still be saved.");
          return;
        }
        if (run?.requestId === request.requestId) {
          if (!started) activity();
          return;
        }
        if (last?.requestId !== request.requestId || last.phase === "running") return;
        if (last.phase === "failed") finish(last.message || "Chrome stopped the scan early.");
        else if (journal?.pending.some((entry) => entry.requestId === request.requestId))
          finish(
            "Chrome finished scanning. Use Save scan results to recover any results it could not deliver.",
          );
        else finish();
      });
    }
    timer = target.setTimeout(
      () => finish("Chrome did not start the scan. Reload the Bluebird admin page and try again."),
      startTimeout,
    );
    target.postMessage({ type: "gemlist-ext-refresh", ...request }, origin);
  });
}
