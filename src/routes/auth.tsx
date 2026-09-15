import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { brand } from "@/config/brand";
import { supabase } from "@/integrations/supabase/client";
import { lovable } from "@/integrations/lovable/index";

export const Route = createFileRoute("/auth")({
  validateSearch: (search: Record<string, unknown>): AuthSearch => {
    const allowedRedirects = [
      "/account",
      "/selling",
      "/seller-setup",
      "/create-listing",
      "/create-missing-listing",
    ] as const;
    const redirect: AuthRedirect = allowedRedirects.includes(search["redirect"] as AuthRedirect)
      ? (search["redirect"] as AuthRedirect)
      : "/account";
    return {
      redirect: redirect === "/account" ? undefined : redirect,
      mode: search["mode"] === "signup" ? ("signup" as const) : undefined,
    };
  },
  head: () => ({
    meta: [
      { title: `Sign in — ${brand.name}` },
      {
        name: "description",
        content: `Sign in or create a ${brand.name} account to save listings, contact sellers, and post your own listings across Idaho.`,
      },
      { property: "og:title", content: `Sign in — ${brand.name}` },
      {
        property: "og:description",
        content: `Buy and sell cars, trucks, tools, furniture, and more with a ${brand.name} account.`,
      },
    ],
  }),
  component: AuthPage,
});

type Mode = "signin" | "signup";
type AuthRedirect =
  "/account" | "/selling" | "/seller-setup" | "/create-listing" | "/create-missing-listing";
type AuthSearch = { redirect?: AuthRedirect | undefined; mode?: Mode | undefined };

function AuthPage() {
  const navigate = useNavigate();
  const search = Route.useSearch();
  const redirect = search.redirect ?? "/account";
  const [mode, setMode] = useState<Mode>(search.mode ?? "signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [busy, setBusy] = useState(false);
  const [pendingConfirm, setPendingConfirm] = useState(false);

  useEffect(() => {
    void supabase.auth.getSession().then(({ data }) => {
      if (data.session) void navigate({ to: redirect });
    });
  }, [navigate, redirect]);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    try {
      if (mode === "signup") {
        const { data, error } = await supabase.auth.signUp({
          email,
          password,
          options: {
            emailRedirectTo: `${window.location.origin}/auth?redirect=${encodeURIComponent(redirect)}`,
            data: { display_name: displayName || email.split("@")[0] },
          },
        });
        if (error) throw error;
        if (!data.session) {
          setPendingConfirm(true);
          return;
        }
        await navigate({ to: redirect });
        return;
      }

      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) throw error;
      await navigate({ to: redirect });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Something went wrong.");
    } finally {
      setBusy(false);
    }
  }

  async function handleOAuth(provider: "google" | "apple") {
    setBusy(true);
    try {
      const result = await lovable.auth.signInWithOAuth(provider, {
        redirect_uri: `${window.location.origin}/auth?redirect=${encodeURIComponent(redirect)}`,
      });
      if (result.error) {
        toast.error(
          `${provider === "google" ? "Google" : "Apple"} sign-in failed. Try email instead.`,
        );
        return;
      }
      if (result.redirected) return;
      await navigate({ to: redirect });
    } finally {
      setBusy(false);
    }
  }


  return (
    <div className="mx-auto max-w-[460px] px-4 py-16 sm:px-6">
      <div className="soft-card p-6 sm:p-8">
      <h1 className="text-[26px] font-bold tracking-tight">
        {mode === "signin" ? `Sign in to ${brand.name}` : `Create your ${brand.name} account`}
      </h1>
      <p className="mt-1.5 text-[13px] leading-relaxed text-muted-foreground">
        An account is needed to save listings, contact sellers and post on the marketplace.
      </p>

      {pendingConfirm ? (
          <div className="mt-6 rounded-2xl bg-secondary p-5">
          <p className="text-[13.5px] font-medium">Check your email</p>
          <p className="mt-1 text-[13px] leading-relaxed text-muted-foreground">
            We sent a confirmation link to {email}. You are not signed in until you open it.
          </p>
        </div>
      ) : (
        <>
          <div className="mt-6 space-y-2.5">
            <button
              type="button"
              onClick={() => handleOAuth("google")}
              disabled={busy}
              className="inline-flex h-12 w-full items-center justify-center rounded-full border border-input bg-card text-[13.5px] font-medium transition-colors hover:bg-secondary disabled:opacity-60"
            >
              Continue with Google
            </button>
            <button
              type="button"
              onClick={() => handleOAuth("apple")}
              disabled={busy}
              className="inline-flex h-12 w-full items-center justify-center gap-2 rounded-full border border-input bg-card text-[13.5px] font-medium transition-colors hover:bg-secondary disabled:opacity-60"
            >
              <svg viewBox="0 0 24 24" aria-hidden="true" className="h-4 w-4 fill-current">
                <path d="M17.05 12.9c.02 2.6 2.28 3.46 2.3 3.47-.02.06-.36 1.24-1.2 2.45-.72 1.05-1.47 2.1-2.66 2.12-1.16.02-1.54-.69-2.87-.69-1.33 0-1.75.67-2.85.71-1.14.04-2.01-1.12-2.74-2.17-1.5-2.17-2.64-6.14-1.1-8.82.76-1.33 2.13-2.17 3.61-2.19 1.12-.02 2.17.75 2.87.75.69 0 1.98-.93 3.33-.79.57.02 2.17.2 3.19 1.55-.08.05-1.9 1.11-1.88 3.31M14.9 4.6c.62-.75 1.04-1.79.93-2.83-.9.04-2 .6-2.64 1.35-.58.66-1.08 1.72-.95 2.74 1 .08 2.03-.51 2.66-1.26" />
              </svg>
              Continue with Apple
            </button>
          </div>


          <div className="my-5 flex items-center gap-3">
            <span className="h-px flex-1 bg-border" />
            <span className="text-[11px] uppercase tracking-[0.08em] text-muted-foreground">
              or
            </span>
            <span className="h-px flex-1 bg-border" />
          </div>

          <form onSubmit={handleSubmit} className="space-y-3">
            {mode === "signup" && (
              <div>
                <label htmlFor="displayName" className="text-[12px] font-medium">
                  Display name
                </label>
                <input
                  id="displayName"
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  autoComplete="nickname"
                  className="soft-control mt-1 h-11 w-full px-4 text-sm outline-none"
                />
              </div>
            )}
            <div>
              <label htmlFor="email" className="text-[12px] font-medium">
                Email
              </label>
              <input
                id="email"
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                autoComplete="email"
                className="soft-control mt-1 h-11 w-full px-4 text-sm outline-none"
              />
            </div>
            <div>
              <label htmlFor="password" className="text-[12px] font-medium">
                Password
              </label>
              <input
                id="password"
                type="password"
                required
                minLength={8}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete={mode === "signin" ? "current-password" : "new-password"}
                className="soft-control mt-1 h-11 w-full px-4 text-sm outline-none"
              />
            </div>
            <button
              type="submit"
              disabled={busy}
              className="inline-flex h-12 w-full items-center justify-center rounded-full bg-primary text-[13.5px] font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-60"
            >
              {mode === "signin" ? "Sign in" : "Create account"}
            </button>
          </form>

          <button
            type="button"
            onClick={() => setMode(mode === "signin" ? "signup" : "signin")}
            className="mt-4 text-[13px] text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
          >
            {mode === "signin" ? "Need an account? Create one" : "Already have an account? Sign in"}
          </button>
        </>
      )}
      </div>
    </div>
  );
}
