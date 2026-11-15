-- Source-only community-report cleanup; no activation, Auth or provider erasure.
BEGIN;SET LOCAL search_path='';SET LOCAL lock_timeout='5s';
DO $$ DECLARE expected_columns jsonb:=$columns${"sighting_confirmations":{"id":["uuid",true,"gen_random_uuid()",""],"sighting_id":["uuid",true,null,""],"user_id":["uuid",true,null,""],"kind":["text",true,null,""],"created_at":["timestamp with time zone",true,"now()",""]},"sightings":{"id":["uuid",true,"gen_random_uuid()",""],"variant_id":["uuid",true,null,""],"location_id":["uuid",true,null,""],"reporter_id":["uuid",true,null,""],"seen_at":["timestamp with time zone",true,null,""],"availability":["sighting_availability",true,null,""],"price_cents":["integer",false,null,""],"currency":["character(3)",true,"'USD'::bpchar",""],"note":["text",false,null,""],"confirmation_count":["integer",true,"0",""],"flag_count":["integer",true,"0",""],"hidden":["boolean",true,"false",""],"is_demo":["boolean",true,"false",""],"created_at":["timestamp with time zone",true,"now()",""],"updated_at":["timestamp with time zone",true,"now()",""],"source_type":["price_evidence_source",true,"'member_report'::price_evidence_source",""],"evidence_path":["text",false,null,""],"verified_by":["uuid",false,null,""],"verified_at":["timestamp with time zone",false,null,""]}}$columns$::jsonb;
 expected_constraints jsonb:=$constraints${"sighting_confirmations.sighting_confirmation_kind":"CHECK (kind = ANY (ARRAY['confirm'::text, 'flag'::text]))","sighting_confirmations.sighting_confirmations_pkey":"PRIMARY KEY (id)","sighting_confirmations.sighting_confirmations_sighting_id_fkey":"FOREIGN KEY (sighting_id) REFERENCES sightings(id) ON DELETE CASCADE","sighting_confirmations.sighting_confirmations_sighting_id_user_id_key":"UNIQUE (sighting_id, user_id)","sighting_confirmations.sighting_confirmations_user_id_fkey":"FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE","sightings.sightings_counts_non_negative":"CHECK (confirmation_count >= 0 AND flag_count >= 0)","sightings.sightings_location_id_fkey":"FOREIGN KEY (location_id) REFERENCES locations(id)","sightings.sightings_note_length":"CHECK (note IS NULL OR char_length(note) <= 280)","sightings.sightings_pkey":"PRIMARY KEY (id)","sightings.sightings_price_range":"CHECK (price_cents IS NULL OR price_cents > 0 AND price_cents <= 500000)","sightings.sightings_reporter_id_fkey":"FOREIGN KEY (reporter_id) REFERENCES auth.users(id) ON DELETE CASCADE","sightings.sightings_variant_id_fkey":"FOREIGN KEY (variant_id) REFERENCES product_variants(id) ON DELETE CASCADE","sightings.sightings_verified_by_fkey":"FOREIGN KEY (verified_by) REFERENCES auth.users(id)"}$constraints$::jsonb;
 expected_hooks jsonb:=$hooks${"sightings.sightings_touch_updated_at":["CREATE TRIGGER sightings_touch_updated_at BEFORE UPDATE ON sightings FOR EACH ROW EXECUTE FUNCTION set_updated_at()","9b1889f56258bf9d6554213c05019c76",false,null,"O"]}$hooks$::jsonb;
 sources text[]:=ARRAY['sightings','sighting_confirmations'];target text;actual jsonb;
BEGIN
 PERFORM 1 FROM public.account_deletion_controls WHERE id AND NOT worker_enabled FOR SHARE;
 IF NOT FOUND OR NOT public.account_deletion_private_barrier_current()OR NOT public.account_deletion_submission_barrier_current()OR NOT public.account_deletion_catalog_barrier_current()OR NOT public.account_deletion_listing_barrier_current()
 OR public.account_access_coverage()IS DISTINCT FROM jsonb_build_object('unguarded_functions',0,'unguarded_tables',0,'helper_privilege_gaps',0)THEN RAISE EXCEPTION 'Review disabled sighting prerequisites';END IF;
 FOREACH target IN ARRAY sources LOOP
  EXECUTE format('LOCK TABLE public.%I IN SHARE ROW EXCLUSIVE MODE',target);
  IF NOT EXISTS(SELECT 1 FROM pg_class WHERE oid=format('public.%I',target)::regclass AND relkind='r'AND NOT relispartition)
   OR EXISTS(SELECT 1 FROM pg_inherits WHERE inhparent=format('public.%I',target)::regclass OR inhrelid=format('public.%I',target)::regclass)
   OR EXISTS(SELECT 1 FROM pg_rewrite WHERE ev_class=format('public.%I',target)::regclass)THEN RAISE EXCEPTION 'Review sighting layout';END IF;
 END LOOP;
 SELECT jsonb_object_agg(relname,cols)INTO actual FROM(SELECT c.relname,jsonb_object_agg(a.attname,jsonb_build_array(replace(format_type(a.atttypid,a.atttypmod),'public.',''),a.attnotnull,replace(pg_get_expr(d.adbin,d.adrelid),'public.',''),a.attgenerated))cols
 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace JOIN pg_attribute a ON a.attrelid=c.oid LEFT JOIN pg_attrdef d ON d.adrelid=a.attrelid AND d.adnum=a.attnum
 WHERE n.nspname='public'AND c.relname=ANY(sources)AND a.attnum>0 AND NOT a.attisdropped GROUP BY c.relname)r;
 IF actual IS DISTINCT FROM expected_columns THEN RAISE EXCEPTION 'Review sighting columns';END IF;
 SELECT jsonb_object_agg(replace(conrelid::regclass::text,'public.','')||'.'||conname,replace(pg_get_constraintdef(oid,true),'public.',''))INTO actual FROM pg_constraint WHERE contype<>'n'AND(conrelid IN(SELECT c.oid FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public'AND c.relname=ANY(sources))OR confrelid IN(SELECT c.oid FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public'AND c.relname=ANY(sources)));
 IF actual IS DISTINCT FROM expected_constraints THEN RAISE EXCEPTION 'Review sighting relationships';END IF;
 SELECT coalesce(jsonb_object_agg(c.relname||'.'||t.tgname,jsonb_build_array(replace(pg_get_triggerdef(t.oid,true),'public.',''),md5(p.prosrc),p.prosecdef,p.proconfig,t.tgenabled)),'{}')INTO actual FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid JOIN pg_namespace n ON n.oid=c.relnamespace JOIN pg_proc p ON p.oid=t.tgfoid WHERE n.nspname='public'AND c.relname=ANY(sources)AND NOT t.tgisinternal;
 IF actual IS DISTINCT FROM expected_hooks THEN RAISE EXCEPTION 'Review sighting hooks';END IF;
 IF (SELECT md5(prosrc)FROM pg_proc WHERE oid='public.report_sighting(uuid,uuid,public.sighting_availability,integer,text,timestamp with time zone)'::regprocedure)IS DISTINCT FROM '6cb6b2e6b68235d6d85f238fcc7533d8'THEN RAISE EXCEPTION 'Review sighting member functions';END IF;
 IF (SELECT md5(prosrc)FROM pg_proc WHERE oid='public.respond_to_sighting(uuid,text)'::regprocedure)IS DISTINCT FROM '304235ef5b6f3ecb6d078f0ea07f4e23'THEN RAISE EXCEPTION 'Review sighting member functions';END IF;
 IF replace(pg_get_viewdef('public.variant_sightings_public'::regclass,true),'public.','')IS DISTINCT FROM $view$ SELECT s.id AS sighting_id,
    s.variant_id,
    s.location_id,
    l.name AS location_name,
    l.area AS location_area,
    l.granularity AS location_granularity,
    p.name AS park_name,
    r.code AS resort_code,
    r.name AS resort_name,
    s.seen_at,
    s.availability,
    s.price_cents,
    s.currency,
    s.note,
    s.confirmation_count
   FROM sightings s
     JOIN locations l ON l.id = s.location_id
     JOIN parks p ON p.id = l.park_id
     JOIN resorts r ON r.id = p.resort_id
  WHERE NOT s.hidden AND NOT s.is_demo AND s.flag_count < 3 AND s.seen_at > (now() - '90 days'::interval);$view$THEN RAISE EXCEPTION 'Review public sighting view';END IF;
END $$;

ALTER TABLE public.sightings DROP CONSTRAINT sightings_reporter_id_fkey,
 ADD CONSTRAINT sightings_reporter_id_fkey FOREIGN KEY(reporter_id)REFERENCES auth.users(id)ON DELETE RESTRICT;
ALTER TABLE public.sighting_confirmations ALTER COLUMN sighting_id DROP NOT NULL,ADD COLUMN unavailable_at timestamptz,
 DROP CONSTRAINT sighting_confirmations_sighting_id_fkey,DROP CONSTRAINT sighting_confirmations_user_id_fkey,
 ADD CONSTRAINT sighting_confirmations_sighting_id_fkey FOREIGN KEY(sighting_id)REFERENCES public.sightings(id)ON DELETE SET NULL,
 ADD CONSTRAINT sighting_confirmations_user_id_fkey FOREIGN KEY(user_id)REFERENCES auth.users(id)ON DELETE RESTRICT,
 ADD CONSTRAINT sighting_confirmations_retired_parent CHECK((sighting_id IS NULL)=(unavailable_at IS NOT NULL));
CREATE INDEX account_deletion_sighting_reporter ON public.sightings(reporter_id,id);
CREATE INDEX account_deletion_sighting_verifier ON public.sightings(verified_by,id);
CREATE INDEX account_deletion_sighting_responder ON public.sighting_confirmations(user_id,id);
CREATE FUNCTION public.account_deletion_sighting_context(_user uuid)RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=''AS $$DECLARE context jsonb;actor uuid;BEGIN
 context:=nullif(current_setting('bluebird.sighting_cleanup',true),'')::jsonb;
 IF context IS NULL THEN RETURN false;END IF;actor:=(context->>'user')::uuid;
 IF _user IS NOT NULL AND actor IS DISTINCT FROM _user THEN RETURN false;END IF;
 RETURN public.account_deletion_lease_current((context->>'id')::uuid,actor,(context->>'lease')::uuid,'records')AND public.account_deletion_sighting_barrier_current();
EXCEPTION WHEN OTHERS THEN RETURN false;END $$;
CREATE FUNCTION public.guard_account_deletion_sighting_writer()RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=''SET lock_timeout='1s'AS $$
DECLARE actor uuid;parent uuid;BEGIN
 IF TG_TABLE_NAME='sightings'THEN
  IF TG_OP='DELETE'AND public.account_deletion_sighting_context(OLD.reporter_id)THEN RETURN OLD;END IF;
  IF TG_OP='UPDATE'THEN
   IF NEW.reporter_id IS DISTINCT FROM OLD.reporter_id THEN RAISE EXCEPTION 'Sighting authorship is immutable';END IF;
   -- Only truthful removal of confirmation influence, never moderation reversal.
   IF public.account_deletion_sighting_context(NULL)AND NEW.confirmation_count<=OLD.confirmation_count
    AND NEW.confirmation_count=(SELECT count(*)FROM public.sighting_confirmations WHERE sighting_id=OLD.id AND kind='confirm')
    AND(to_jsonb(NEW)-ARRAY['confirmation_count','updated_at'])=(to_jsonb(OLD)-ARRAY['confirmation_count','updated_at'])THEN RETURN NEW;END IF;
  END IF;
  actor:=CASE WHEN TG_OP='DELETE'THEN OLD.reporter_id ELSE NEW.reporter_id END;
  PERFORM public.assert_member_private_record_writer(actor);
  IF TG_OP<>'DELETE'AND NEW.verified_by IS NOT NULL AND(TG_OP='INSERT'OR NEW.verified_by IS DISTINCT FROM OLD.verified_by)THEN PERFORM public.assert_member_private_record_writer(NEW.verified_by);END IF;
 ELSE
  IF TG_OP='DELETE'AND public.account_deletion_sighting_context(OLD.user_id)THEN RETURN OLD;END IF;
  IF TG_OP='UPDATE'THEN
   IF NEW.user_id IS DISTINCT FROM OLD.user_id THEN RAISE EXCEPTION 'Sighting response ownership is immutable';END IF;
   IF NEW.sighting_id IS NULL AND OLD.sighting_id IS NOT NULL
    AND(to_jsonb(NEW)-ARRAY['sighting_id','unavailable_at'])=(to_jsonb(OLD)-ARRAY['sighting_id','unavailable_at'])
    AND(EXISTS(SELECT 1 FROM public.sightings WHERE id=OLD.sighting_id AND public.account_deletion_sighting_context(reporter_id))OR NOT EXISTS(SELECT 1 FROM public.sightings WHERE id=OLD.sighting_id))
   THEN NEW.unavailable_at:=coalesce(NEW.unavailable_at,clock_timestamp());RETURN NEW;END IF;
   IF NEW.sighting_id IS DISTINCT FROM OLD.sighting_id THEN RAISE EXCEPTION 'Sighting response parent is immutable';END IF;
   IF OLD.unavailable_at IS NOT NULL OR NEW.unavailable_at IS DISTINCT FROM OLD.unavailable_at THEN RAISE EXCEPTION 'Sighting response is read-only';END IF;
  END IF;
  actor:=CASE WHEN TG_OP='DELETE'THEN OLD.user_id ELSE NEW.user_id END;
  PERFORM public.assert_member_private_record_writer(actor);
  parent:=CASE WHEN TG_OP='DELETE'THEN OLD.sighting_id ELSE NEW.sighting_id END;
  IF parent IS NOT NULL THEN
   SELECT reporter_id INTO actor FROM public.sightings WHERE id=parent FOR SHARE;
   IF NOT FOUND THEN RAISE EXCEPTION 'Sighting is unavailable';END IF;
   PERFORM public.assert_member_private_record_writer(actor);
  END IF;
 END IF;
 IF TG_OP='DELETE'THEN RETURN OLD;ELSE RETURN NEW;END IF;
END $$;
CREATE TRIGGER account_deletion_sighting_writer BEFORE INSERT OR UPDATE OR DELETE ON public.sightings FOR EACH ROW EXECUTE FUNCTION public.guard_account_deletion_sighting_writer();
CREATE TRIGGER account_deletion_sighting_writer BEFORE INSERT OR UPDATE OR DELETE ON public.sighting_confirmations FOR EACH ROW EXECUTE FUNCTION public.guard_account_deletion_sighting_writer();
CREATE FUNCTION public.account_deletion_sighting_remaining(_user uuid)RETURNS boolean LANGUAGE sql VOLATILE SECURITY DEFINER SET search_path=''AS $$
 SELECT EXISTS(SELECT 1 FROM public.sightings WHERE reporter_id=_user OR verified_by=_user)OR EXISTS(SELECT 1 FROM public.sighting_confirmations WHERE user_id=_user);
$$;
CREATE FUNCTION public.account_deletion_sighting_catalog()RETURNS jsonb LANGUAGE sql VOLATILE SECURITY DEFINER SET search_path=''AS $$
 WITH sources AS(SELECT c.oid FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public'AND c.relname=ANY(ARRAY['sightings','sighting_confirmations']))
 SELECT jsonb_build_object(
 'public_view',jsonb_build_array(pg_get_viewdef('public.variant_sightings_public'::regclass,true),(SELECT reloptions FROM pg_class WHERE oid='public.variant_sightings_public'::regclass)),'relations',(SELECT jsonb_agg(jsonb_build_array(oid::regclass::text,relkind,relispartition,relrowsecurity)ORDER BY oid)FROM pg_class WHERE oid IN(SELECT oid FROM sources)),
 'columns',(SELECT jsonb_agg(jsonb_build_array(a.attrelid::regclass::text,a.attname,a.atttypid::regtype::text,a.atttypmod,a.attnotnull,a.attgenerated,pg_get_expr(d.adbin,d.adrelid))ORDER BY a.attrelid,a.attnum)FROM pg_attribute a LEFT JOIN pg_attrdef d ON d.adrelid=a.attrelid AND d.adnum=a.attnum WHERE a.attrelid IN(SELECT oid FROM sources)AND a.attnum>0 AND NOT a.attisdropped),
 'constraints',(SELECT jsonb_agg(jsonb_build_array(conrelid::regclass::text,conname,pg_get_constraintdef(oid,true),convalidated,condeferrable,condeferred)ORDER BY conrelid,conname)FROM pg_constraint WHERE conrelid IN(SELECT oid FROM sources)OR confrelid IN(SELECT oid FROM sources)),
 'hooks',(SELECT jsonb_object_agg(tgrelid::regclass::text||'.'||tgname,jsonb_build_array(pg_get_triggerdef(oid,true),md5(pg_get_functiondef(tgfoid)),tgenabled))FROM pg_trigger WHERE tgrelid IN(SELECT oid FROM sources)AND NOT tgisinternal),
 'indexes',(SELECT jsonb_agg(pg_get_indexdef(indexrelid)ORDER BY indexrelid)FROM pg_index WHERE indrelid IN(SELECT oid FROM sources)),
 'policies',(SELECT jsonb_agg(jsonb_build_array(polrelid::regclass::text,polname,polcmd,polpermissive,polroles::text,pg_get_expr(polqual,polrelid),pg_get_expr(polwithcheck,polrelid))ORDER BY polrelid,polname)FROM pg_policy WHERE polrelid IN(SELECT oid FROM sources)),
 'rules',(SELECT coalesce(jsonb_agg(pg_get_ruledef(oid,true)ORDER BY oid),'[]')FROM pg_rewrite WHERE ev_class IN(SELECT oid FROM sources)),
 'inheritance',(SELECT count(*)FROM pg_inherits WHERE inhparent IN(SELECT oid FROM sources)OR inhrelid IN(SELECT oid FROM sources)));
$$;
CREATE TABLE public.account_deletion_sighting_contract(id boolean PRIMARY KEY DEFAULT true CHECK(id),catalog jsonb NOT NULL,functions jsonb NOT NULL);
ALTER TABLE public.account_deletion_sighting_contract ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.account_deletion_sighting_contract FROM PUBLIC,anon,authenticated,service_role;
GRANT SELECT ON public.account_deletion_sighting_contract TO service_role;
CREATE FUNCTION public.account_deletion_sighting_scope(_id uuid,_user uuid,_lease uuid,_phase text)RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=''SET lock_timeout='1s'AS $$BEGIN
 PERFORM public.account_deletion_submission_scope(_id,_user,_lease,_phase);
 LOCK TABLE public.sightings,public.sighting_confirmations IN ROW EXCLUSIVE MODE;
 IF NOT public.account_deletion_sighting_barrier_current()THEN RAISE EXCEPTION 'Sighting erasure requires schema review';END IF;
 IF _phase='records'AND public.account_deletion_submission_remaining(_user)THEN RAISE EXCEPTION 'Complete private submissions before sightings';END IF;
END $$;
CREATE FUNCTION public.purge_account_deletion_sightings(_id uuid,_user uuid,_lease uuid,_limit integer DEFAULT 100)RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=''SET lock_timeout='1s'AS $$
DECLARE response public.sighting_confirmations;parent public.sightings;ids uuid[];changed integer:=0;affected integer;selected text;previous_context text:=coalesce(current_setting('bluebird.sighting_cleanup',true),'');BEGIN
 -- One owned response plus its retained parent's count repair is two writes.
 IF _limit IS NULL OR _limit NOT BETWEEN 2 AND 100 THEN RAISE EXCEPTION 'Sighting erasure unavailable';END IF;
 PERFORM public.account_deletion_sighting_scope(_id,_user,_lease,'records');
 IF EXISTS(SELECT 1 FROM public.sightings WHERE verified_by=_user AND reporter_id<>_user)
 OR EXISTS(SELECT 1 FROM public.sighting_confirmations WHERE user_id=_user AND kind='flag')THEN RAISE EXCEPTION 'Sighting moderation retention requires explicit handling';END IF;
 PERFORM set_config('bluebird.sighting_cleanup',jsonb_build_object('id',_id,'user',_user,'lease',_lease)::text,true);
 -- Lock parents before their response rows, matching respond_to_sighting's order.
 SELECT * INTO response FROM public.sighting_confirmations WHERE user_id=_user ORDER BY id LIMIT 1;
 IF response.id IS NOT NULL THEN
  IF response.sighting_id IS NOT NULL THEN
   SELECT * INTO parent FROM public.sightings WHERE id=response.sighting_id FOR UPDATE;
   IF NOT FOUND OR parent.hidden OR parent.flag_count<>0 OR parent.verified_by IS NOT NULL OR parent.verified_at IS NOT NULL OR parent.source_type<>'member_report'OR EXISTS(SELECT 1 FROM public.sighting_confirmations WHERE sighting_id=parent.id AND kind='flag')THEN RAISE EXCEPTION 'Sighting moderation retention requires explicit handling';END IF;
  END IF;
  SELECT * INTO response FROM public.sighting_confirmations WHERE id=response.id AND user_id=_user FOR UPDATE;
  IF response.id IS NOT NULL THEN
   DELETE FROM public.sighting_confirmations WHERE id=response.id AND user_id=_user;GET DIAGNOSTICS changed=ROW_COUNT;selected:='responses';
   IF response.sighting_id IS NOT NULL THEN
    UPDATE public.sightings SET confirmation_count=(SELECT count(*)FROM public.sighting_confirmations WHERE sighting_id=response.sighting_id AND kind='confirm')WHERE id=response.sighting_id;
    GET DIAGNOSTICS affected=ROW_COUNT;changed:=changed+affected;
   END IF;
  END IF;
 END IF;
 IF changed=0 THEN
  SELECT * INTO parent FROM public.sightings WHERE reporter_id=_user ORDER BY id LIMIT 1 FOR UPDATE;
  IF parent.id IS NOT NULL THEN
   IF parent.hidden OR parent.flag_count<>0 OR parent.verified_by IS NOT NULL OR parent.verified_at IS NOT NULL OR parent.source_type<>'member_report'
    OR EXISTS(SELECT 1 FROM public.sighting_confirmations WHERE sighting_id=parent.id AND kind='flag')THEN RAISE EXCEPTION 'Sighting moderation retention requires explicit handling';END IF;
   IF parent.evidence_path IS NOT NULL AND NOT public.account_deletion_listing_media_ready(_id,'sightings',parent.id::text,NULL,parent.evidence_path)THEN RAISE EXCEPTION 'Sighting media inventory requires resolution';END IF;
   SELECT array_agg(id)INTO ids FROM(SELECT id FROM public.sighting_confirmations WHERE sighting_id=parent.id ORDER BY id LIMIT _limit FOR UPDATE)r;
   IF ids IS NOT NULL THEN UPDATE public.sighting_confirmations SET sighting_id=NULL,unavailable_at=clock_timestamp()WHERE id=ANY(ids);GET DIAGNOSTICS changed=ROW_COUNT;selected:='retired';
   ELSE DELETE FROM public.sightings WHERE id=parent.id AND reporter_id=_user;GET DIAGNOSTICS changed=ROW_COUNT;selected:='sightings';END IF;
  END IF;
 END IF;
 PERFORM set_config('bluebird.sighting_cleanup',previous_context,true);
 IF NOT public.account_deletion_lease_current(_id,_user,_lease,'records')OR NOT public.account_deletion_sighting_barrier_current()
 OR public.account_access_coverage()IS DISTINCT FROM jsonb_build_object('unguarded_functions',0,'unguarded_tables',0,'helper_privilege_gaps',0)THEN RAISE EXCEPTION 'Sighting erasure unavailable';END IF;
 IF changed=0 AND public.account_deletion_sighting_remaining(_user)THEN RAISE EXCEPTION 'Sighting retention requires explicit handling';END IF;
 RETURN jsonb_build_object('source',selected,'changed',changed,'pass_done',NOT public.account_deletion_sighting_remaining(_user));
EXCEPTION WHEN OTHERS THEN PERFORM set_config('bluebird.sighting_cleanup',previous_context,true);RAISE;END $$;
CREATE FUNCTION public.verify_account_deletion_sightings(_id uuid,_user uuid,_lease uuid)RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=''AS $$BEGIN
 PERFORM public.account_deletion_sighting_scope(_id,_user,_lease,'verification');RETURN NOT public.account_deletion_sighting_remaining(_user)AND public.account_deletion_lease_current(_id,_user,_lease,'verification');END $$;
CREATE FUNCTION public.guard_account_deletion_sighting_completion()RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=''AS $$BEGIN IF NEW.status='completed'AND(NOT public.account_deletion_sighting_barrier_current()OR public.account_deletion_sighting_remaining(OLD.user_id))THEN RAISE EXCEPTION 'Sighting erasure verification required';END IF;RETURN NEW;END $$;
CREATE TRIGGER guard_account_deletion_sighting_completion AFTER UPDATE OF status,user_id ON public.account_deletion_jobs FOR EACH ROW EXECUTE FUNCTION public.guard_account_deletion_sighting_completion();
CREATE FUNCTION public.account_deletion_sighting_functions()RETURNS jsonb LANGUAGE sql VOLATILE SECURITY DEFINER SET search_path=''AS $$SELECT jsonb_object_agg(p.oid::regprocedure::text,md5(pg_get_functiondef(p.oid)))FROM pg_proc p WHERE p.oid IN(
 'public.account_deletion_sighting_context(uuid)'::regprocedure,'public.guard_account_deletion_sighting_writer()'::regprocedure,'public.account_deletion_sighting_remaining(uuid)'::regprocedure,'public.account_deletion_sighting_catalog()'::regprocedure,
 'public.account_deletion_sighting_scope(uuid,uuid,uuid,text)'::regprocedure,'public.purge_account_deletion_sightings(uuid,uuid,uuid,integer)'::regprocedure,'public.verify_account_deletion_sightings(uuid,uuid,uuid)'::regprocedure,
 'public.guard_account_deletion_sighting_completion()'::regprocedure,'public.account_deletion_sighting_functions()'::regprocedure,
 'public.account_deletion_listing_media_ready(uuid,text,text,text,text)'::regprocedure,'public.account_deletion_media_reference(text,text)'::regprocedure,
 'public.report_sighting(uuid,uuid,public.sighting_availability,integer,text,timestamptz)'::regprocedure,'public.respond_to_sighting(uuid,text)'::regprocedure,to_regprocedure('public.account_deletion_sighting_barrier_current()'));$$;
CREATE FUNCTION public.account_deletion_sighting_barrier_current()RETURNS boolean LANGUAGE sql VOLATILE SECURITY DEFINER SET search_path=''AS $$SELECT EXISTS(SELECT 1 FROM public.account_deletion_sighting_contract WHERE id AND catalog=public.account_deletion_sighting_catalog()AND functions=public.account_deletion_sighting_functions());$$;
REVOKE ALL ON FUNCTION public.account_deletion_sighting_context(uuid),public.guard_account_deletion_sighting_writer(),public.account_deletion_sighting_remaining(uuid),public.account_deletion_sighting_catalog(),public.account_deletion_sighting_scope(uuid,uuid,uuid,text),public.purge_account_deletion_sightings(uuid,uuid,uuid,integer),public.verify_account_deletion_sightings(uuid,uuid,uuid),public.guard_account_deletion_sighting_completion(),public.account_deletion_sighting_functions(),public.account_deletion_sighting_barrier_current()FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.purge_account_deletion_sightings(uuid,uuid,uuid,integer),public.verify_account_deletion_sightings(uuid,uuid,uuid)TO service_role;
SELECT public.protect_account_access_boundaries();
UPDATE public.account_deletion_private_contract SET hooks=public.account_deletion_private_hooks()WHERE id;
INSERT INTO public.account_deletion_sighting_contract SELECT true,public.account_deletion_sighting_catalog(),public.account_deletion_sighting_functions();
DO $$BEGIN IF NOT public.account_deletion_sighting_barrier_current()OR NOT public.account_deletion_submission_barrier_current()OR NOT public.account_deletion_catalog_barrier_current()OR NOT public.account_deletion_private_barrier_current()THEN RAISE EXCEPTION 'Sighting boundaries require review';END IF;END $$;
COMMIT;
