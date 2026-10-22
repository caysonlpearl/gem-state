import { QueryClient } from "@tanstack/react-query";
import { createRouter } from "@tanstack/react-router";
import { setupRouterSsrQueryIntegration } from "@tanstack/react-router-ssr-query";
import { routeTree } from "./routeTree.gen";
import { shouldDehydrateHomepageQuery } from "./lib/home-query-serialization";

export const getRouter = () => {
  // Transient dev-server reloads and flaky networks surface as
  // "TypeError: Failed to fetch" from server-function calls; retry instead of
  // letting a one-off network blip blank the route.
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        retry: 2,
        retryDelay: (attempt) => Math.min(1000 * 2 ** attempt, 4000),
      },
    },
  });

  const router = createRouter({
    routeTree,
    context: { queryClient },
    scrollRestoration: true,
    defaultPreloadStaleTime: 0,
  });

  // Hands the queries fetched during server rendering to the browser, so a
  // page doesn't fetch all of its data a second time right after loading.
  // The root route already provides the QueryClient.
  setupRouterSsrQueryIntegration({
    router,
    queryClient,
    wrapQueryClient: false,
    dehydrateOptions: { shouldDehydrateQuery: shouldDehydrateHomepageQuery },
  });

  return router;
};
