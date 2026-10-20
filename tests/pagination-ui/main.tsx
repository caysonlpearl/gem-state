import React from "react";
import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  createRootRouteWithContext,
  createRouter,
  HeadContent,
  Outlet,
  RouterProvider,
} from "@tanstack/react-router";
import { Toaster } from "sonner";
import { Route as productionBrowseRoute } from "../../src/routes/browse";
import { CanonicalTags } from "virtual:production-canonical";
import "../../src/styles.css";

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: false, staleTime: Infinity, refetchOnWindowFocus: false } },
});
const rootRoute = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  component: FixtureRoot,
  notFoundComponent: () => <p role="alert">Offline fixture: page not found</p>,
});
function FixtureRoot() {
  return (
    <QueryClientProvider client={queryClient}>
      <HeadContent />
      <CanonicalTags />
      <div className="border-b bg-secondary px-4 py-2 text-xs">
        Offline fixture · production browse component · synthetic listings
      </div>
      <Outlet />
      <Toaster />
    </QueryClientProvider>
  );
}
const browseRoute = productionBrowseRoute.update({
  id: "/browse",
  path: "/browse",
  getParentRoute: () => rootRoute,
} as never);
const router = createRouter({
  routeTree: rootRoute.addChildren([browseRoute]),
  context: { queryClient },
});
await router.load();
createRoot(document.getElementById("root")!).render(<RouterProvider router={router} />);
