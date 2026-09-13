import { useEffect, useState } from "react";

/**
 * True only after hydration. Use it to gate UI that depends on data the server
 * may have resolved during streaming SSR but the client cache does not hold at
 * hydration time (for example a client-side `useQuery`). Rendering that UI
 * before hydration produces a genuine server/client markup mismatch.
 */
export function useHydrated() {
  const [hydrated, setHydrated] = useState(false);
  useEffect(() => setHydrated(true), []);
  return hydrated;
}
