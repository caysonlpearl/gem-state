import type { MobileHome } from "../../../src/lib/mobile-contract";
import { ApiError, apiOrigin } from "./client";
import { requestScope } from "./request-scope";

/** The fixed public homepage is independent of Auth initialization. Never send
 * cookies, bearer tokens, install identifiers or activity with this read. */
export async function readPublicHome(caller?: AbortSignal): Promise<MobileHome> {
  const scope = requestScope(20000, caller);
  try {
    if (scope.signal.aborted) throw scope.signal.reason;
    const response = await fetch(`${apiOrigin}/api/mobile/v1/home`, {
      method: "GET",
      credentials: "omit",
      cache: "no-store",
      redirect: "error",
      referrerPolicy: "no-referrer",
      headers: { Accept: "application/json" },
      signal: scope.signal,
    });
    const payload = await response.json().catch(() => null);
    if (scope.signal.aborted) throw scope.signal.reason;
    if (!response.ok)
      throw new ApiError(
        payload?.error?.code ?? "unavailable",
        payload?.error?.message ?? "Bluebird could not load the homepage. Please retry.",
        response.status,
      );
    if (!Array.isArray(payload?.data?.motors) || !Array.isArray(payload?.data?.recent))
      throw new ApiError(
        "invalid_response",
        "Bluebird returned an incomplete homepage. Please retry.",
        503,
      );
    return { motors: payload.data.motors, recent: payload.data.recent };
  } finally {
    scope.dispose();
  }
}

type Outcome = { ok: true; value: MobileHome } | { ok: false; error: unknown };
/** One transient public read. It is not an account cache, offline inventory or
 * a source for search/saved screens. A consumer takes it at most once. */
export function startPublicHome(read = readPublicHome, now = () => Date.now(), maxAge = 30000) {
  const controller = new AbortController(),
    started = now();
  let timer: ReturnType<typeof setTimeout> | undefined;
  let pending: Promise<Outcome> | undefined;
  const clearExpiry = () => {
    if (timer !== undefined) clearTimeout(timer);
    timer = undefined;
  };
  const cancel = () => {
    clearExpiry();
    // Once taken, the screen's own signal owns cancellation. Aborting it here
    // could race navigation cleanup and trigger a spurious fallback request.
    if (!pending) return;
    pending = undefined;
    controller.abort(new DOMException("Homepage startup read was discarded.", "AbortError"));
  };
  try {
    // Handle background failures immediately; they surface only if consumed.
    pending = read(controller.signal).then(
      (value) => ({ ok: true, value }),
      (error) => ({ ok: false, error }),
    );
  } catch (error) {
    pending = Promise.resolve({ ok: false, error });
  }
  timer = setTimeout(cancel, maxAge);
  return Object.freeze({
    cancel,
    take(caller: AbortSignal): Promise<MobileHome> | null {
      if (!pending) return null;
      if (now() - started >= maxAge || caller.aborted) {
        cancel();
        return caller.aborted ? Promise.reject(caller.reason) : null;
      }
      const work = pending;
      pending = undefined;
      clearExpiry();
      const abort = () => controller.abort(caller.reason);
      caller.addEventListener("abort", abort, { once: true });
      return work
        .then((outcome) => {
          if (caller.aborted) throw caller.reason;
          if (!outcome.ok) throw outcome.error;
          return outcome.value;
        })
        .finally(() => caller.removeEventListener("abort", abort));
    },
  });
}
export type StartupHome = ReturnType<typeof startPublicHome>;
