import { createAppQueryClient } from "./lib/app-query-client";
import { createRouter } from "@tanstack/react-router";
import { setupRouterSsrQueryIntegration } from "@tanstack/react-router-ssr-query";
import { routeTree } from "./routeTree.gen";
import { shouldDehydrateHomepageQuery } from "./lib/home-query-serialization";

export const getRouter = () => {
  // Browsers can retry transient network failures. SSR gets one bounded read
  // so a timeout does not turn into three serial waits before the page loads.
  const queryClient = createAppQueryClient(import.meta.env.SSR);

  const router = createRouter({
    routeTree,
    context: { queryClient },
    scrollRestoration: true,
    defaultPreloadStaleTime: 0,
    // Keep the current page visible until the next route's cached data is ready.
    // RootComponent supplies a small progress bar without replacing its cards.
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
