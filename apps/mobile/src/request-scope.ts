/** Bounded, cancellable requests on every supported WebView. No newer
 * AbortSignal static methods, global polyfills, retries or persisted traits. */
export function requestScope(milliseconds: number, caller?: AbortSignal) {
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const dispose = () => {
    if (timer !== undefined) {
      clearTimeout(timer);
      timer = undefined;
    }
    caller?.removeEventListener("abort", cancel);
  };
  const cancel = () => {
    controller.abort(caller?.reason ?? new DOMException("Request cancelled.", "AbortError"));
    dispose();
  };
  if (caller?.aborted) cancel();
  else {
    caller?.addEventListener("abort", cancel, { once: true });
    timer = setTimeout(() => {
      controller.abort(
        new DOMException("Bluebird took too long to respond. Please retry.", "TimeoutError"),
      );
      dispose();
    }, milliseconds);
  }
  return { signal: controller.signal, dispose };
}
