-- Phase 4 dealership identity and inventory traceability.
CREATE TABLE IF NOT EXISTS public.dealer_profiles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  legal_name text NOT NULL CHECK (char_length(btrim(legal_name)) BETWEEN 2 AND 160),
  display_name text NOT NULL CHECK (char_length(btrim(display_name)) BETWEEN 2 AND 120),
  slug text NOT NULL UNIQUE CHECK (slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
  phone text,
  email text,
  website text,
  address_line1 text,
  address_line2 text,
  city text,
  state text CHECK (state IS NULL OR state ~ '^[A-Z]{2}$'),
  postal_code text CHECK (postal_code IS NULL OR postal_code ~ '^[0-9]{5}(?:-[0-9]{4})?$'),
  logo_url text,
  description text CHECK (description IS NULL OR char_length(description) <= 500),
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'ready', 'suspended')),
  agreements_accepted_at timestamptz,
  agreements_version text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (owner_user_id)
);

CREATE TABLE IF NOT EXISTS public.dealer_members (
  dealer_id uuid NOT NULL REFERENCES public.dealer_profiles(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role text NOT NULL DEFAULT 'staff' CHECK (role IN ('owner', 'manager', 'inventory')),
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'invited', 'disabled')),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (dealer_id, user_id)
);

ALTER TABLE public.dealer_inventory_sources
  ADD COLUMN IF NOT EXISTS dealer_id uuid REFERENCES public.dealer_profiles(id) ON DELETE SET NULL;
ALTER TABLE public.dealer_inventory_sync_runs
  ADD COLUMN IF NOT EXISTS actor_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS dealer_profiles_slug_idx ON public.dealer_profiles (slug);
CREATE INDEX IF NOT EXISTS dealer_members_user_idx ON public.dealer_members (user_id, status);
CREATE INDEX IF NOT EXISTS dealer_inventory_sources_dealer_idx ON public.dealer_inventory_sources (dealer_id, status);

ALTER TABLE public.dealer_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.dealer_members ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Dealer owners and staff read dealer profiles" ON public.dealer_profiles;
CREATE POLICY "Dealer owners and staff read dealer profiles"
ON public.dealer_profiles FOR SELECT TO authenticated
USING (
  owner_user_id = auth.uid()
  OR EXISTS (
    SELECT 1 FROM public.dealer_members member
    WHERE member.dealer_id = dealer_profiles.id
      AND member.user_id = auth.uid()
      AND member.status = 'active'
  )
  OR public.is_staff(auth.uid())
);

DROP POLICY IF EXISTS "Dealer owners manage dealer profiles" ON public.dealer_profiles;
CREATE POLICY "Dealer owners manage dealer profiles"
ON public.dealer_profiles FOR ALL TO authenticated
USING (owner_user_id = auth.uid() OR public.is_staff(auth.uid()))
WITH CHECK (owner_user_id = auth.uid() OR public.is_staff(auth.uid()));

DROP POLICY IF EXISTS "Dealer members read their memberships" ON public.dealer_members;
CREATE POLICY "Dealer members read their memberships"
ON public.dealer_members FOR SELECT TO authenticated
USING (user_id = auth.uid() OR EXISTS (
  SELECT 1 FROM public.dealer_profiles dealer
  WHERE dealer.id = dealer_members.dealer_id
    AND dealer.owner_user_id = auth.uid()
) OR public.is_staff(auth.uid()));

DROP POLICY IF EXISTS "Dealer owners manage memberships" ON public.dealer_members;
CREATE POLICY "Dealer owners manage memberships"
ON public.dealer_members FOR ALL TO authenticated
USING (EXISTS (
  SELECT 1 FROM public.dealer_profiles dealer
  WHERE dealer.id = dealer_members.dealer_id
    AND (dealer.owner_user_id = auth.uid() OR public.is_staff(auth.uid()))
))
WITH CHECK (EXISTS (
  SELECT 1 FROM public.dealer_profiles dealer
  WHERE dealer.id = dealer_members.dealer_id
    AND (dealer.owner_user_id = auth.uid() OR public.is_staff(auth.uid()))
));

CREATE OR REPLACE FUNCTION public.set_dealer_updated_at()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;
DROP TRIGGER IF EXISTS dealer_profiles_touch ON public.dealer_profiles;
CREATE TRIGGER dealer_profiles_touch BEFORE UPDATE ON public.dealer_profiles
FOR EACH ROW EXECUTE FUNCTION public.set_dealer_updated_at();

GRANT SELECT, INSERT, UPDATE ON public.dealer_profiles, public.dealer_members TO authenticated;
GRANT ALL ON public.dealer_profiles, public.dealer_members TO service_role;

-- Existing inventory operators keep their access; source ownership is now also scoped to a dealer.
GRANT SELECT, INSERT, UPDATE ON public.dealer_inventory_sources, public.dealer_inventory_sync_runs TO authenticated;
