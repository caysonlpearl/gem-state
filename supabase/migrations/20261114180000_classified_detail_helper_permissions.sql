-- Internal category/pet helpers must not be direct anonymous/member RPCs.
-- Existing owner-checked SECURITY DEFINER listing flows keep invoking them.
BEGIN;
SET LOCAL search_path='';
DO $$
DECLARE helper record; proc record;
BEGIN
 IF public.account_access_coverage() IS DISTINCT FROM jsonb_build_object('unguarded_functions',0,'unguarded_tables',0,'helper_privilege_gaps',0)
 THEN RAISE EXCEPTION 'Review account access boundaries before helper permissions'; END IF;
 FOR helper IN SELECT * FROM (VALUES
  ('public._apply_classified_category_details(uuid,jsonb,jsonb,jsonb)','5c828c65bc7efa360a626d3727756844'),
  ('public._apply_classified_pet_details(uuid,jsonb)','ad2bc12f4bb71a6777a7d04f7aec958d')
 ) AS expected(signature,body_md5)
 LOOP
  SELECT p.oid,p.prosrc,p.prosecdef INTO proc FROM pg_proc p WHERE p.oid=to_regprocedure(helper.signature);
  IF proc.oid IS NULL OR NOT proc.prosecdef OR md5(proc.prosrc)<>helper.body_md5
  OR NOT has_function_privilege('service_role',proc.oid,'EXECUTE')
  OR NOT EXISTS(SELECT 1 FROM public.account_access_protected_functions g WHERE g.function_oid=proc.oid AND g.protected_body_md5=helper.body_md5)
  THEN RAISE EXCEPTION 'Review classified detail helper definition: %',helper.signature; END IF;
 END LOOP;
END $$;

-- Supabase default privileges can grant anon/authenticated explicitly, so
-- revoking PUBLIC alone is insufficient. Preserve the existing service access.
REVOKE ALL ON FUNCTION public._apply_classified_category_details(uuid,jsonb,jsonb,jsonb),public._apply_classified_pet_details(uuid,jsonb)
 FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public._apply_classified_category_details(uuid,jsonb,jsonb,jsonb),public._apply_classified_pet_details(uuid,jsonb)
 TO service_role;

DO $$
DECLARE helper record; caller record;
BEGIN
 FOR helper IN SELECT p.oid,p.proname,p.proowner FROM pg_proc p
 WHERE p.oid=ANY(ARRAY[to_regprocedure('public._apply_classified_category_details(uuid,jsonb,jsonb,jsonb)'),to_regprocedure('public._apply_classified_pet_details(uuid,jsonb)')])
 LOOP
  IF has_function_privilege('anon',helper.oid,'EXECUTE') OR has_function_privilege('authenticated',helper.oid,'EXECUTE')
  OR NOT has_function_privilege('service_role',helper.oid,'EXECUTE')
  THEN RAISE EXCEPTION 'Classified helper permissions require review'; END IF;
  -- A caller with a different definer owner must retain real execution rights;
  -- never assume all deployed functions were created by the same owner.
  FOR caller IN SELECT p.oid,p.proowner,p.prosecdef FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
   WHERE n.nspname='public' AND p.oid<>helper.oid AND position(helper.proname IN p.prosrc)>0
  LOOP
   IF NOT caller.prosecdef OR NOT has_function_privilege(caller.proowner,helper.oid,'EXECUTE')
   THEN RAISE EXCEPTION 'Review classified helper caller: %',caller.oid::regprocedure; END IF;
  END LOOP;
 END LOOP;
 IF public.account_access_coverage() IS DISTINCT FROM jsonb_build_object('unguarded_functions',0,'unguarded_tables',0,'helper_privilege_gaps',0)
 THEN RAISE EXCEPTION 'Classified helper boundary coverage requires review'; END IF;
END $$;
NOTIFY pgrst,'reload schema';
COMMIT;
