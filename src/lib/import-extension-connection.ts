import { supportsSafeSellerRefresh } from "./import-refresh.ts";

export type ImportExtensionConnection = {
  status: "checking" | "missing" | "outdated" | "ready";
  version?: string;
};

/** Pings only the local browser bridge; never opens source pages or starts scans. */
export function connectImportExtension(
  target: Window,
  update: (state: ImportExtensionConnection) => void,
) {
  let timer: number | undefined;
  let attempts = 0;
  let done = true;
  let disposed = false;
  const finish = (state: ImportExtensionConnection) => {
    done = true;
    target.clearTimeout(timer);
    update(state);
  };
  const onMessage = (event: MessageEvent) => {
    if (disposed || done || event.source !== target || event.origin !== target.location.origin)
      return;
    const data = event.data;
    if (
      !data ||
      data.type !== "gemlist-ext-pong" ||
      typeof data.version !== "string" ||
      !/^\d+\.\d+\.\d+$/.test(data.version)
    )
      return;
    finish({
      status: supportsSafeSellerRefresh(data.version) ? "ready" : "outdated",
      version: data.version,
    });
  };
  const ping = () => {
    if (disposed || done) return;
    attempts++;
    target.postMessage({ type: "gemlist-ext-ping" }, target.location.origin);
    if (done) return;
    timer = target.setTimeout(() => {
      if (attempts < 4) ping();
      else finish({ status: "missing" });
    }, 1000);
  };
  const check = () => {
    if (disposed) return;
    target.clearTimeout(timer);
    attempts = 0;
    done = false;
    update({ status: "checking" });
    ping();
  };
  target.addEventListener("message", onMessage);
  check();
  return {
    check,
    dispose() {
      disposed = true;
      target.clearTimeout(timer);
      target.removeEventListener("message", onMessage);
    },
  };
}
