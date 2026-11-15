/** A request-scoped client must retain both its operation deadline and any
 * shorter SDK request cancellation, including a signal carried by Request. */
export function withFetchSignal(fetcher: typeof fetch, scope?: AbortSignal): typeof fetch {
  if (!scope) return fetcher;
  return (input, init) => {
    scope.throwIfAborted();
    const requestSignal = init?.signal ?? (input instanceof Request ? input.signal : undefined);
    const signal = requestSignal ? AbortSignal.any([scope, requestSignal]) : scope;
    signal.throwIfAborted();
    return fetcher(input, { ...init, signal });
  };
}
