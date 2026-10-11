import { useState } from "react";
import { toast } from "sonner";

import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { supabase } from "@/integrations/supabase/client";

/** Fired by the mobile contact bar; ListingActions opens the message form. */
export const OPEN_CONTACT_EVENT = "bluebird:open-contact";

// Survives the round trip through Google or the full sign-up page, so the
// buyer lands back on the listing with the message form already open.
const OPEN_CONTACT_KEY = "bluebird:open-contact-listing";

export function rememberContactIntent(listingId: string) {
  try {
    sessionStorage.setItem(OPEN_CONTACT_KEY, listingId);
  } catch {
    // Private mode or blocked storage: they just won't auto-open the form.
  }
}

export function consumeContactIntent(listingId: string): boolean {
  try {
    if (sessionStorage.getItem(OPEN_CONTACT_KEY) !== listingId) return false;
    sessionStorage.removeItem(OPEN_CONTACT_KEY);
    return true;
  } catch {
    return false;
  }
}

/**
 * Sign-in in place, over the listing, instead of sending a buyer to a
 * separate page at the exact moment they've decided to reach out.
 */
export function ContactSignInSheet({
  open,
  onOpenChange,
  onSignedIn,
  listingId,
  isJob = false,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSignedIn: () => void;
  listingId: string;
  isJob?: boolean;
}) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const returnTo = encodeURIComponent(`/listings/${listingId}`);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    try {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) throw error;
      setPassword("");
      onSignedIn();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not sign you in.");
    } finally {
      setBusy(false);
    }
  }

  async function handleGoogle() {
    rememberContactIntent(listingId);
    setBusy(true);
    try {
      const { error } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: { redirectTo: `${window.location.origin}/auth?redirect=${returnTo}` },
      });
      if (error) toast.error("Google sign-in failed. Try email instead.");
    } finally {
      setBusy(false);
    }
  }

  const inputClass =
    "mt-1.5 h-12 w-full rounded-2xl border border-input bg-background px-4 text-[16px] outline-none focus-visible:ring-2 focus-visible:ring-ring";

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="bottom"
        className="max-h-[92dvh] overflow-y-auto rounded-t-[24px] px-5 pb-[calc(env(safe-area-inset-bottom)+1.5rem)] pt-6"
      >
        <SheetHeader className="text-left">
          <SheetTitle className="text-[20px] font-bold tracking-tight">
            {isJob ? "Sign in to apply" : "Sign in to message the seller"}
          </SheetTitle>
          <SheetDescription className="text-[13px]">
            You'll come right back to this listing with your message ready to send.
          </SheetDescription>
        </SheetHeader>

        <button
          type="button"
          onClick={handleGoogle}
          disabled={busy}
          className="mt-5 flex h-12 w-full items-center justify-center gap-2 rounded-full border border-input bg-background text-[14.5px] font-semibold disabled:opacity-60"
        >
          Continue with Google
        </button>

        <div className="my-4 flex items-center gap-3 text-[11px] uppercase tracking-[0.12em] text-muted-foreground">
          <span className="h-px flex-1 bg-border" /> or <span className="h-px flex-1 bg-border" />
        </div>

        <form onSubmit={handleSubmit} className="space-y-3">
          <label className="block text-[13px] font-medium">
            Email
            <input
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              className={inputClass}
            />
          </label>
          <label className="block text-[13px] font-medium">
            Password
            <input
              type="password"
              autoComplete="current-password"
              required
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              className={inputClass}
            />
          </label>
          <button
            type="submit"
            disabled={busy}
            className="h-12 w-full rounded-full bg-primary text-[14.5px] font-semibold text-primary-foreground disabled:opacity-60"
          >
            {busy ? "Signing in…" : "Sign in"}
          </button>
        </form>

        <div className="mt-4 flex items-center justify-between text-[13px]">
          <a
            href={`/auth?mode=signup&redirect=${returnTo}`}
            onClick={() => rememberContactIntent(listingId)}
            className="font-semibold text-primary"
          >
            Create an account
          </a>
          <a
            href={`/auth?mode=forgot&redirect=${returnTo}`}
            onClick={() => rememberContactIntent(listingId)}
            className="text-muted-foreground"
          >
            Forgot password?
          </a>
        </div>
      </SheetContent>
    </Sheet>
  );
}
