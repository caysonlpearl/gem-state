import type { FormEvent } from "react";
import { SignupShoppingChoices } from "../community/SignupShoppingChoices";

export type AuthMode = "signin" | "signup" | "forgot" | "reset";
export type AuthPageViewProps = {
  mode: AuthMode;
  setMode: (mode: AuthMode) => void;
  intent: { signinTitle: string; signupTitle: string };
  email: string;
  setEmail: (value: string) => void;
  password: string;
  setPassword: (value: string) => void;
  newPassword: string;
  setNewPassword: (value: string) => void;
  confirmPassword: string;
  setConfirmPassword: (value: string) => void;
  displayName: string;
  setDisplayName: (value: string) => void;
  acceptedTerms: boolean;
  setAcceptedTerms: (value: boolean) => void;
  shoppingAlerts: boolean;
  setShoppingAlerts: (value: boolean) => void;
  busy: boolean;
  pendingConfirm: boolean;
  emailLinkSent: boolean;
  handleSubmit: (event: FormEvent) => void;
  handleForgotPassword: (event: FormEvent) => void;
  handleResetPassword: (event: FormEvent) => void;
  handleEmailLink: () => void;
  onOAuth: (provider: "google" | "apple") => void;
  appleSignIn?: boolean;
  termsUrl?: string;
  error?: string;
  notice?: string;
};

/** Website markup shared verbatim; platform-specific auth stays in the adapters. */
export function AuthPageView({
  mode,
  setMode,
  intent,
  email,
  setEmail,
  password,
  setPassword,
  newPassword,
  setNewPassword,
  confirmPassword,
  setConfirmPassword,
  displayName,
  setDisplayName,
  acceptedTerms,
  setAcceptedTerms,
  shoppingAlerts,
  setShoppingAlerts,
  busy,
  pendingConfirm,
  emailLinkSent,
  handleSubmit,
  handleForgotPassword,
  handleResetPassword,
  handleEmailLink,
  onOAuth,
  appleSignIn = false,
  termsUrl = "/terms",
  error,
  notice,
}: AuthPageViewProps) {
  return (
    <div className="mx-auto max-w-[460px] px-4 py-6 sm:px-6 sm:py-10">
      <div className="soft-card overflow-hidden p-4 sm:p-6">
        {error && (
          <p role="alert" className="mb-3 text-sm text-destructive">
            {error}
          </p>
        )}
        {notice && (
          <p role="status" className="mb-3 text-sm text-muted-foreground">
            {notice}
          </p>
        )}
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
                onClick={() => onOAuth("google")}
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
              {appleSignIn && (
                <button
                  type="button"
                  onClick={() => onOAuth("apple")}
                  disabled={busy}
                  className="inline-flex h-11 w-full items-center justify-center gap-2.5 rounded-full border border-input bg-card text-[13.5px] font-medium transition-colors hover:bg-secondary disabled:opacity-60"
                >
                  Continue with Apple
                </button>
              )}
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
              {mode === "signup" && (
                <SignupShoppingChoices
                  accepted={acceptedTerms}
                  alerts={shoppingAlerts}
                  onAccepted={setAcceptedTerms}
                  onAlerts={setShoppingAlerts}
                  termsUrl={termsUrl}
                />
              )}
              <button
                type="submit"
                disabled={busy}
                className="inline-flex h-11 w-full items-center justify-center rounded-full bg-primary text-[13.5px] font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-60"
              >
                {mode === "signin" ? "Sign in" : "Create account"}
              </button>
            </form>

            {mode === "signin" ? (
              <div className="mt-3">
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void handleEmailLink()}
                  className="inline-flex h-11 w-full items-center justify-center rounded-full border border-input bg-card px-4 text-[12.5px] font-medium hover:bg-secondary disabled:opacity-60"
                >
                  Email me a sign-in link
                </button>
                {emailLinkSent ? (
                  <p role="status" className="mt-2 text-sm text-muted-foreground">
                    If this email has an account, a sign-in link is on its way. Open it to access
                    your account.
                  </p>
                ) : null}
              </div>
            ) : null}
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
