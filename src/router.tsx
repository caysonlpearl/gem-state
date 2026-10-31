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
    defaultPendingMs: 150,
    defaultPendingMinMs: 150,
    defaultPendingComponent: () => (
      <main className="mx-auto max-w-[1440px] px-4 py-10 sm:px-6" aria-busy="true">
        <p role="status" className="text-sm text-muted-foreground">
          Loading page…
        </p>
        <div
          className="mt-6 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4"
          aria-hidden="true"
        >
          {Array.from({ length: 8 }, (_, index) => (
            <div
              key={index}
              className="h-64 animate-pulse rounded-2xl bg-muted motion-reduce:animate-none"
            />
          ))}
        </div>
      </main>
    ),
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
