-- Source-only dependency of full listing/account erasure. Keep the worker
-- inactive until media, retention, authored content and identity compose fully.
BEGIN;
SET LOCAL search_path='';
SET LOCAL lock_timeout='5s';
DO $$ BEGIN
 IF NOT EXISTS(SELECT 1 FROM public.account_deletion_controls WHERE id AND NOT worker_enabled)
 OR NOT public.account_deletion_inquiry_barrier_current() OR NOT public.account_deletion_private_barrier_current()
 THEN RAISE EXCEPTION 'Review disabled application-erasure prerequisites'; END IF;
 IF NOT EXISTS(SELECT 1 FROM pg_class WHERE oid='public.job_applications'::regclass AND relkind='r' AND NOT relispartition)
 OR EXISTS(SELECT 1 FROM pg_inherits WHERE inhparent='public.job_applications'::regclass OR inhrelid='public.job_applications'::regclass)
 OR EXISTS(SELECT 1 FROM pg_rewrite WHERE ev_class='public.job_applications'::regclass)
 OR EXISTS(SELECT 1 FROM pg_constraint WHERE contype='f' AND confrelid='public.job_applications'::regclass)
 OR EXISTS(SELECT 1 FROM pg_trigger WHERE tgrelid='public.job_applications'::regclass AND NOT tgisinternal)
 OR (SELECT jsonb_object_agg(attname,jsonb_build_array(atttypid::regtype::text,attnotnull,attgenerated)) FROM pg_attribute WHERE attrelid='public.job_applications'::regclass AND attnum>0 AND NOT attisdropped) IS DISTINCT FROM
 '{"id":["uuid",true,""],"listing_id":["uuid",true,""],"applicant_id":["uuid",true,""],"resume_path":["text",true,""],"cover_letter":["text",false,""],"status":["text",true,""],"created_at":["timestamp with time zone",true,""],"updated_at":["timestamp with time zone",true,""]}'::jsonb
 OR (SELECT count(*) FROM pg_constraint WHERE conrelid='public.job_applications'::regclass AND contype<>'n')<>6
 OR (SELECT count(*) FROM pg_constraint c JOIN pg_attribute a ON a.attrelid=c.conrelid AND c.conkey=ARRAY[a.attnum]::smallint[] WHERE c.conrelid='public.job_applications'::regclass AND c.contype='f' AND c.confdeltype='c' AND NOT c.condeferrable AND c.convalidated AND ((a.attname='applicant_id' AND c.confrelid='auth.users'::regclass) OR (a.attname='listing_id' AND c.confrelid='public.asks'::regclass)))<>2
 THEN RAISE EXCEPTION 'Review application layout, hooks and child relationships'; END IF;
END $$;
ALTER TABLE public.job_applications ADD COLUMN unavailable_at timestamptz,
 ALTER COLUMN listing_id DROP NOT NULL,
 DROP CONSTRAINT job_applications_applicant_id_fkey,DROP CONSTRAINT job_applications_listing_id_fkey,
 ADD CONSTRAINT job_applications_applicant_id_fkey FOREIGN KEY(applicant_id) REFERENCES auth.users(id) ON DELETE RESTRICT,
 ADD CONSTRAINT job_applications_listing_id_fkey FOREIGN KEY(listing_id) REFERENCES public.asks(id) ON DELETE SET NULL,
 ADD CONSTRAINT job_applications_listing_availability CHECK((listing_id IS NULL)=(unavailable_at IS NOT NULL));
CREATE INDEX account_deletion_application_author ON public.job_applications(applicant_id,id);
CREATE INDEX account_deletion_application_listing ON public.job_applications(listing_id,id);
CREATE FUNCTION public.account_deletion_application_context(_user uuid) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$ DECLARE context jsonb; BEGIN
 context:=nullif(current_setting('bluebird.application_cleanup',true),'')::jsonb;
 RETURN context->>'user'=_user::text AND public.account_deletion_lease_current((context->>'id')::uuid,_user,(context->>'lease')::uuid,'records');
EXCEPTION WHEN OTHERS THEN RETURN false; END $$;
CREATE FUNCTION public.guard_account_deletion_application_writer() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' SET lock_timeout='1s' AS $$ DECLARE seller uuid; member uuid; BEGIN
 IF TG_OP='DELETE' AND public.account_deletion_application_context(OLD.applicant_id) THEN RETURN OLD; END IF;
 IF TG_OP='UPDATE' THEN
  IF NEW.id IS DISTINCT FROM OLD.id OR NEW.applicant_id IS DISTINCT FROM OLD.applicant_id OR NEW.created_at IS DISTINCT FROM OLD.created_at
  THEN RAISE EXCEPTION 'Application ownership is immutable'; END IF;
  IF NEW.listing_id IS NULL AND OLD.listing_id IS NOT NULL
  AND (to_jsonb(NEW)-ARRAY['listing_id','unavailable_at'])=(to_jsonb(OLD)-ARRAY['listing_id','unavailable_at']) THEN
   SELECT seller_id INTO seller FROM public.asks WHERE id=OLD.listing_id;
   IF NOT FOUND OR public.account_deletion_application_context(seller)
   THEN NEW.unavailable_at:=coalesce(OLD.unavailable_at,clock_timestamp()); RETURN NEW; END IF;
  END IF;
  IF NEW.listing_id IS DISTINCT FROM OLD.listing_id OR NEW.unavailable_at IS DISTINCT FROM OLD.unavailable_at
  THEN RAISE EXCEPTION 'Application listing is immutable'; END IF;
  IF NEW.listing_id IS NULL THEN RAISE EXCEPTION 'Application is read-only'; END IF;
 END IF;
 IF TG_OP='DELETE' THEN
  PERFORM public.assert_member_private_record_writer(OLD.applicant_id);
  SELECT seller_id INTO seller FROM public.asks WHERE id=OLD.listing_id;
  IF seller IS NOT NULL THEN PERFORM public.assert_member_private_record_writer(seller); END IF;
  RETURN OLD;
 END IF;
 IF NEW.listing_id IS NULL OR NEW.unavailable_at IS NOT NULL THEN RAISE EXCEPTION 'Application is unavailable'; END IF;
 SELECT seller_id INTO seller FROM public.asks WHERE id=NEW.listing_id;
 IF NOT FOUND THEN RAISE EXCEPTION 'Application listing is unavailable'; END IF;
 FOR member IN SELECT DISTINCT u FROM unnest(ARRAY[NEW.applicant_id,seller])u ORDER BY u LOOP PERFORM public.assert_member_private_record_writer(member); END LOOP;
 RETURN NEW;
END $$;
CREATE TRIGGER guard_account_deletion_application_writer BEFORE INSERT OR UPDATE OR DELETE ON public.job_applications FOR EACH ROW EXECUTE FUNCTION public.guard_account_deletion_application_writer();
CREATE FUNCTION public.account_deletion_application_catalog() RETURNS jsonb
LANGUAGE sql VOLATILE SECURITY DEFINER SET search_path='' AS $$
 SELECT jsonb_build_object(
 'relation',(SELECT jsonb_build_array(relkind,relispartition,relrowsecurity) FROM pg_class WHERE oid='public.job_applications'::regclass),
 'columns',(SELECT jsonb_agg(jsonb_build_array(a.attname,a.atttypid::regtype::text,a.atttypmod,a.attnotnull,a.attgenerated,pg_get_expr(d.adbin,d.adrelid)) ORDER BY a.attnum) FROM pg_attribute a LEFT JOIN pg_attrdef d ON d.adrelid=a.attrelid AND d.adnum=a.attnum WHERE a.attrelid='public.job_applications'::regclass AND a.attnum>0 AND NOT a.attisdropped),
 'constraints',(SELECT jsonb_agg(jsonb_build_array(conrelid::regclass::text,conname,pg_get_constraintdef(oid,true),convalidated,condeferrable,condeferred) ORDER BY conrelid,conname) FROM pg_constraint WHERE conrelid='public.job_applications'::regclass OR confrelid='public.job_applications'::regclass),
 'hooks',(SELECT jsonb_object_agg(tgname,jsonb_build_array(pg_get_triggerdef(oid,true),md5(pg_get_functiondef(tgfoid)),tgenabled)) FROM pg_trigger WHERE tgrelid='public.job_applications'::regclass AND NOT tgisinternal),
 'indexes',(SELECT jsonb_agg(pg_get_indexdef(indexrelid) ORDER BY indexrelid) FROM pg_index WHERE indrelid='public.job_applications'::regclass),
 'policies',(SELECT jsonb_agg(jsonb_build_array(polname,polcmd,polpermissive,polroles::text,pg_get_expr(polqual,polrelid),pg_get_expr(polwithcheck,polrelid))ORDER BY polname) FROM pg_policy WHERE polrelid='public.job_applications'::regclass),
 'rules',(SELECT coalesce(jsonb_agg(pg_get_ruledef(oid,true) ORDER BY oid),'[]') FROM pg_rewrite WHERE ev_class='public.job_applications'::regclass),
 'inheritance',(SELECT count(*) FROM pg_inherits WHERE inhparent='public.job_applications'::regclass OR inhrelid='public.job_applications'::regclass));
$$;
CREATE TABLE public.account_deletion_application_contract(id boolean PRIMARY KEY DEFAULT true CHECK(id),catalog jsonb NOT NULL,functions jsonb NOT NULL);
ALTER TABLE public.account_deletion_application_contract ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.account_deletion_application_contract FROM PUBLIC,anon,authenticated,service_role;
GRANT SELECT ON public.account_deletion_application_contract TO service_role;
CREATE FUNCTION public.account_deletion_application_remaining(_user uuid) RETURNS boolean
LANGUAGE sql VOLATILE SECURITY DEFINER SET search_path='' AS $$ SELECT EXISTS(SELECT 1 FROM public.job_applications WHERE applicant_id=_user) OR EXISTS(SELECT 1 FROM public.asks a JOIN public.job_applications j ON j.listing_id=a.id WHERE a.seller_id=_user); $$;
CREATE FUNCTION public.account_deletion_application_scope(_id uuid,_user uuid,_lease uuid,_phase text) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' SET lock_timeout='1s' AS $$ BEGIN
 PERFORM public.account_deletion_inquiry_scope(_id,_user,_lease,_phase);
 LOCK TABLE public.job_applications IN ROW EXCLUSIVE MODE;
 IF NOT public.account_deletion_application_barrier_current() THEN RAISE EXCEPTION 'Application erasure requires schema review'; END IF;
END $$;
CREATE FUNCTION public.purge_account_deletion_applications(_id uuid,_user uuid,_lease uuid,_limit integer DEFAULT 100) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' SET lock_timeout='1s' AS $$
DECLARE changed integer:=0; ids uuid[]; selected text; previous_context text:=coalesce(current_setting('bluebird.application_cleanup',true),''); BEGIN
 IF _limit IS NULL OR _limit NOT BETWEEN 1 AND 100 THEN RAISE EXCEPTION 'Application erasure unavailable'; END IF;
 PERFORM public.account_deletion_application_scope(_id,_user,_lease,'records');
 PERFORM 1 FROM auth.users WHERE id=_user FOR KEY SHARE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Application identity is unavailable'; END IF;
 PERFORM set_config('bluebird.application_cleanup',jsonb_build_object('id',_id,'user',_user,'lease',_lease)::text,true);
 SELECT array_agg(id) INTO ids FROM(SELECT id FROM public.job_applications WHERE applicant_id=_user ORDER BY id LIMIT _limit FOR UPDATE)targets;
 IF ids IS NOT NULL THEN
  IF EXISTS(SELECT 1 FROM public.job_applications j WHERE j.id=ANY(ids) AND NOT EXISTS(
   SELECT 1 FROM public.account_deletion_media_observations o JOIN public.account_deletion_inventory_runs r ON r.job_id=o.job_id
   WHERE o.job_id=_id AND o.snapshot->'reference'->>'state'='resolved' AND EXISTS(SELECT 1 FROM public.account_deletion_inventory_cursors c WHERE c.job_id=_id AND c.source='job_applications' AND c.done) AND o.source='job_applications' AND o.record_key=j.id::text AND o.last_generation=r.generation AND o.snapshot->'reference'=public.account_deletion_media_reference('job-application-resumes',j.resume_path)))
  THEN RAISE EXCEPTION 'Application resume inventory is incomplete'; END IF;
  DELETE FROM public.job_applications WHERE id=ANY(ids) AND applicant_id=_user;
  GET DIAGNOSTICS changed=ROW_COUNT; selected:='authored';
 ELSE
  -- Parent first: ownership cannot change between selecting and unlinking a
  -- listing. Each application remains private to its original applicant.
  SELECT array_agg(id) INTO ids FROM(SELECT j.id FROM public.asks a JOIN public.job_applications j ON j.listing_id=a.id WHERE a.seller_id=_user ORDER BY a.id,j.id LIMIT _limit FOR UPDATE OF a,j)targets;
  IF ids IS NOT NULL THEN
   UPDATE public.job_applications SET listing_id=NULL WHERE id=ANY(ids);
   GET DIAGNOSTICS changed=ROW_COUNT; selected:='listing';
  END IF;
 END IF;
 PERFORM set_config('bluebird.application_cleanup',previous_context,true);
 IF NOT public.account_deletion_lease_current(_id,_user,_lease,'records') OR NOT public.account_deletion_application_barrier_current()
 OR public.account_access_coverage() IS DISTINCT FROM jsonb_build_object('unguarded_functions',0,'unguarded_tables',0,'helper_privilege_gaps',0)
 THEN RAISE EXCEPTION 'Application erasure unavailable'; END IF;
 RETURN jsonb_build_object('source',selected,'changed',changed,'pass_done',NOT public.account_deletion_application_remaining(_user));
EXCEPTION WHEN OTHERS THEN PERFORM set_config('bluebird.application_cleanup',previous_context,true); RAISE;
END $$;
CREATE FUNCTION public.verify_account_deletion_applications(_id uuid,_user uuid,_lease uuid) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' SET lock_timeout='1s' AS $$ BEGIN
 PERFORM public.account_deletion_application_scope(_id,_user,_lease,'verification');
 RETURN NOT public.account_deletion_application_remaining(_user) AND public.account_deletion_lease_current(_id,_user,_lease,'verification');
END $$;
CREATE FUNCTION public.guard_account_deletion_application_completion() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$ BEGIN
 IF NEW.status='completed' AND (NOT public.account_deletion_application_barrier_current() OR public.account_deletion_application_remaining(OLD.user_id))
 THEN RAISE EXCEPTION 'Application erasure verification required'; END IF; RETURN NEW;
END $$;
CREATE TRIGGER guard_account_deletion_application_completion AFTER UPDATE OF status,user_id ON public.account_deletion_jobs FOR EACH ROW EXECUTE FUNCTION public.guard_account_deletion_application_completion();
CREATE FUNCTION public.account_deletion_application_functions() RETURNS jsonb
LANGUAGE sql VOLATILE SECURITY DEFINER SET search_path='' AS $$
 SELECT jsonb_object_agg(p.oid::regprocedure::text,md5(pg_get_functiondef(p.oid))) FROM pg_proc p WHERE p.oid IN(
 'public.account_deletion_application_context(uuid)'::regprocedure,'public.guard_account_deletion_application_writer()'::regprocedure,
 'public.account_deletion_application_catalog()'::regprocedure,'public.account_deletion_application_remaining(uuid)'::regprocedure,
 'public.account_deletion_application_scope(uuid,uuid,uuid,text)'::regprocedure,'public.purge_account_deletion_applications(uuid,uuid,uuid,integer)'::regprocedure,
 'public.verify_account_deletion_applications(uuid,uuid,uuid)'::regprocedure,'public.guard_account_deletion_application_completion()'::regprocedure,
 'public.account_deletion_application_functions()'::regprocedure,to_regprocedure('public.account_deletion_application_barrier_current()'));
$$;
CREATE FUNCTION public.account_deletion_application_barrier_current() RETURNS boolean
LANGUAGE sql VOLATILE SECURITY DEFINER SET search_path='' AS $$ SELECT EXISTS(SELECT 1 FROM public.account_deletion_application_contract WHERE id AND catalog=public.account_deletion_application_catalog() AND functions=public.account_deletion_application_functions()); $$;
UPDATE public.account_deletion_private_contract SET hooks=public.account_deletion_private_hooks() WHERE id;
INSERT INTO public.account_deletion_application_contract SELECT true,public.account_deletion_application_catalog(),public.account_deletion_application_functions();
REVOKE ALL ON FUNCTION public.account_deletion_application_context(uuid),public.guard_account_deletion_application_writer(),public.account_deletion_application_catalog(),public.account_deletion_application_remaining(uuid),public.account_deletion_application_scope(uuid,uuid,uuid,text),public.purge_account_deletion_applications(uuid,uuid,uuid,integer),public.verify_account_deletion_applications(uuid,uuid,uuid),public.guard_account_deletion_application_completion(),public.account_deletion_application_functions(),public.account_deletion_application_barrier_current() FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.purge_account_deletion_applications(uuid,uuid,uuid,integer),public.verify_account_deletion_applications(uuid,uuid,uuid) TO service_role;
SELECT public.protect_account_access_boundaries();
DO $$ BEGIN
 IF NOT public.account_deletion_application_barrier_current() OR NOT public.account_deletion_inquiry_barrier_current() OR NOT public.account_deletion_private_barrier_current()
 THEN RAISE EXCEPTION 'Application erasure boundaries require review'; END IF;
END $$;
COMMIT;
