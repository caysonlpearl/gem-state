-- profiles.SELECT was restricted to `id = auth.uid()`, which silently broke
-- every public-facing `profiles!fk(display_name, avatar_url)` embed used to
-- show who wrote a seller review (on the storefront page and the seller's
-- own dashboard) -- the embedded profile came back empty for anyone except
-- the reviewer looking at their own row, so reviewer names never rendered.
-- profiles has no sensitive columns (id, display_name, avatar_url,
-- home_resort_code, primary_intent, timestamps), so a public read is safe;
-- write policies are unchanged and still self-only.

DROP POLICY IF EXISTS "Users read their own profile" ON public.profiles;
CREATE POLICY "Anyone can read display profiles"
ON public.profiles
FOR SELECT
TO anon, authenticated
USING (true);
