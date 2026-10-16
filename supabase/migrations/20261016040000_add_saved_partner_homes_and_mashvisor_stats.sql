-- Mashvisor homes are partner listings, so member favorites are stored apart
-- from Bluebird's product watchlist. Listing stats accept their stable IDs.
CREATE TABLE IF NOT EXISTS public.saved_partner_homes (
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  listing_id text NOT NULL CHECK (listing_id ~ '^mashvisor-[0-9]{1,15}$'),
  snapshot jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, listing_id)
);

ALTER TABLE public.saved_partner_homes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Members read their saved partner homes" ON public.saved_partner_homes
  FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY "Members save partner homes" ON public.saved_partner_homes
  FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());
CREATE POLICY "Members update their saved partner homes" ON public.saved_partner_homes
  FOR UPDATE TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE POLICY "Members remove their saved partner homes" ON public.saved_partner_homes
  FOR DELETE TO authenticated USING (user_id = auth.uid());

ALTER TABLE public.listing_view_counts
  DROP CONSTRAINT IF EXISTS listing_view_counts_listing_id_check;
ALTER TABLE public.listing_view_counts
  ADD CONSTRAINT listing_view_counts_listing_id_check
  CHECK (listing_id ~ '^([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}|adzuna-[0-9]{1,20}|mashvisor-[0-9]{1,15})$');
