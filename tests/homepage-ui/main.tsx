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
import { Route as productionHomeRoute } from "../../src/routes/index";
import { SiteHeader } from "../../src/components/layout/SiteHeader";
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
        Offline fixture · production homepage and header · synthetic listings
      </div>
      <SiteHeader />
      <Outlet />
      <Toaster />
    </QueryClientProvider>
  );
}
const mode = new URLSearchParams(location.search).get("fixture") ?? "success";
const homeRoute = productionHomeRoute.update({
  id: "/",
  path: "/",
  getParentRoute: () => rootRoute,
  // Fault fixtures exercise a cache miss after navigation independently of
  // the initial read barrier. Success/empty fixtures use the real loader.
  loader:
    mode === "loading" || mode.startsWith("allocation")
      ? async () => ({ leadImageUrl: null })
      : productionHomeRoute.options.loader,
} as never);
const router = createRouter({
  routeTree: rootRoute.addChildren([homeRoute]),
  context: { queryClient },
});
await router.load();
createRoot(document.getElementById("root")!).render(<RouterProvider router={router} />);
