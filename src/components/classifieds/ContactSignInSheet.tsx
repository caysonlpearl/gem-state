import { useState } from "react";
import { toast } from "sonner";
import { ContactSignInSheetView } from "./ContactSignInSheetView";

import { supabase } from "@/integrations/supabase/client";
import { getAuthRedirectUrl } from "@/lib/auth-redirect";

export {
  consumeContactIntent,
  OPEN_CONTACT_EVENT,
  OPEN_LISTING_MESSAGE_EVENT,
  rememberContactIntent,
} from "@/lib/listing-contact-events";

import { rememberContactIntent } from "@/lib/listing-contact-events";

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
        options: {
          redirectTo: getAuthRedirectUrl(`/auth?redirect=${returnTo}`),
        },
      });
      if (error) toast.error("Google sign-in failed. Try email instead.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <ContactSignInSheetView
      open={open}
      onOpenChange={onOpenChange}
      isJob={isJob}
      email={email}
      password={password}
      busy={busy}
      onEmail={setEmail}
      onPassword={setPassword}
      handleSubmit={handleSubmit}
      handleGoogle={handleGoogle}
      signupUrl={`/auth?mode=signup&redirect=${returnTo}`}
      forgotUrl={`/auth?mode=forgot&redirect=${returnTo}`}
      rememberContact={() => rememberContactIntent(listingId)}
    />
  );
}
