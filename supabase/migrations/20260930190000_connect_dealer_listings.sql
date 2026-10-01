-- Phase 4: carry verified dealership identity through moderated marketplace listings.
ALTER TABLE public.asks
  ADD COLUMN IF NOT EXISTS dealer_id uuid REFERENCES public.dealer_profiles(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS asks_dealer_id_idx ON public.asks (dealer_id) WHERE dealer_id IS NOT NULL;

DROP POLICY IF EXISTS "Public can read ready dealer profiles" ON public.dealer_profiles;
CREATE POLICY "Public can read ready dealer profiles"
ON public.dealer_profiles FOR SELECT TO anon, authenticated
USING (status = 'ready' AND agreements_accepted_at IS NOT NULL);

CREATE TABLE IF NOT EXISTS public.dealer_audit_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  dealer_id uuid REFERENCES public.dealer_profiles(id) ON DELETE SET NULL,
  actor_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  action text NOT NULL CHECK (char_length(btrim(action)) BETWEEN 2 AND 80),
  target_type text NOT NULL CHECK (char_length(btrim(target_type)) BETWEEN 2 AND 80),
  target_id text,
  result text NOT NULL DEFAULT 'success' CHECK (result IN ('success', 'failed')),
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS dealer_audit_events_dealer_created_idx
  ON public.dealer_audit_events (dealer_id, created_at DESC);

ALTER TABLE public.dealer_audit_events ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Dealer operators read audit events" ON public.dealer_audit_events;
CREATE POLICY "Dealer operators read audit events"
ON public.dealer_audit_events FOR SELECT TO authenticated
USING (
  public.is_staff(auth.uid())
  OR EXISTS (
    SELECT 1 FROM public.dealer_profiles dealer
    WHERE dealer.id = dealer_audit_events.dealer_id
      AND dealer.owner_user_id = auth.uid()
  )
);

GRANT SELECT ON public.dealer_audit_events TO authenticated;
GRANT ALL ON public.dealer_audit_events TO service_role;
