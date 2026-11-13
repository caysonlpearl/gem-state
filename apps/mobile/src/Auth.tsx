import { useState, type FormEvent } from "react";
import { Capacitor } from "@capacitor/core";
import { AuthPageView, type AuthMode } from "../../../src/components/account/AuthPageView";
import { authIntent } from "../../../src/lib/auth-intent";
import type { AuthReturnPath } from "../../../src/lib/auth-return-path";
import { MOBILE_AUTH_REDIRECT } from "../../../src/lib/mobile-contract";
import { api, apiOrigin, auth, socialLogin } from "./client";

/** Native session/callback adapter; the sign-in UI is the website's presenter. */
export function NativeAuth({
  policyVersion,
  destination,
  recovery = false,
  onRecovered,
}: {
  policyVersion: string;
  destination: string;
  recovery?: boolean;
  onRecovered?: () => void;
}) {
  const [mode, setMode] = useState<AuthMode>(recovery ? "reset" : "signin");
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
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const redirectTo = Capacitor.isNativePlatform()
    ? MOBILE_AUTH_REDIRECT
    : `${location.origin}/#/auth/callback`;
  const returnPath: AuthReturnPath =
    destination === "/saved"
      ? "/watchlist"
      : destination === "/post"
        ? "/create-listing"
        : destination.startsWith("/messages")
          ? "/messages"
          : "/account";
  async function run(work: () => Promise<void>) {
    if (busy) return;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await work();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong.");
    } finally {
      setBusy(false);
    }
  }
  function validEmail() {
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email.trim()))
      throw Error("Enter your email address first.");
  }
  function requireTerms() {
    if (mode === "signup" && !acceptedTerms)
      throw Error("Please agree to the Terms of Service to create your account.");
  }
  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    void run(async () => {
      requireTerms();
      if (mode === "signup") {
        const { data, error } = await auth.auth.signUp({
          email: email.trim(),
          password,
          options: {
            emailRedirectTo: redirectTo,
            data: {
              display_name: displayName || email.trim().split("@")[0],
              shopping_terms_version: policyVersion,
              shopping_alerts: shoppingAlerts,
            },
          },
        });
        if (error) throw error;
        if (!data.session) {
          setPendingConfirm(true);
          return;
        }
        await api("consent", "PUT", { acceptTerms: true, shoppingAlerts, version: policyVersion });
      } else {
        const { error } = await auth.auth.signInWithPassword({ email: email.trim(), password });
        if (error) throw error;
      }
    });
  }
  function handleForgotPassword(event: FormEvent) {
    event.preventDefault();
    void run(async () => {
      validEmail();
      const { error } = await auth.auth.resetPasswordForEmail(email.trim(), { redirectTo });
      if (error) throw error;
      setNotice("Password reset email sent. Check your inbox.");
    });
  }
  function handleResetPassword(event: FormEvent) {
    event.preventDefault();
    void run(async () => {
      if (newPassword.length < 8) throw Error("Use at least 8 characters for your new password.");
      if (newPassword !== confirmPassword) throw Error("Passwords do not match.");
      const { error } = await auth.auth.updateUser({ password: newPassword });
      if (error) throw error;
      onRecovered?.();
    });
  }
  return (
    <AuthPageView
      mode={mode}
      setMode={(next) => {
        setMode(next);
        setError("");
        setNotice("");
      }}
      intent={authIntent(returnPath)}
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
      handleEmailLink={() =>
        void run(async () => {
          validEmail();
          const { error } = await auth.auth.signInWithOtp({
            email: email.trim(),
            options: {
              shouldCreateUser: false,
              emailRedirectTo: redirectTo,
            },
          });
          if (error) throw error;
          setEmailLinkSent(true);
        })
      }
      onOAuth={(provider) =>
        void run(async () => {
          requireTerms();
          await socialLogin(provider);
        })
      }
      appleSignIn
      termsUrl={`${apiOrigin}/terms`}
      error={error}
      notice={notice}
    />
  );
}
