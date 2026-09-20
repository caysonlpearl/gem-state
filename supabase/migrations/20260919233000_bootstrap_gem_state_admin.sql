-- The Gem State operations console is administrator-only.
-- Bootstrap the known project-owner account without baking in a mutable auth UUID.
DO $bootstrap$
DECLARE
  owner_user_id uuid;
BEGIN
  SELECT id
    INTO owner_user_id
    FROM auth.users
   WHERE lower(email) = lower('cayson@xstayproperties.com')
   ORDER BY created_at
   LIMIT 1;

  IF owner_user_id IS NULL THEN
    RAISE NOTICE 'Gem State admin bootstrap skipped: owner account not found';
    RETURN;
  END IF;

  INSERT INTO public.user_roles (user_id, role, granted_by)
  SELECT owner_user_id, 'admin'::public.app_role, owner_user_id
   WHERE NOT EXISTS (
     SELECT 1
       FROM public.user_roles
      WHERE user_id = owner_user_id
        AND role = 'admin'::public.app_role
   );
END;
$bootstrap$;
