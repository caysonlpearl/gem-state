-- OpenWeb Ninja homes use the same saved-home and view-count behavior as
-- Mashvisor homes, with a provider-specific ID prefix.
CREATE TABLE IF NOT EXISTS public.saved_partner_homes (
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  listing_id text NOT NULL CHECK (listing_id ~ '^(mashvisor-[0-9]{1,15}|openwebninja-[0-9]{1,20})$'),
  snapshot jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, listing_id)
);

ALTER TABLE public.saved_partner_homes ENABLE ROW LEVEL SECURITY;
DO $$
BEGIN
  CREATE POLICY "Members read their saved partner homes" ON public.saved_partner_homes
    FOR SELECT TO authenticated USING (user_id = auth.uid());
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$
BEGIN
  CREATE POLICY "Members save partner homes" ON public.saved_partner_homes
    FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$
BEGIN
  CREATE POLICY "Members update their saved partner homes" ON public.saved_partner_homes
    FOR UPDATE TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$
BEGIN
  CREATE POLICY "Members remove their saved partner homes" ON public.saved_partner_homes
    FOR DELETE TO authenticated USING (user_id = auth.uid());
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE public.saved_partner_homes
  DROP CONSTRAINT IF EXISTS saved_partner_homes_listing_id_check;
ALTER TABLE public.saved_partner_homes
  ADD CONSTRAINT saved_partner_homes_listing_id_check
  CHECK (listing_id ~ '^(mashvisor-[0-9]{1,15}|openwebninja-[0-9]{1,20})$');

ALTER TABLE public.listing_view_counts
  DROP CONSTRAINT IF EXISTS listing_view_counts_listing_id_check;
ALTER TABLE public.listing_view_counts
  ADD CONSTRAINT listing_view_counts_listing_id_check
  CHECK (listing_id ~ '^([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}|adzuna-[0-9]{1,20}|mashvisor-[0-9]{1,15}|openwebninja-[0-9]{1,20})$');
