-- Saved partner jobs (Adzuna). Bluebird's watchlist saves products, and
-- partner jobs aren't products, so members save them here. The snapshot is
-- the job card as it was when saved (partner postings come and go), written
-- by the server from its own cache, never from the browser.
CREATE TABLE IF NOT EXISTS public.saved_partner_jobs (
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  listing_id text NOT NULL CHECK (listing_id ~ '^adzuna-[0-9]{1,20}$'),
  snapshot jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, listing_id)
);

ALTER TABLE public.saved_partner_jobs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members read their saved partner jobs" ON public.saved_partner_jobs
  FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY "Members save partner jobs" ON public.saved_partner_jobs
  FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());
CREATE POLICY "Members update their saved partner jobs" ON public.saved_partner_jobs
  FOR UPDATE TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE POLICY "Members remove saved partner jobs" ON public.saved_partner_jobs
  FOR DELETE TO authenticated USING (user_id = auth.uid());
