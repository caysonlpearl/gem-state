import { useEffect, useState } from "react";
import type { Session, User } from "@supabase/supabase-js";
import { loadSupabase } from "@/integrations/supabase/lazy-client";

export function useAuth() {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    let unsubscribe = () => {};
    void loadSupabase().then((supabase) => {
      if (!active) return;
      const { data: subscription } = supabase.auth.onAuthStateChange((_event, nextSession) => {
        setSession(nextSession);
        setLoading(false);
      });
      unsubscribe = () => subscription.subscription.unsubscribe();

      void supabase.auth.getSession().then(({ data }) => {
        if (!active) return;
        setSession(data.session);
        setLoading(false);
      });
    });

    return () => {
      active = false;
      unsubscribe();
    };
  }, []);

  const user: User | null = session?.user ?? null;
  return { session, user, loading, isSignedIn: Boolean(user) };
}
