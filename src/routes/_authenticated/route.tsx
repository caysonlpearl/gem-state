import { createFileRoute, Outlet, useNavigate, useRouterState } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useAuth } from "@/hooks/useAuth";

export const Route = createFileRoute("/_authenticated")({
  ssr: false,
  component: AuthenticatedGate,
});

const sellerRedirects = [
  "/selling",
  "/seller-setup",
  "/create-listing",
  "/create-missing-listing",
] as const;

function AuthenticatedGate() {
  const navigate = useNavigate();
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const { isSignedIn, loading } = useAuth();
  const [redirecting, setRedirecting] = useState(false);

  useEffect(() => {
    if (loading || isSignedIn || redirecting) return;

    setRedirecting(true);
    const destination = sellerRedirects.includes(
      pathname as (typeof sellerRedirects)[number],
    )
      ? (pathname as (typeof sellerRedirects)[number])
      : undefined;

    void navigate({ to: "/auth", search: { redirect: destination }, replace: true });
  }, [isSignedIn, loading, navigate, pathname, redirecting]);

  if (loading || !isSignedIn || redirecting) {
    return (
      <main
        aria-busy="true"
        aria-label="Checking your account session"
        className="flex min-h-[45vh] items-center justify-center px-4 py-16"
      >
        <div className="w-full max-w-[460px] space-y-3 rounded-2xl border border-border bg-card p-6 shadow-sm">
          <div aria-hidden="true" className="h-5 w-40 animate-pulse rounded bg-secondary" />
          <div aria-hidden="true" className="h-4 w-64 animate-pulse rounded bg-secondary" />
          <div aria-hidden="true" className="h-10 w-full animate-pulse rounded-xl bg-secondary" />
        </div>
      </main>
    );
  }

  return <Outlet />;
}
