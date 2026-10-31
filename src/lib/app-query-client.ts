import { QueryClient } from "@tanstack/react-query";

/** Server requests must not repeat an already bounded database read. Browser
 * interactions retain transient-network retries; decorative card reads opt out. */
export function createAppQueryClient(isServer: boolean) {
  return new QueryClient({
    defaultOptions: {
      queries: {
        retry: isServer ? false : 2,
        retryDelay: (attempt) => Math.min(1000 * 2 ** attempt, 4000),
      },
    },
  });
}
