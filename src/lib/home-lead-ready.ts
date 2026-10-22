/** Give the small lead query a bounded chance to render in the initial HTML.
 * A slow or failed query still uses the existing streaming loading/error UI.
 * This never cancels the query or waits for the large secondary feed.
 */
export async function waitForHomeLead(
  pending: Promise<unknown>,
  timeoutMs = 1_200,
): Promise<boolean> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      pending.then(
        () => true,
        () => false,
      ),
      new Promise<boolean>((resolve) => {
        timer = globalThis.setTimeout(() => resolve(false), timeoutMs);
      }),
    ]);
  } finally {
    if (timer !== undefined) globalThis.clearTimeout(timer);
  }
}
