import { createFileRoute, Link, useLocation, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { completeSellerClaim, inspectSellerClaim } from "@/lib/seller-claims.functions";
import { getAuthRedirectUrl } from "@/lib/auth-redirect";
import { parseSellerClaimFragment } from "@/lib/seller-claims";

export const Route = createFileRoute("/claim-seller")({
  head: () => ({
    meta: [
      { title: "Claim your listings · Bluebird Marketplace" },
      { name: "robots", content: "noindex,nofollow" },
      { name: "referrer", content: "no-referrer" },
    ],
  }),
  component: ClaimSeller,
});
const KEY = "bluebird_pending_seller_claim";
function readToken() {
  if (typeof window === "undefined") return "";
  const { token: value } = parseSellerClaimFragment(window.location.hash);
  if (value === "") return "";
  if (value && /^[a-f0-9]{64}$/.test(value)) {
    sessionStorage.setItem(KEY, value);
    return value;
  }
  return sessionStorage.getItem(KEY) ?? "";
}
function ClaimSeller() {
  const navigate = useNavigate();
  const location = useLocation();
  const [token, setToken] = useState(readToken);
  useEffect(() => {
    setToken(readToken());
  }, [location.hash]);
  useEffect(() => {
    const returned = parseSellerClaimFragment(window.location.hash);
    if (returned.authError) {
      setNotice(
        "This verification link is expired or unavailable. Sign in, or request a new verification email.",
      );
      window.history.replaceState(
        null,
        "",
        `/claim-seller${returned.token ? `#token=${returned.token}` : ""}`,
      );
      return;
    }
    if (!returned.accessToken || !returned.refreshToken) return;
    // Remove authentication credentials immediately; the private claim remains.
    window.history.replaceState(
      null,
      "",
      `/claim-seller${returned.token ? `#token=${returned.token}` : ""}`,
    );
    void supabase.auth
      .setSession({
        access_token: returned.accessToken,
        refresh_token: returned.refreshToken,
      })
      .then(({ error }) => {
        if (error)
          setError(
            "Your email was verified, but sign-in did not finish. Sign in below to continue.",
          );
      });
  }, [location.hash]);
  const inspect = useServerFn(inspectSellerClaim);
  const complete = useServerFn(completeSellerClaim);
  const [details, setDetails] = useState<Awaited<ReturnType<typeof inspect>> | null>(null);
  const [account, setAccount] = useState<{
    id: string;
    email?: string;
    email_confirmed_at?: string;
  } | null>(null);
  const [mode, setMode] = useState<"signup" | "signin">("signup");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [terms, setTerms] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [done, setDone] = useState(false);
  const lock = useRef(false);
  useEffect(() => {
    setDetails(null);
    setError("");
    if (!token) {
      setError("This link is incomplete. Ask Bluebird for a new claim link.");
      return;
    }
    let alive = true;
    inspect({ data: { token } })
      .then((d) => {
        if (alive) {
          setDetails(d);
          if (d.existingAccount) setMode("signin");
        }
      })
      .catch(() => {
        if (alive) setError("We could not load your listings. Refresh this page to retry.");
      });
    supabase.auth.getUser().then(({ data }) => {
      if (alive) setAccount(data.user);
    });
    const { data } = supabase.auth.onAuthStateChange((_event, session) => {
      if (alive) setAccount(session?.user ?? null);
    });
    return () => {
      alive = false;
      data.subscription.unsubscribe();
    };
  }, [token, inspect]);
  async function authenticate(e: React.FormEvent) {
    e.preventDefault();
    if (lock.current) return;
    lock.current = true;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      if (mode === "signup") {
        if (!terms) throw new Error("Accept the seller agreement to continue.");
        if (password !== confirm) throw new Error("Your passwords do not match.");
        if (password.length < 8) throw new Error("Use at least 8 characters for your password.");
        const { data, error } = await supabase.auth.signUp({
          email: email.trim(),
          password,
          options: {
            emailRedirectTo: getAuthRedirectUrl(`/claim-seller#token=${token}`),
            data: { display_name: details?.sellerName || "Seller" },
          },
        });
        if (error) throw error;
        if (data.user?.identities?.length === 0)
          throw new Error("You may already have an account. Sign in or reset your password.");
        setPassword("");
        setConfirm("");
        if (data.session) setAccount(data.session.user);
        else
          setNotice(
            "Check your email to verify your account, then return here to claim your listings. If you already have an account, choose Sign in.",
          );
      } else {
        const { data, error } = await supabase.auth.signInWithPassword({
          email: email.trim(),
          password,
        });
        if (error) throw error;
        setAccount(data.user);
        setPassword("");
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "We could not sign you in. Try again.");
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }
  async function claim() {
    if (lock.current) return;
    lock.current = true;
    setBusy(true);
    setError("");
    try {
      await complete({ data: { token, acceptTerms: terms, syncEnabled: true } });
      sessionStorage.removeItem(KEY);
      window.history.replaceState(null, "", "/claim-seller");
      setDone(true);
      toast.success("Your imported listings and buyer messages are now in your account.", {
        action: {
          label: "View messages",
          onClick: () => void navigate({ to: "/account", search: { section: "messages" } }),
        },
      });
      await navigate({ to: "/account", search: { section: "listings" } });
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "Claiming failed. Your listings are unchanged; retry.",
      );
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }
  async function resend() {
    setBusy(true);
    setError("");
    try {
      const address = account?.email || email.trim();
      if (!address) throw new Error("Enter your email first.");
      const { error } = await supabase.auth.resend({
        type: "signup",
        email: address,
        options: { emailRedirectTo: getAuthRedirectUrl(`/claim-seller#token=${token}`) },
      });
      if (error) throw error;
      setNotice("Verification email requested. Check your inbox.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not resend. Try again.");
    } finally {
      setBusy(false);
    }
  }
  async function googleSignIn() {
    if (lock.current) return;
    lock.current = true;
    setBusy(true);
    setError("");
    try {
      const { error } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: { redirectTo: getAuthRedirectUrl(`/claim-seller#token=${token}`) },
      });
      if (error) throw error;
    } catch {
      setError("Google sign-in did not finish. Please try again.");
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }
  const unavailable = details && details.status !== "Unclaimed";
  return (
    <main className="mx-auto max-w-[540px] px-5 py-6 sm:py-10">
      <section className="rounded-3xl border border-border bg-card p-5 shadow-sm sm:p-7">
        <div className="mb-5 flex items-center gap-4">
          <img
            src="/images/brand/bluebird-signin-bird.webp"
            onError={(e) => {
              e.currentTarget.style.display = "none";
            }}
            alt=""
            className="h-20 w-20 object-contain"
          />
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-primary">
              Bluebird Marketplace
            </p>
            <h1 className="mt-1 text-2xl font-bold">
              {done ? "Your listings are yours" : "Claim your listings"}
            </h1>
          </div>
        </div>
        {done ? (
          <>
            <p>Your imported listings and buyer messages are now in your account.</p>
            <div className="mt-5 grid gap-3">
              <Link
                to="/account"
                search={{ section: "listings" }}
                className="inline-flex min-h-11 items-center justify-center rounded-full bg-primary px-5 py-3 text-sm font-semibold text-primary-foreground hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50 text-center"
              >
                View my listings
              </Link>
              <Link
                to="/account"
                search={{ section: "messages" }}
                className="inline-flex min-h-11 items-center justify-center rounded-full border border-border bg-background px-5 py-3 text-sm font-semibold hover:bg-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50 text-center"
              >
                View buyer messages
              </Link>
              <Link
                to="/account"
                search={{ section: "listings" }}
                className="text-center text-sm underline"
              >
                Manage Facebook sync
              </Link>
            </div>
          </>
        ) : (
          <>
            {details && unavailable ? (
              <div>
                <h2 className="font-semibold">
                  {details.status === "Claimed"
                    ? "These listings have already been claimed"
                    : details.status === "Expired"
                      ? "This claim link has expired"
                      : details.status === "Revoked"
                        ? "This claim link was replaced or revoked"
                        : "This claim link is invalid"}
                </h2>
                <p className="mt-2 text-sm text-muted-foreground">
                  Ask Bluebird for a replacement link, or sign in if you already claimed your
                  listings.
                </p>
                <Link to="/auth" className="mt-4 inline-block underline">
                  Sign in
                </Link>
              </div>
            ) : (
              <>
                {details ? (
                  <>
                    <p className="text-sm">
                      We’ve prepared{" "}
                      <strong>
                        {details.count} {details.count === 1 ? "listing" : "listings"}
                      </strong>{" "}
                      for <strong>{details.sellerName}</strong>.
                    </p>
                    <div className="my-4 space-y-2">
                      {details.previews.map((p, i) => (
                        <div
                          key={i}
                          className="flex items-center gap-3 rounded-xl bg-secondary/50 p-2"
                        >
                          {p.imageUrl && (
                            <img
                              src={p.imageUrl}
                              alt=""
                              className="h-12 w-12 rounded-lg object-cover"
                            />
                          )}
                          <span className="min-w-0 text-sm">{p.title}</span>
                        </div>
                      ))}
                    </div>
                    {details.pendingCount > 0 && (
                      <p className="mb-4 text-sm text-muted-foreground">
                        Some imports are still being prepared by Bluebird. They will be saved in
                        your account and will go live after review.
                      </p>
                    )}
                  </>
                ) : !error ? (
                  <p role="status">Loading your listings…</p>
                ) : null}
                {details && (
                  <>
                    {account ? (
                      <div className="mb-4 rounded-xl bg-secondary p-3 text-sm">
                        <p>
                          Signed in as <strong>{account.email}</strong>
                        </p>
                        <button
                          type="button"
                          onClick={() => void supabase.auth.signOut()}
                          className="mt-1 underline"
                          disabled={busy}
                        >
                          Use a different account
                        </button>
                      </div>
                    ) : (
                      <form onSubmit={authenticate} className="space-y-3">
                        <div className="flex gap-5 text-sm">
                          {!details.existingAccount && (
                            <button
                              type="button"
                              onClick={() => {
                                setMode("signup");
                                setError("");
                              }}
                              aria-pressed={mode === "signup"}
                              className={
                                mode === "signup" ? "font-bold underline" : "text-muted-foreground"
                              }
                            >
                              Create account
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={() => {
                              setMode("signin");
                              setError("");
                            }}
                            aria-pressed={mode === "signin"}
                            className={
                              mode === "signin" ? "font-bold underline" : "text-muted-foreground"
                            }
                          >
                            Already have an account? Sign in
                          </button>
                        </div>
                        {details.existingAccount && (
                          <p className="text-sm text-muted-foreground">
                            These listings are already linked to a Bluebird account. Sign in to that
                            account to continue.
                          </p>
                        )}
                        {mode === "signin" && (
                          <button
                            type="button"
                            disabled={busy}
                            onClick={() => void googleSignIn()}
                            className="w-full rounded-full border border-border bg-background px-4 py-3 text-sm font-semibold"
                          >
                            Continue with Google
                          </button>
                        )}
                        <label className="block text-sm">
                          Email
                          <input
                            className="mt-1 h-11 w-full rounded-xl border border-input bg-background px-3 text-base outline-none focus-visible:ring-2 focus-visible:ring-ring"
                            type="email"
                            autoComplete="email"
                            value={email}
                            onChange={(e) => setEmail(e.target.value)}
                            required
                          />
                        </label>
                        <label className="block text-sm">
                          Password
                          <input
                            className="mt-1 h-11 w-full rounded-xl border border-input bg-background px-3 text-base outline-none focus-visible:ring-2 focus-visible:ring-ring"
                            type="password"
                            autoComplete={mode === "signup" ? "new-password" : "current-password"}
                            minLength={mode === "signup" ? 8 : undefined}
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            required
                          />
                        </label>
                        {mode === "signup" && (
                          <label className="block text-sm">
                            Confirm password
                            <input
                              className="mt-1 h-11 w-full rounded-xl border border-input bg-background px-3 text-base outline-none focus-visible:ring-2 focus-visible:ring-ring"
                              type="password"
                              autoComplete="new-password"
                              minLength={8}
                              value={confirm}
                              onChange={(e) => setConfirm(e.target.value)}
                              required
                            />
                          </label>
                        )}
                        {mode === "signup" && (
                          <label className="flex items-start gap-2 text-sm">
                            <input
                              type="checkbox"
                              checked={terms}
                              onChange={(e) => setTerms(e.target.checked)}
                              required
                            />
                            <span>
                              I accept the{" "}
                              <a
                                href="/policies#seller-terms"
                                target="_blank"
                                rel="noreferrer"
                                className="underline"
                              >
                                seller and photo-display agreement
                              </a>
                              .
                            </span>
                          </label>
                        )}
                        <button
                          className="inline-flex min-h-11 items-center justify-center rounded-full bg-primary px-5 py-3 text-sm font-semibold text-primary-foreground hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50 w-full"
                          disabled={busy || !details}
                        >
                          {busy ? "Working…" : mode === "signup" ? "Create my account" : "Sign in"}
                        </button>
                        {mode === "signin" && (
                          <Link
                            to="/auth"
                            search={{ mode: "forgot", redirect: "/claim-seller" }}
                            className="inline-block text-sm underline"
                          >
                            Forgot password?
                          </Link>
                        )}
                      </form>
                    )}
                    {account && !account.email_confirmed_at ? (
                      <div className="mt-4 text-sm">
                        <p>Verify your email before claiming these listings.</p>
                        <button
                          className="inline-flex min-h-11 items-center justify-center rounded-full border border-border bg-background px-5 py-3 text-sm font-semibold hover:bg-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50 mt-3"
                          onClick={() => void resend()}
                          disabled={busy}
                        >
                          Resend verification email
                        </button>
                      </div>
                    ) : null}
                    {account?.email_confirmed_at && (
                      <div className="space-y-4">
                        <label className="flex items-start gap-2 text-sm">
                          <input
                            type="checkbox"
                            checked={terms}
                            onChange={(e) => setTerms(e.target.checked)}
                          />
                          <span>
                            I accept the{" "}
                            <a
                              href="/policies#seller-terms"
                              target="_blank"
                              rel="noreferrer"
                              className="underline"
                            >
                              seller and photo-display agreement
                            </a>{" "}
                            and confirm these are my listings.
                          </span>
                        </label>
                        <div className="rounded-xl border border-border bg-secondary/40 px-4 py-3 text-sm">
                          <p className="font-medium">Your imported listings stay in sync.</p>
                          <p className="mt-1 leading-relaxed text-muted-foreground">
                            Bluebird checks the source platform for price and description changes
                            and sold listings. You can edit your listings on Bluebird; conflicting
                            sync updates will be held for review instead of overwriting your edits.
                          </p>
                        </div>
                        <button
                          onClick={() => void claim()}
                          className="inline-flex min-h-11 items-center justify-center rounded-full bg-primary px-5 py-3 text-sm font-semibold text-primary-foreground hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50 w-full"
                          disabled={busy || !terms}
                        >
                          {busy ? "Transferring your listings…" : "Claim my listings"}
                        </button>
                      </div>
                    )}
                    {notice && (
                      <p role="status" className="mt-4 text-sm">
                        {notice}{" "}
                        <button
                          type="button"
                          onClick={() => void resend()}
                          disabled={busy}
                          className="underline"
                        >
                          Resend email
                        </button>
                      </p>
                    )}
                  </>
                )}
              </>
            )}
            {error && (
              <p role="alert" className="mt-4 text-sm text-destructive">
                {error}
              </p>
            )}
          </>
        )}
      </section>
    </main>
  );
}
