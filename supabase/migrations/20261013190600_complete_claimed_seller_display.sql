-- Preserve existing names and create public profiles omitted by legacy signup.
DO $$
DECLARE definition text;
BEGIN
 SELECT pg_get_functiondef('public.finish_seller_claim(uuid,uuid,boolean,boolean)'::regprocedure) INTO definition;
 IF position(' INSERT INTO public.seller_profiles(user_id,slug,status,terms_version,terms_accepted_at)' in definition)=0 THEN
  RAISE EXCEPTION 'Claim function changed; inspect before applying profile repair';
 END IF;
 definition:=replace(definition,' INSERT INTO public.seller_profiles(user_id,slug,status,terms_version,terms_accepted_at)',
 ' INSERT INTO public.profiles(id,display_name) VALUES(_claimant,s.display_name) ON CONFLICT(id) DO UPDATE SET display_name=coalesce(nullif(btrim(profiles.display_name),''''),excluded.display_name);
 INSERT INTO public.seller_profiles(user_id,slug,status,terms_version,terms_accepted_at)');
 EXECUTE definition;
END $$;
NOTIFY pgrst,'reload schema';
