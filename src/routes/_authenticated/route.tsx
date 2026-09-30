import { createFileRoute, Outlet, useNavigate, useRouterState } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useAuth } from "@/hooks/useAuth";

export const Route = createFileRoute("/_authenticated")({
  ssr: false,
  component: AuthenticatedGate,
});

const sellerRedirects = [
  "/account",
  "/selling",
  "/seller-setup",
  "/dealer-setup",
  "/create-listing",
  "/create-missing-listing",
  "/buying",
  "/notifications",
  "/onboarding",
  "/shopper",
  "/shopper-payouts",
  "/suggest",
  "/watchlist",
  "/messages",
] as const;

function AuthenticatedGate() {
  const navigate = useNavigate();
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const { isSignedIn, loading } = useAuth();
  const [redirecting, setRedirecting] = useState(false);

  useEffect(() => {
    if (loading || isSignedIn || redirecting) return;

    setRedirecting(true);
    const destination = sellerRedirects.includes(pathname as (typeof sellerRedirects)[number])
      ? (pathname as (typeof sellerRedirects)[number])
      : undefined;

    void navigate({ to: "/auth", search: { redirect: destination }, replace: true });
  }, [isSignedIn, loading, navigate, pathname, redirecting]);

  if (loading) {
    return (
      <main
        aria-busy="true"
        aria-label="Checking your account session"
        className="flex min-h-[45vh] items-center justify-center px-4 py-16"
      >
        <div className="w-full max-w-[460px] space-y-3 rounded-2xl border border-border bg-card p-6 shadow-sm">
          <h1 className="text-lg font-semibold">Checking your account</h1>
          <p className="text-sm text-muted-foreground">
            We’re confirming your session before opening this page.
          </p>
        </div>
      </main>
    );
  }

  if (!isSignedIn) {
    return (
      <main className="flex min-h-[45vh] items-center justify-center px-4 py-16">
        <div className="w-full max-w-[460px] space-y-4 rounded-2xl border border-border bg-card p-6 shadow-sm">
          <h1 className="text-lg font-semibold">Sign in to continue</h1>
          <p className="text-sm leading-relaxed text-muted-foreground">
            This page is private to your account. Sign in and we’ll bring you back to the action you
            were trying to take.
          </p>
          <a
            href={`/auth?redirect=${encodeURIComponent(pathname)}`}
            className="inline-flex h-10 items-center justify-center rounded-md bg-primary px-4 text-sm font-semibold text-primary-foreground hover:opacity-90"
          >
            Sign in
          </a>
          <a href="/browse" className="ml-3 text-sm font-medium text-primary hover:underline">
            Browse listings
          </a>
        </div>
      </main>
    );
  }

  if (redirecting) {
    return (
      <main className="flex min-h-[45vh] items-center justify-center px-4 py-16" aria-busy="true">
        <div className="w-full max-w-[460px] rounded-2xl border border-border bg-card p-6 shadow-sm">
          <h1 className="text-lg font-semibold">Opening your account page</h1>
          <p className="mt-2 text-sm text-muted-foreground">One moment.</p>
        </div>
      </main>
    );
  }

  return <Outlet />;
}
