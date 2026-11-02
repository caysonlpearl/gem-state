/** A bounded read must reject, not become a cached empty catalog. */
export class CatalogReadTimeoutError extends Error {
  constructor() {
    super("Catalog data took too long to load. Please try again.");
    this.name = "CatalogReadTimeoutError";
  }
}

type CatalogRead<T> = PromiseLike<T> & {
  abortSignal(signal: AbortSignal): CatalogRead<T>;
  retry(enabled: boolean): CatalogRead<T>;
};

/** SELECTs only. Never use this to cancel a write or reservation RPC. */
export async function withCatalogReadDeadline<T>(
  query: CatalogRead<T> | ((signal: AbortSignal) => PromiseLike<T>),
  timeoutMs = 8_000,
): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    // Await the query, including response-body parsing, under one deadline.
    // SDK retries would otherwise multiply a single read's wait.
    // Terminal SDK transforms such as maybeSingle() hide abortSignal from
    // their return type. Their factory attaches this signal and disables
    // retries before applying the terminal transform.
    const result = await (typeof query === "function"
      ? query(controller.signal)
      : query.abortSignal(controller.signal).retry(false));
    if (controller.signal.aborted) throw new CatalogReadTimeoutError();
    return result;
  } catch (error) {
    if (controller.signal.aborted) throw new CatalogReadTimeoutError();
    throw error;
  } finally {
    clearTimeout(timer);
  }
}
