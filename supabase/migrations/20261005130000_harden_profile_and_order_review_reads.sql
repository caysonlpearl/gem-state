-- Keep public identity display data separate from member-only profile data.
-- The old policy exposed every profiles column to anonymous callers.
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Anyone can read display profiles" ON public.profiles;
DROP POLICY IF EXISTS "Users read their own profile" ON public.profiles;
CREATE POLICY "Members read their own profile"
ON public.profiles FOR SELECT TO authenticated
USING (id = auth.uid());

REVOKE ALL ON TABLE public.profiles FROM anon, authenticated;
GRANT SELECT, UPDATE ON TABLE public.profiles TO authenticated;

CREATE OR REPLACE VIEW public.public_profile_display AS
SELECT id, display_name, avatar_url
FROM public.profiles;

REVOKE ALL ON public.public_profile_display FROM anon, authenticated;
GRANT SELECT ON public.public_profile_display TO anon, authenticated;

-- order_reviews is a legacy transaction table and is not a public storefront
-- review surface. Keep it inaccessible to browser roles until an order-review
-- workflow with explicit participant rules is intentionally reintroduced.
ALTER TABLE public.order_reviews ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.order_reviews FROM anon, authenticated;

CREATE OR REPLACE FUNCTION public.get_my_profile()
RETURNS TABLE (
  display_name text,
  avatar_url text,
  home_resort_code text,
  primary_intent text,
  onboarded_at timestamptz,
  created_at timestamptz
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT p.display_name, p.avatar_url, p.home_resort_code, p.primary_intent,
         p.onboarded_at, p.created_at
  FROM public.profiles p
  WHERE p.id = auth.uid();
$$;

REVOKE ALL ON FUNCTION public.get_my_profile() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_my_profile() TO authenticated;
