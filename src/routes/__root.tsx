import { PUBLIC_SUPABASE_URL } from "@/config/supabase-public";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  Outlet,
  Link,
  createRootRouteWithContext,
  useRouter,
  useRouterState,
  HeadContent,
  Scripts,
} from "@tanstack/react-router";
import { useEffect, type ReactNode } from "react";

import appCss from "../styles.css?url";
import manropeLatin from "@fontsource-variable/manrope/files/manrope-latin-wght-normal.woff2?url";
import soraLatin from "@fontsource-variable/sora/files/sora-latin-wght-normal.woff2?url";
import { brand } from "@/config/brand";
import { canonicalPagePath, isPrivateSeoPath, socialImageMeta } from "@/lib/seo-policy";
import { loadSupabase } from "@/integrations/supabase/lazy-client";
import { SiteHeader } from "@/components/layout/SiteHeader";
import { SiteFooter } from "@/components/layout/SiteFooter";
import { MobileTabBar } from "@/components/layout/MobileTabBar";
import { PilotBanner } from "@/components/layout/PilotBanner";
import { BluebirdEmptyState } from "@/components/layout/BluebirdEmptyState";
import { Toaster } from "@/components/ui/sonner";
import { trackBrowserError, ensureVisit } from "@/lib/analytics";
import { startWebVitals } from "@/lib/web-vitals";

function NotFoundComponent() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4 py-10">
      <BluebirdEmptyState
        title="Page not found"
        description="The page you're looking for doesn't exist or has been moved."
        eyebrow="404 · Bluebird"
      >
        <Link
          to="/"
          className="inline-flex h-10 items-center justify-center rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
        >
          Go home
        </Link>
      </BluebirdEmptyState>
    </div>
  );
}

function ErrorComponent({ error, reset }: { error: Error; reset: () => void }) {
  console.error(error);
  const router = useRouter();

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4 py-10">
      <BluebirdEmptyState
        title="This page didn't load"
        description="Something went wrong on our end. You can try refreshing or head back home."
        eyebrow="A quick detour · Bluebird"
      >
        <button
          onClick={() => {
            router.invalidate();
            reset();
          }}
          className="inline-flex h-10 items-center justify-center rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
        >
          Try again
        </button>
        <a
          href="/"
          className="inline-flex h-10 items-center justify-center rounded-md border border-input bg-background px-4 text-sm font-medium text-foreground transition-colors hover:bg-accent"
        >
          Go home
        </a>
      </BluebirdEmptyState>
    </div>
  );
}

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1, maximum-scale=1" },
      { title: `${brand.name} — Idaho's local marketplace` },
      { name: "description", content: brand.description },
      { name: "author", content: brand.name },
      { property: "og:title", content: `${brand.name} — Idaho's local marketplace` },
      { property: "og:description", content: brand.description },
      { property: "og:type", content: "website" },
      { property: "og:site_name", content: brand.name },
      ...socialImageMeta(brand.urls.siteUrl),
      {
        name: "google-site-verification",
        content: "reUnGwKD13ZcD2_HabKHN62Mud06ux9CfdPfOrWd9GY",
      },
    ],
    links: [
      {
        rel: "stylesheet",
        href: appCss,
      },
      { rel: "icon", href: "/images/brand/bluebird-favicon-transparent.png", type: "image/png" },
      // Listing photos come from Supabase storage; open that connection while
      // the page's HTML is still arriving instead of when the first <img> is
      // reached (worth about a second on slow mobile connections).
      { rel: "preconnect", href: PUBLIC_SUPABASE_URL },
      // The two fonts nearly every page paints first, fetched alongside the CSS.
      {
        rel: "preload",
        href: manropeLatin,
        as: "font",
        type: "font/woff2",
        crossOrigin: "anonymous",
      },
      { rel: "preload", href: soraLatin, as: "font", type: "font/woff2", crossOrigin: "anonymous" },
    ],
  }),
  shellComponent: RootShell,
  component: RootComponent,
  notFoundComponent: NotFoundComponent,
  errorComponent: ErrorComponent as never,
});

function CanonicalTags() {
  const location = useRouterState({ select: (s) => s.location });
  const href = `${brand.urls.siteUrl}${canonicalPagePath(
    location.pathname,
    location.search as Record<string, unknown>,
  )}`;
  return (
    <>
      <link rel="canonical" href={href} />
      <meta property="og:url" content={href} />
      {isPrivateSeoPath(location.pathname) ? (
        <meta name="robots" content="noindex, nofollow" />
      ) : null}
    </>
  );
}

function RootShell({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <head>
        <HeadContent />
        <CanonicalTags />
      </head>
      <body>
        {children}
        <Scripts />
      </body>
    </html>
  );
}

function RootComponent() {
  const { queryClient } = Route.useRouteContext();
  const router = useRouter();

  // Classify where this visit came from on its first page (search, AI
  // assistant, social, another site or direct).
  useEffect(() => {
    ensureVisit();
    startWebVitals();
  }, []);

  useEffect(() => {
    let active = true;
    let unsubscribe = () => {};
    void loadSupabase().then((supabase) => {
      if (!active) return;
      const { data } = supabase.auth.onAuthStateChange((event) => {
        if (event !== "SIGNED_IN" && event !== "SIGNED_OUT" && event !== "USER_UPDATED") return;
        void router.invalidate();
        if (event !== "SIGNED_OUT") void queryClient.invalidateQueries();
      });
      unsubscribe = () => data.subscription.unsubscribe();
    });
    return () => {
      active = false;
      unsubscribe();
    };
  }, [queryClient, router]);

  useEffect(() => {
    const onError = (event: ErrorEvent) => {
      // Browser errors are recorded without the current query string so typed
      // search terms and other user-provided values never enter telemetry.
      trackBrowserError(event.error ?? event.message, "error");
    };
    const onUnhandledRejection = (event: PromiseRejectionEvent) => {
      trackBrowserError(event.reason, "unhandled_rejection");
    };
    window.addEventListener("error", onError);
    window.addEventListener("unhandledrejection", onUnhandledRejection);
    return () => {
      window.removeEventListener("error", onError);
      window.removeEventListener("unhandledrejection", onUnhandledRejection);
    };
  }, []);

  return (
    <QueryClientProvider client={queryClient}>
      <div className="flex min-h-screen flex-col">
        <PilotBanner />
        <SiteHeader />
        <main id="main-content" className="flex-1">
          {/* Required: nested routes render here. Removing <Outlet /> breaks all child routes. */}
          <Outlet />
        </main>
        <SiteFooter />
        <MobileTabBar />
      </div>
      <Toaster />
    </QueryClientProvider>
  );
}
