import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { useAuth } from "@/hooks/useAuth";
import { loadSupabase } from "@/integrations/supabase/lazy-client";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";

export const FIREARMS_CONSENT_KEY = "firearms_consent_at";

/** Signed-in members who already consented skip the dialog; guests see it every visit. */
export function needsFirearmsConsent(metadata: Record<string, unknown> | null | undefined) {
  return !metadata || typeof metadata[FIREARMS_CONSENT_KEY] !== "string";
}

export function FirearmsConsentDialog() {
  const { user, loading } = useAuth();
  const [open, setOpen] = useState(false);
  const [safety, setSafety] = useState(false);
  const [age, setAge] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (loading) return;
    setOpen(needsFirearmsConsent(user?.user_metadata));
  }, [loading, user]);

  async function accept() {
    setSaving(true);
    try {
      if (user) {
        const supabase = await loadSupabase();
        await supabase.auth.updateUser({ data: { [FIREARMS_CONSENT_KEY]: new Date().toISOString() } });
      }
      setOpen(false);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open}>
      <DialogContent
        className="max-w-md [&>button]:hidden"
        onEscapeKeyDown={(e) => e.preventDefault()}
        onPointerDownOutside={(e) => e.preventDefault()}
        onInteractOutside={(e) => e.preventDefault()}
      >
        <DialogHeader>
          <DialogTitle>Firearms & gear safety</DialogTitle>
          <DialogDescription>
            We want to encourage safe transactions and the responsible use of firearms.
          </DialogDescription>
        </DialogHeader>
        <ul className="list-disc space-y-1.5 pl-5 text-sm text-muted-foreground">
          <li>Follow all federal, state, and local laws, including background checks and transfer rules.</li>
          <li>Meet in safe public places and verify the buyer is legally allowed to own a firearm.</li>
          <li>Store and transport firearms unloaded and secured.</li>
          <li>Bluebird does not handle or ship firearms, run background checks, or verify buyers.</li>
        </ul>
        <Link to="/firearms-safety" className="text-sm font-medium text-primary underline">
          Read the full firearm safety statement
        </Link>
        <div className="space-y-3 pt-1">
          <label className="flex items-start gap-3 text-sm">
            <Checkbox checked={safety} onCheckedChange={(v) => setSafety(v === true)} className="mt-0.5" />
            I agree to follow the firearm safety guidelines and all applicable laws.
          </label>
          <label className="flex items-start gap-3 text-sm">
            <Checkbox checked={age} onCheckedChange={(v) => setAge(v === true)} className="mt-0.5" />
            I confirm I am 18 years of age or older.
          </label>
        </div>
        <div className="flex gap-2 pt-2">
          <Button variant="outline" className="flex-1" asChild>
            <Link to="/">Leave</Link>
          </Button>
          <Button className="flex-1" disabled={!safety || !age || saving} onClick={accept}>
            Continue
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
