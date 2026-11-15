-- Source-only owned analytics and throttle records. No worker activation or Auth erasure.
BEGIN;
SET LOCAL search_path='';
SET LOCAL lock_timeout='5s';
DO $$ DECLARE expected_columns jsonb:=$columns${"analytics_events":{"id":["uuid",true,"gen_random_uuid()",""],"user_id":["uuid",false,null,""],"session_id":["text",false,null,""],"name":["text",true,null,""],"props":["jsonb",true,"'{}'::jsonb",""],"is_demo":["boolean",true,"false",""],"occurred_at":["timestamp with time zone",true,"now()",""]},"rate_limit_events":{"id":["uuid",true,"gen_random_uuid()",""],"user_id":["uuid",true,null,""],"action":["text",true,null,""],"created_at":["timestamp with time zone",true,"now()",""]}}$columns$::jsonb;
 expected_constraints jsonb:=$constraints${"analytics_events.analytics_events_pkey":"PRIMARY KEY (id)","analytics_events.analytics_events_user_id_fkey":"FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE SET NULL","rate_limit_events.rate_limit_events_pkey":"PRIMARY KEY (id)","rate_limit_events.rate_limit_events_user_id_fkey":"FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE"}$constraints$::jsonb;
 expected_functions jsonb:=$functions${"enforce_rate_limit(text,integer,interval)":["8f64ebd23b61496c5fa7a248dd285281",true,["search_path=public, pg_temp"],"{=X/postgres,postgres=X/postgres,anon=X/postgres,authenticated=X/postgres,service_role=X/postgres}"],"clear_shopping_history(text)":["ba5d28e6a70ca1ca942dd126393bb6a7",true,["search_path=public, pg_temp"],"{postgres=X/postgres,service_role=X/postgres}"],"retain_shopping_data()":["3cf1485e089e06a894cbe5d4b32c2d0f",true,["search_path=public, pg_temp"],"{postgres=X/postgres,service_role=X/postgres}"]}$functions$::jsonb;
 expected_policies jsonb:=$policies${"analytics_events.Admins read analytics":["r",true,["authenticated"],"has_role(auth.uid(), 'admin'::app_role)",null],"analytics_events.Anyone can record an event":["a",true,["anon","authenticated"],null,"((user_id IS NULL) OR (user_id = auth.uid()))"],"analytics_events.bluebird_account_session_boundary":["*",false,["authenticated"],"( SELECT account_current_session_active() AS account_current_session_active)","( SELECT account_current_session_active() AS account_current_session_active)"],"rate_limit_events.bluebird_account_session_boundary":["*",false,["authenticated"],"( SELECT account_current_session_active() AS account_current_session_active)","( SELECT account_current_session_active() AS account_current_session_active)"]}$policies$::jsonb;
 expected_acls jsonb:=$acls${"analytics_events":"{postgres=arwdDxtm/postgres,anon=arwdDxtm/postgres,authenticated=arwdDxtm/postgres,service_role=arwdDxtm/postgres}","rate_limit_events":"{postgres=arwdDxtm/postgres,anon=arwdDxtm/postgres,authenticated=arwdDxtm/postgres,service_role=arwdDxtm/postgres}"}$acls$::jsonb;
 actual jsonb;target text;sources text[]:=ARRAY['analytics_events','rate_limit_events'];
BEGIN
 PERFORM 1 FROM public.account_deletion_controls WHERE id AND NOT worker_enabled FOR SHARE;
 IF NOT FOUND OR NOT public.account_deletion_private_barrier_current()OR NOT public.account_deletion_sourcing_barrier_current()
 OR public.account_access_coverage()IS DISTINCT FROM jsonb_build_object('unguarded_functions',0,'unguarded_tables',0,'helper_privilege_gaps',0)
 THEN RAISE EXCEPTION 'Review disabled activity prerequisites';END IF;
 FOREACH target IN ARRAY sources LOOP
  EXECUTE format('LOCK TABLE public.%I IN SHARE ROW EXCLUSIVE MODE',target);
  IF NOT EXISTS(SELECT 1 FROM pg_class WHERE oid=format('public.%I',target)::regclass AND relkind='r'AND NOT relispartition AND relrowsecurity)
   OR EXISTS(SELECT 1 FROM pg_inherits WHERE inhparent=format('public.%I',target)::regclass OR inhrelid=format('public.%I',target)::regclass)
   OR EXISTS(SELECT 1 FROM pg_rewrite WHERE ev_class=format('public.%I',target)::regclass)
   OR EXISTS(SELECT 1 FROM pg_trigger WHERE tgrelid=format('public.%I',target)::regclass AND NOT tgisinternal)
  THEN RAISE EXCEPTION 'Review activity layout and hooks';END IF;
 END LOOP;
 SELECT jsonb_object_agg(relname,cols)INTO actual FROM(SELECT c.relname,jsonb_object_agg(a.attname,jsonb_build_array(replace(format_type(a.atttypid,a.atttypmod),'public.',''),a.attnotnull,replace(pg_get_expr(d.adbin,d.adrelid),'public.',''),a.attgenerated))cols
 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace JOIN pg_attribute a ON a.attrelid=c.oid LEFT JOIN pg_attrdef d ON d.adrelid=a.attrelid AND d.adnum=a.attnum
 WHERE n.nspname='public'AND c.relname=ANY(sources)AND a.attnum>0 AND NOT a.attisdropped GROUP BY c.relname)r;
 IF actual IS DISTINCT FROM expected_columns THEN RAISE EXCEPTION 'Review activity columns';END IF;
 SELECT jsonb_object_agg(replace(conrelid::regclass::text,'public.','')||'.'||conname,replace(pg_get_constraintdef(oid,true),'public.',''))INTO actual FROM pg_constraint WHERE contype<>'n'AND(conrelid IN('public.analytics_events'::regclass,'public.rate_limit_events'::regclass)OR confrelid IN('public.analytics_events'::regclass,'public.rate_limit_events'::regclass));
 IF actual IS DISTINCT FROM expected_constraints THEN RAISE EXCEPTION 'Review activity relationships';END IF;

 SELECT jsonb_object_agg(c.relname,c.relacl::text)INTO actual FROM pg_class c WHERE c.oid IN('public.analytics_events'::regclass,'public.rate_limit_events'::regclass);
 IF actual IS DISTINCT FROM expected_acls THEN RAISE EXCEPTION 'Review activity permissions';END IF;
 SELECT jsonb_object_agg(replace(p.polrelid::regclass::text,'public.','')||'.'||p.polname,jsonb_build_array(p.polcmd,p.polpermissive,
 (SELECT jsonb_agg(CASE WHEN role_oid=0 THEN 'PUBLIC'ELSE pg_get_userbyid(role_oid)END ORDER BY role_oid)FROM unnest(p.polroles)role_oid),replace(pg_get_expr(p.polqual,p.polrelid),'public.',''),replace(pg_get_expr(p.polwithcheck,p.polrelid),'public.','')))INTO actual FROM pg_policy p WHERE p.polrelid IN('public.analytics_events'::regclass,'public.rate_limit_events'::regclass);
 IF actual IS DISTINCT FROM expected_policies THEN RAISE EXCEPTION 'Review activity policies';END IF;

 SELECT jsonb_object_agg(replace(p.oid::regprocedure::text,'public.',''),jsonb_build_array(md5(p.prosrc),p.prosecdef,p.proconfig,p.proacl::text))INTO actual FROM pg_proc p WHERE p.oid IN('public.enforce_rate_limit(text,integer,interval)'::regprocedure,'public.clear_shopping_history(text)'::regprocedure,'public.retain_shopping_data()'::regprocedure);
 IF actual IS DISTINCT FROM expected_functions THEN RAISE EXCEPTION 'Review activity callbacks';END IF;
END $$;

ALTER TABLE public.analytics_events DROP CONSTRAINT analytics_events_user_id_fkey,
 ADD CONSTRAINT analytics_events_user_id_fkey FOREIGN KEY(user_id)REFERENCES auth.users(id)ON DELETE RESTRICT;
ALTER TABLE public.rate_limit_events DROP CONSTRAINT rate_limit_events_user_id_fkey,
 ADD CONSTRAINT rate_limit_events_user_id_fkey FOREIGN KEY(user_id)REFERENCES auth.users(id)ON DELETE RESTRICT;
CREATE INDEX account_deletion_analytics_owner ON public.analytics_events(user_id,id);
CREATE INDEX account_deletion_rate_owner ON public.rate_limit_events(user_id,id);
CREATE FUNCTION public.account_deletion_activity_collectible(_user uuid)RETURNS boolean LANGUAGE sql VOLATILE SECURITY DEFINER SET search_path=''AS $$
 SELECT _user IS NULL OR(EXISTS(SELECT 1 FROM auth.users WHERE id=_user AND deleted_at IS NULL)
 AND NOT EXISTS(SELECT 1 FROM public.mobile_account_deletions WHERE user_id=_user)
 AND NOT EXISTS(SELECT 1 FROM public.account_deletion_jobs WHERE user_id=_user AND status<>'completed'));
$$;
CREATE FUNCTION public.guard_account_deletion_activity_writer()RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=''SET lock_timeout='1s'AS $$
DECLARE previous_user uuid;member uuid;BEGIN
 IF TG_OP='UPDATE'THEN
  previous_user:=OLD.user_id;
  IF NEW.user_id IS DISTINCT FROM OLD.user_id THEN
   IF TG_TABLE_NAME<>'analytics_events'OR NEW.user_id IS NOT NULL
   THEN RAISE EXCEPTION 'Activity ownership is immutable';END IF;
   IF NEW.session_id IS NOT NULL OR NEW.props IS DISTINCT FROM(OLD.props-'traffic_visit')
    OR(to_jsonb(NEW)-ARRAY['user_id','session_id','props'])IS DISTINCT FROM(to_jsonb(OLD)-ARRAY['user_id','session_id','props'])
   THEN RAISE EXCEPTION 'Activity ownership is immutable';END IF;
  END IF;
 END IF;
 -- Authenticate every actual subject before a history operation can lose its
 -- account reference. Service collectors and the original member throttles
 -- share the same request/deletion ordering lock; guest ownership is not guessed.
 FOR member IN SELECT DISTINCT m FROM unnest(ARRAY[auth.uid(),previous_user,NEW.user_id])m WHERE m IS NOT NULL ORDER BY m LOOP
  PERFORM public.assert_member_private_record_writer(member);
 END LOOP;
 RETURN NEW;
END $$;
CREATE TRIGGER account_deletion_activity_writer BEFORE INSERT OR UPDATE ON public.analytics_events FOR EACH ROW EXECUTE FUNCTION public.guard_account_deletion_activity_writer();
CREATE TRIGGER account_deletion_activity_writer BEFORE INSERT OR UPDATE ON public.rate_limit_events FOR EACH ROW EXECUTE FUNCTION public.guard_account_deletion_activity_writer();
-- Preserve the real maintenance function and its ACL. A race after candidate
-- selection still hits the subject guard and rolls the maintenance statement
-- back; the next pass skips that pending member instead of losing ownership.
DO $$DECLARE definition text;BEGIN
 SELECT pg_get_functiondef('public.retain_shopping_data()'::regprocedure)INTO definition;
 IF strpos(definition,'analytics_events where occurred_at<')=0 THEN RAISE EXCEPTION 'Review activity maintenance predicate';END IF;
 definition:=replace(definition,'analytics_events where occurred_at<','analytics_events where public.account_deletion_activity_collectible(user_id) AND occurred_at<');
 EXECUTE definition;
 SELECT pg_get_functiondef('public.clear_shopping_history(text)'::regprocedure)INTO definition;
 IF strpos(definition,E'where user_id=substring(subject_key from 3)::uuid\n  and name in')=0 THEN RAISE EXCEPTION 'Review activity history predicate';END IF;
 definition:=replace(definition,E'where user_id=substring(subject_key from 3)::uuid\n  and name in',E'where user_id=substring(subject_key from 3)::uuid AND public.account_deletion_activity_collectible(user_id)\n  and name in');
 EXECUTE definition;
END $$;
CREATE FUNCTION public.account_deletion_activity_catalog()RETURNS jsonb LANGUAGE sql VOLATILE SECURITY DEFINER SET search_path=''AS $$
 WITH sources AS(SELECT c.oid FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public'AND c.relname=ANY(ARRAY['analytics_events','rate_limit_events']))
 SELECT jsonb_build_object(
 'relations',(SELECT jsonb_agg(jsonb_build_array(oid::regclass::text,relkind,relispartition,relrowsecurity,relforcerowsecurity,relacl::text)ORDER BY oid)FROM pg_class WHERE oid IN(SELECT oid FROM sources)),
 'columns',(SELECT jsonb_agg(jsonb_build_array(a.attrelid::regclass::text,a.attname,a.atttypid::regtype::text,a.atttypmod,a.attnotnull,a.attgenerated,pg_get_expr(d.adbin,d.adrelid))ORDER BY a.attrelid,a.attnum)FROM pg_attribute a LEFT JOIN pg_attrdef d ON d.adrelid=a.attrelid AND d.adnum=a.attnum WHERE a.attrelid IN(SELECT oid FROM sources)AND a.attnum>0 AND NOT a.attisdropped),
 'constraints',(SELECT jsonb_agg(jsonb_build_array(conrelid::regclass::text,conname,pg_get_constraintdef(oid,true),convalidated,condeferrable,condeferred)ORDER BY conrelid,conname)FROM pg_constraint WHERE conrelid IN(SELECT oid FROM sources)OR confrelid IN(SELECT oid FROM sources)),
 'hooks',(SELECT jsonb_object_agg(tgrelid::regclass::text||'.'||tgname,jsonb_build_array(pg_get_triggerdef(oid,true),md5(pg_get_functiondef(tgfoid)),tgenabled))FROM pg_trigger WHERE tgrelid IN(SELECT oid FROM sources)AND NOT tgisinternal),
 'indexes',(SELECT jsonb_agg(pg_get_indexdef(indexrelid)ORDER BY indexrelid)FROM pg_index WHERE indrelid IN(SELECT oid FROM sources)),
 'policies',(SELECT jsonb_agg(jsonb_build_array(polrelid::regclass::text,polname,polcmd,polpermissive,polroles::text,pg_get_expr(polqual,polrelid),pg_get_expr(polwithcheck,polrelid))ORDER BY polrelid,polname)FROM pg_policy WHERE polrelid IN(SELECT oid FROM sources)),
 'rules',(SELECT coalesce(jsonb_agg(pg_get_ruledef(oid,true)ORDER BY oid),'[]')FROM pg_rewrite WHERE ev_class IN(SELECT oid FROM sources)),
 'inheritance',(SELECT count(*)FROM pg_inherits WHERE inhparent IN(SELECT oid FROM sources)OR inhrelid IN(SELECT oid FROM sources)));
$$;

CREATE TABLE public.account_deletion_activity_contract(id boolean PRIMARY KEY DEFAULT true CHECK(id),catalog jsonb NOT NULL,functions jsonb NOT NULL);
ALTER TABLE public.account_deletion_activity_contract ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.account_deletion_activity_contract FROM PUBLIC,anon,authenticated,service_role;
GRANT SELECT ON public.account_deletion_activity_contract TO service_role;
CREATE FUNCTION public.account_deletion_activity_remaining(_user uuid)RETURNS boolean LANGUAGE sql VOLATILE SECURITY DEFINER SET search_path=''AS $$
 SELECT EXISTS(SELECT 1 FROM public.analytics_events WHERE user_id=_user)OR EXISTS(SELECT 1 FROM public.rate_limit_events WHERE user_id=_user);
$$;
CREATE FUNCTION public.account_deletion_activity_scope(_id uuid,_user uuid,_lease uuid,_phase text)RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=''SET lock_timeout='1s'AS $$BEGIN
 PERFORM public.account_deletion_sourcing_scope(_id,_user,_lease,_phase);
 LOCK TABLE public.analytics_events,public.rate_limit_events IN ROW EXCLUSIVE MODE;
 IF NOT public.account_deletion_activity_barrier_current()THEN RAISE EXCEPTION 'Activity erasure requires schema review';END IF;
 IF _phase='records'AND public.account_deletion_sourcing_remaining(_user)THEN RAISE EXCEPTION 'Complete sourcing before activity';END IF;
END $$;
CREATE FUNCTION public.purge_account_deletion_activity(_id uuid,_user uuid,_lease uuid,_limit integer DEFAULT 100)RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=''SET lock_timeout='1s'AS $$
DECLARE source text;ids uuid[];deleted integer:=0;BEGIN
 IF _limit IS NULL OR _limit NOT BETWEEN 1 AND 100 THEN RAISE EXCEPTION 'Activity erasure unavailable';END IF;
 PERFORM public.account_deletion_activity_scope(_id,_user,_lease,'records');
 FOREACH source IN ARRAY ARRAY['analytics_events','rate_limit_events']LOOP
  EXECUTE format('SELECT array_agg(id)FROM(SELECT id FROM public.%I WHERE user_id=$1 ORDER BY id LIMIT $2 FOR UPDATE)r',source)INTO ids USING _user,_limit;
  IF ids IS NOT NULL THEN
   EXECUTE format('DELETE FROM public.%I WHERE id=ANY($1)AND user_id=$2',source)USING ids,_user;
   GET DIAGNOSTICS deleted=ROW_COUNT;
   EXIT;
  END IF;
 END LOOP;
 IF NOT public.account_deletion_lease_current(_id,_user,_lease,'records')OR NOT public.account_deletion_activity_barrier_current()
 OR public.account_access_coverage()IS DISTINCT FROM jsonb_build_object('unguarded_functions',0,'unguarded_tables',0,'helper_privilege_gaps',0)THEN RAISE EXCEPTION 'Activity erasure unavailable';END IF;
 RETURN jsonb_build_object('source',CASE WHEN deleted=0 THEN NULL ELSE source END,'deleted',deleted,'pass_done',NOT public.account_deletion_activity_remaining(_user));
END $$;
CREATE FUNCTION public.verify_account_deletion_activity(_id uuid,_user uuid,_lease uuid)RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=''AS $$BEGIN
 PERFORM public.account_deletion_activity_scope(_id,_user,_lease,'verification');
 RETURN NOT public.account_deletion_activity_remaining(_user)AND public.account_deletion_lease_current(_id,_user,_lease,'verification');
END $$;
CREATE FUNCTION public.guard_account_deletion_activity_completion()RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=''AS $$BEGIN
 IF NEW.status='completed'AND(NOT public.account_deletion_activity_barrier_current()OR public.account_deletion_activity_remaining(OLD.user_id))THEN RAISE EXCEPTION 'Activity erasure verification required';END IF;RETURN NEW;
END $$;
CREATE TRIGGER guard_account_deletion_activity_completion AFTER UPDATE OF status,user_id ON public.account_deletion_jobs FOR EACH ROW EXECUTE FUNCTION public.guard_account_deletion_activity_completion();
CREATE FUNCTION public.account_deletion_activity_functions()RETURNS jsonb LANGUAGE sql VOLATILE SECURITY DEFINER SET search_path=''AS $$
 SELECT jsonb_object_agg(p.oid::regprocedure::text,jsonb_build_array(md5(pg_get_functiondef(p.oid)),p.prosecdef,p.proconfig,p.proacl::text))FROM pg_proc p WHERE p.oid IN(
 'public.account_deletion_activity_collectible(uuid)'::regprocedure,'public.guard_account_deletion_activity_writer()'::regprocedure,'public.account_deletion_activity_catalog()'::regprocedure,
 'public.account_deletion_activity_remaining(uuid)'::regprocedure,'public.account_deletion_activity_scope(uuid,uuid,uuid,text)'::regprocedure,
 'public.purge_account_deletion_activity(uuid,uuid,uuid,integer)'::regprocedure,'public.verify_account_deletion_activity(uuid,uuid,uuid)'::regprocedure,'public.guard_account_deletion_activity_completion()'::regprocedure,
 'public.account_deletion_activity_functions()'::regprocedure,'public.assert_member_private_record_writer(uuid)'::regprocedure,
 'public.enforce_rate_limit(text,integer,interval)'::regprocedure,'public.clear_shopping_history(text)'::regprocedure,'public.retain_shopping_data()'::regprocedure,to_regprocedure('public.account_deletion_activity_barrier_current()'));
$$;
CREATE FUNCTION public.account_deletion_activity_barrier_current()RETURNS boolean LANGUAGE sql VOLATILE SECURITY DEFINER SET search_path=''AS $$
 SELECT EXISTS(SELECT 1 FROM public.account_deletion_activity_contract WHERE id AND catalog=public.account_deletion_activity_catalog()AND functions=public.account_deletion_activity_functions());
$$;
REVOKE ALL ON FUNCTION public.account_deletion_activity_collectible(uuid),public.guard_account_deletion_activity_writer(),public.account_deletion_activity_catalog(),public.account_deletion_activity_remaining(uuid),public.account_deletion_activity_scope(uuid,uuid,uuid,text),public.purge_account_deletion_activity(uuid,uuid,uuid,integer),public.verify_account_deletion_activity(uuid,uuid,uuid),public.guard_account_deletion_activity_completion(),public.account_deletion_activity_functions(),public.account_deletion_activity_barrier_current()FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.purge_account_deletion_activity(uuid,uuid,uuid,integer),public.verify_account_deletion_activity(uuid,uuid,uuid)TO service_role;
SELECT public.protect_account_access_boundaries();
UPDATE public.account_deletion_private_contract SET hooks=public.account_deletion_private_hooks()WHERE id;
INSERT INTO public.account_deletion_activity_contract SELECT true,public.account_deletion_activity_catalog(),public.account_deletion_activity_functions();
DO $$BEGIN IF NOT public.account_deletion_activity_barrier_current()OR NOT public.account_deletion_sourcing_barrier_current()OR NOT public.account_deletion_private_barrier_current()
 OR public.account_access_coverage()IS DISTINCT FROM jsonb_build_object('unguarded_functions',0,'unguarded_tables',0,'helper_privilege_gaps',0)THEN RAISE EXCEPTION 'Activity boundaries require review';END IF;END $$;
COMMIT;
