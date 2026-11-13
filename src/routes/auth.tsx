import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { AuthPageView } from "@/components/account/AuthPageView";
import { authIntent } from "@/lib/auth-intent";
import { SHOPPING_POLICY_VERSION } from "@/lib/shopping-contract";
import { toast } from "sonner";
import { brand } from "@/config/brand";
import { supabase } from "@/integrations/supabase/client";
import { getAuthRedirectUrl } from "@/lib/auth-redirect";
import {
  safeAuthReturnPath,
  authReturnSearch,
  listingReturnTarget,
  type AuthReturnPath,
  type StaticAuthRedirect,
} from "@/lib/auth-return-path";

export const Route = createFileRoute("/auth")({
  validateSearch: (search: Record<string, unknown>): AuthSearch => {
    const redirect = safeAuthReturnPath(search["redirect"]);
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
type AuthRedirect = AuthReturnPath;
type StaticRedirect = StaticAuthRedirect;
type AuthSearch = { redirect?: AuthRedirect | undefined; mode?: Mode | undefined };

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
  const [acceptedTerms, setAcceptedTerms] = useState(false);
  const [shoppingAlerts, setShoppingAlerts] = useState(false);
  const [busy, setBusy] = useState(false);
  const [pendingConfirm, setPendingConfirm] = useState(false);
  const [emailLinkSent, setEmailLinkSent] = useState(false);
  const intent = authIntent(redirect);
  const goToRedirect = () => {
    const listing = listingReturnTarget(redirect);
    if (listing) {
      return listing.edit
        ? navigate({ to: "/listings/$listingId/edit", params: { listingId: listing.listingId } })
        : navigate({ to: "/listings/$listingId", params: { listingId: listing.listingId } });
    }
    if (redirect.startsWith("/dealers/")) {
      return navigate({
        to: "/dealers/$slug",
        params: { slug: redirect.slice("/dealers/".length) },
      });
    }
    const query = authReturnSearch(redirect);
    if (redirect.startsWith("/account?")) {
      return navigate({
        to: "/account",
        search: { section: query.section ?? "overview", conversation: query.conversation },
      });
    }
    if (redirect.startsWith("/create-listing?")) {
      return navigate({ to: "/create-listing", search: { duplicateFrom: query.duplicateFrom } });
    }
    return navigate({ to: redirect as StaticRedirect });
  };

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
        if (!acceptedTerms)
          throw new Error("Please agree to the Terms of Service to create your account.");
        const { data, error } = await supabase.auth.signUp({
          email,
          password,
          options: {
            emailRedirectTo: getAuthRedirectUrl(`/auth?redirect=${encodeURIComponent(redirect)}`),
            data: {
              display_name: displayName || email.split("@")[0],
              shopping_terms_version: SHOPPING_POLICY_VERSION,
              shopping_alerts: shoppingAlerts,
            },
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

  async function handleEmailLink() {
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email.trim())) {
      toast.error("Enter your email address first.");
      return;
    }
    setBusy(true);
    try {
      const { error } = await supabase.auth.signInWithOtp({
        email: email.trim(),
        options: {
          shouldCreateUser: false,
          emailRedirectTo: getAuthRedirectUrl(`/auth?redirect=${encodeURIComponent(redirect)}`),
        },
      });
      if (error) throw error;
      setEmailLinkSent(true);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not send a sign-in link.");
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
    if (mode === "signup" && !acceptedTerms) {
      toast.error("Please agree to the Terms of Service to create your account.");
      return;
    }
    if (mode === "signup") {
      try {
        sessionStorage.setItem(
          "bb.shopping.signup",
          JSON.stringify({ at: Date.now(), shoppingAlerts }),
        );
      } catch {
        /* Complete choices after sign-in if storage is unavailable. */
      }
    }
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
    <AuthPageView
      mode={mode}
      setMode={setMode}
      intent={intent}
      email={email}
      setEmail={setEmail}
      password={password}
      setPassword={setPassword}
      newPassword={newPassword}
      setNewPassword={setNewPassword}
      confirmPassword={confirmPassword}
      setConfirmPassword={setConfirmPassword}
      displayName={displayName}
      setDisplayName={setDisplayName}
      acceptedTerms={acceptedTerms}
      setAcceptedTerms={setAcceptedTerms}
      shoppingAlerts={shoppingAlerts}
      setShoppingAlerts={setShoppingAlerts}
      busy={busy}
      pendingConfirm={pendingConfirm}
      emailLinkSent={emailLinkSent}
      handleSubmit={handleSubmit}
      handleForgotPassword={handleForgotPassword}
      handleResetPassword={handleResetPassword}
      handleEmailLink={handleEmailLink}
      onOAuth={() => void handleOAuth()}
    />
  );
}
