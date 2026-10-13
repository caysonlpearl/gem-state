import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { brand } from "@/config/brand";
import { supabase } from "@/integrations/supabase/client";
import { getAuthRedirectUrl } from "@/lib/auth-redirect";

export const Route = createFileRoute("/auth")({
  validateSearch: (search: Record<string, unknown>): AuthSearch => {
    const allowedRedirects = [
      "/claim-seller",
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
    const requested = search["redirect"];
    // A listing page can also send a buyer here (Google or new-account
    // sign-in from the contact panel) and get them straight back to it.
    const redirect: AuthRedirect =
      typeof requested === "string" && LISTING_REDIRECT.test(requested)
        ? (requested as ListingRedirect)
        : allowedRedirects.includes(requested as StaticRedirect)
          ? (requested as StaticRedirect)
          : "/account";
    return {
      redirect: redirect === "/account" ? undefined : redirect,
      mode:
        search["mode"] === "signup" || search["mode"] === "forgot" || search["mode"] === "reset"
          ? (search["mode"] as "signup" | "forgot" | "reset")
          : undefined,
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

type Mode = "signin" | "signup" | "forgot" | "reset";
const LISTING_REDIRECT = /^\/listings\/[0-9a-f-]{36}$/i;
type ListingRedirect = `/listings/${string}`;
type AuthRedirect = StaticRedirect | ListingRedirect;
type StaticRedirect =
  | "/claim-seller"
  | "/account"
  | "/selling"
  | "/seller-setup"
  | "/dealer-setup"
  | "/create-listing"
  | "/create-missing-listing"
  | "/buying"
  | "/notifications"
  | "/onboarding"
  | "/shopper"
  | "/shopper-payouts"
  | "/suggest"
  | "/watchlist"
  | "/messages";
type AuthSearch = { redirect?: AuthRedirect | undefined; mode?: Mode | undefined };

// Tell people why they're being asked to sign in, based on where they were
// headed -- a generic "sign in" at the moment of posting or messaging reads
// as a wall rather than a step.
function authIntent(redirect: AuthRedirect) {
  if (redirect.startsWith("/listings/")) {
    return {
      signinTitle: "Sign in to message the seller",
      signupTitle: "Create an account to message the seller",
      body: "You'll come right back to the listing with your message ready to send.",
    };
  }
  if (
    redirect === "/create-listing" ||
    redirect === "/create-missing-listing" ||
    redirect === "/seller-setup" ||
    redirect === "/selling"
  ) {
    return {
      signinTitle: "Sign in to post your listing",
      signupTitle: "Create an account to post your listing",
      body: "Posting is free. Buyers across Idaho contact you directly.",
    };
  }
  if (redirect === "/watchlist") {
    return {
      signinTitle: "Sign in to see your saved items",
      signupTitle: "Create an account to save listings",
      body: "Save listings and searches, and get alerts when something new matches.",
    };
  }
  if (redirect === "/messages") {
    return {
      signinTitle: "Sign in to see your messages",
      signupTitle: "Create an account to message sellers",
      body: "Your conversations with buyers and sellers live here.",
    };
  }
  return {
    signinTitle: `Sign in to ${brand.name}`,
    signupTitle: `Create your ${brand.name} account`,
    body: "An account is needed to save listings, contact sellers and post on the marketplace.",
  };
}

function AuthPage() {
  const navigate = useNavigate();
  const search = Route.useSearch();
  const redirect = search.redirect ?? "/account";
  const [mode, setMode] = useState<Mode>(search.mode ?? "signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [busy, setBusy] = useState(false);
  const [pendingConfirm, setPendingConfirm] = useState(false);
  const intent = authIntent(redirect);
  const goToRedirect = () =>
    redirect.startsWith("/listings/")
      ? navigate({
          to: "/listings/$listingId",
          params: { listingId: redirect.slice("/listings/".length) },
        })
      : navigate({ to: redirect as StaticRedirect });

  useEffect(() => {
    void supabase.auth.getSession().then(({ data }) => {
      if (data.session && mode !== "reset" && mode !== "forgot") void goToRedirect();
    });
    // goToRedirect only closes over navigate and redirect, both listed here.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [navigate, redirect, mode]);

  useEffect(() => {
    const { data } = supabase.auth.onAuthStateChange((event) => {
      if (event === "PASSWORD_RECOVERY") setMode("reset");
    });
    return () => data.subscription.unsubscribe();
  }, []);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    try {
      if (mode === "signup") {
        const { data, error } = await supabase.auth.signUp({
          email,
          password,
          options: {
            emailRedirectTo: getAuthRedirectUrl(`/auth?redirect=${encodeURIComponent(redirect)}`),
            data: { display_name: displayName || email.split("@")[0] },
          },
        });
        if (error) throw error;
        if (!data.session) {
          setPendingConfirm(true);
          return;
        }
        await goToRedirect();
        return;
      }

      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) throw error;
      await goToRedirect();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Something went wrong.");
    } finally {
      setBusy(false);
    }
  }

  async function handleForgotPassword(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: getAuthRedirectUrl(`/auth?mode=reset&redirect=${encodeURIComponent(redirect)}`),
      });
      if (error) throw error;
      toast.success("Password reset email sent. Check your inbox.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not send the reset email.");
    } finally {
      setBusy(false);
    }
  }

  async function handleResetPassword(event: React.FormEvent) {
    event.preventDefault();
    if (newPassword.length < 8) {
      toast.error("Use at least 8 characters for your new password.");
      return;
    }
    if (newPassword !== confirmPassword) {
      toast.error("The passwords do not match.");
      return;
    }
    setBusy(true);
    try {
      const { error } = await supabase.auth.updateUser({ password: newPassword });
      if (error) throw error;
      toast.success("Password updated.");
      await goToRedirect();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not update your password.");
    } finally {
      setBusy(false);
    }
  }

  async function handleOAuth() {
    setBusy(true);
    try {
      const { error } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: {
          redirectTo: getAuthRedirectUrl(`/auth?redirect=${encodeURIComponent(redirect)}`),
        },
      });
      if (error) {
        toast.error("Google sign-in failed. Try email instead.");
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto max-w-[460px] px-4 py-6 sm:px-6 sm:py-10">
      <div className="soft-card overflow-hidden p-4 sm:p-6">
        {mode === "signin" || mode === "signup" ? (
          <div className="relative mb-4 min-h-[92px] overflow-hidden rounded-[18px] border border-brand-blue/15 bg-secondary/65 px-4 py-3 sm:min-h-[104px] sm:px-5 sm:py-3.5">
            <span
              className="absolute -right-8 -top-14 h-32 w-32 rounded-full bg-brand-blue/12"
              aria-hidden="true"
            />
            <span
              className="absolute -bottom-16 left-1/3 h-24 w-24 rounded-full bg-brand-warm/20"
              aria-hidden="true"
            />
            <div className="relative z-10 max-w-[58%] pt-0.5">
              <h1 className="text-[18px] font-bold leading-tight tracking-tight sm:text-[20px]">
                {mode === "signup" ? intent.signupTitle : intent.signinTitle}
              </h1>
            </div>
            <img
              src="/images/brand/bluebird-signin-bird.webp"
              alt=""
              aria-hidden="true"
              decoding="async"
              className="absolute -bottom-4 right-1 h-28 w-32 object-contain sm:-bottom-5 sm:right-3 sm:h-32 sm:w-36"
            />
          </div>
        ) : null}
        {(mode === "forgot" || mode === "reset") && (
          <h1 className="text-[23px] font-bold leading-tight tracking-tight sm:text-[25px]">
            {mode === "forgot" ? "Reset your password" : "Choose a new password"}
          </h1>
        )}
        {(mode === "forgot" || mode === "reset") && (
          <p className="mt-1 text-[12px] leading-snug text-muted-foreground">
            {mode === "forgot"
              ? "Enter your email and we’ll send you a secure password reset link."
              : "Choose a new password for your Bluebird account."}
          </p>
        )}

        {pendingConfirm ? (
          <div className="mt-6 rounded-2xl bg-secondary p-5">
            <p className="text-[13.5px] font-medium">Check your email</p>
            <p className="mt-1 text-[13px] leading-relaxed text-muted-foreground">
              We sent a confirmation link to {email}. You are not signed in until you open it.
            </p>
          </div>
        ) : mode === "forgot" ? (
          <form onSubmit={handleForgotPassword} className="mt-4 space-y-2.5">
            <div>
              <label htmlFor="forgot-email" className="text-[12px] font-medium">
                Email
              </label>
              <input
                id="forgot-email"
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                autoComplete="email"
                className="soft-control mt-1 h-10 w-full px-4 text-sm outline-none"
              />
            </div>
            <button
              type="submit"
              disabled={busy}
              className="inline-flex h-11 w-full items-center justify-center rounded-full bg-primary text-[13.5px] font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-60"
            >
              {busy ? "Sending…" : "Send reset email"}
            </button>
            <button
              type="button"
              onClick={() => setMode("signin")}
              className="w-full text-[13px] text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
            >
              Back to sign in
            </button>
          </form>
        ) : mode === "reset" ? (
          <form onSubmit={handleResetPassword} className="mt-4 space-y-2.5">
            <div>
              <label htmlFor="new-password" className="text-[12px] font-medium">
                New password
              </label>
              <input
                id="new-password"
                type="password"
                required
                minLength={8}
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                autoComplete="new-password"
                className="soft-control mt-1 h-10 w-full px-4 text-sm outline-none"
              />
            </div>
            <div>
              <label htmlFor="confirm-password" className="text-[12px] font-medium">
                Confirm new password
              </label>
              <input
                id="confirm-password"
                type="password"
                required
                minLength={8}
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                autoComplete="new-password"
                className="soft-control mt-1 h-10 w-full px-4 text-sm outline-none"
              />
            </div>
            <button
              type="submit"
              disabled={busy}
              className="inline-flex h-11 w-full items-center justify-center rounded-full bg-primary text-[13.5px] font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-60"
            >
              {busy ? "Updating…" : "Update password"}
            </button>
          </form>
        ) : (
          <>
            <div className="mt-4 space-y-2">
              <button
                type="button"
                onClick={handleOAuth}
                disabled={busy}
                className="inline-flex h-11 w-full items-center justify-center gap-2.5 rounded-full border border-input bg-card text-[13.5px] font-medium transition-colors hover:bg-secondary disabled:opacity-60"
              >
                <svg aria-hidden="true" className="h-5 w-5 shrink-0" viewBox="0 0 24 24" role="img">
                  <path
                    fill="#4285F4"
                    d="M21.35 12.27c0-.73-.06-1.45-.19-2.13H12v4.03h5.24a4.48 4.48 0 0 1-1.94 2.94v2.45h3.14c1.84-1.69 2.91-4.18 2.91-7.29Z"
                  />
                  <path
                    fill="#34A853"
                    d="M12 21.6c2.63 0 4.84-.87 6.45-2.36l-3.14-2.45c-.87.58-1.98.92-3.31.92-2.54 0-4.7-1.72-5.47-4.03H3.29v2.53A9.74 9.74 0 0 0 12 21.6Z"
                  />
                  <path
                    fill="#FBBC05"
                    d="M6.53 13.68A5.85 5.85 0 0 1 6.22 12c0-.58.1-1.15.31-1.68V7.79H3.29A9.6 9.6 0 0 0 2.25 12c0 1.52.36 2.96 1.04 4.21l3.24-2.53Z"
                  />
                  <path
                    fill="#EA4335"
                    d="M12 6.29c1.43 0 2.71.49 3.72 1.45l2.79-2.79C16.84 3.39 14.63 2.4 12 2.4a9.74 9.74 0 0 0-8.71 5.39l3.24 2.53C7.3 8.01 9.46 6.29 12 6.29Z"
                  />
                </svg>
                Continue with Google
              </button>
            </div>

            <div className="my-3 flex items-center gap-3">
              <span className="h-px flex-1 bg-border" />
              <span className="text-[11px] uppercase tracking-[0.08em] text-muted-foreground">
                or
              </span>
              <span className="h-px flex-1 bg-border" />
            </div>

            <form onSubmit={handleSubmit} className="space-y-2.5">
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
                    className="soft-control mt-1 h-10 w-full px-4 text-sm outline-none"
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
                  className="soft-control mt-1 h-10 w-full px-4 text-sm outline-none"
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
                  className="soft-control mt-1 h-10 w-full px-4 text-sm outline-none"
                />
              </div>
              <button
                type="submit"
                disabled={busy}
                className="inline-flex h-11 w-full items-center justify-center rounded-full bg-primary text-[13.5px] font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-60"
              >
                {mode === "signin" ? "Sign in" : "Create account"}
              </button>
            </form>

            <div className="mt-3 flex flex-wrap items-stretch justify-center gap-2.5">
              <button
                type="button"
                onClick={() => setMode(mode === "signin" ? "signup" : "signin")}
                className="inline-flex h-11 min-w-0 flex-1 items-center justify-center rounded-full border border-input bg-card px-4 text-[12.5px] font-medium transition-colors hover:bg-secondary"
              >
                {mode === "signin"
                  ? "Need an account? Create one"
                  : "Already have an account? Sign in"}
              </button>
              {mode === "signin" && (
                <button
                  type="button"
                  onClick={() => setMode("forgot")}
                  className="inline-flex h-11 min-w-0 flex-1 items-center justify-center rounded-full border border-input bg-card px-4 text-[12.5px] font-medium transition-colors hover:bg-secondary"
                >
                  Forgot password?
                </button>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
