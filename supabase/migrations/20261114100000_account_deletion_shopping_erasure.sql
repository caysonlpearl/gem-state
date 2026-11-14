-- Private, bounded erasure of first-party shopping data only. Worker stays off.
BEGIN;
DO $$ BEGIN
 PERFORM 1 FROM public.account_deletion_controls WHERE id AND NOT worker_enabled FOR UPDATE;
 IF NOT FOUND OR to_regprocedure('public.assert_member_photo_writer(uuid)') IS NULL
 OR to_regprocedure('public.account_deletion_lease_current(uuid,uuid,uuid,text)') IS NULL
 OR public.account_access_coverage() IS DISTINCT FROM jsonb_build_object('unguarded_functions',0,'unguarded_tables',0,'helper_privilege_gaps',0)
 THEN RAISE EXCEPTION 'Review disabled worker and deletion boundary prerequisites'; END IF;
END $$;

CREATE INDEX IF NOT EXISTS account_deletion_shopping_events_user ON public.shopping_events(user_id);
CREATE INDEX IF NOT EXISTS account_deletion_shopping_choices_user ON public.shopping_choices(user_id);
CREATE INDEX IF NOT EXISTS account_deletion_shopping_ad_user ON public.shopping_ad_outbox(user_id);
CREATE INDEX IF NOT EXISTS account_deletion_shopping_ad_subject ON public.shopping_ad_outbox(subject);

CREATE FUNCTION public.guard_account_deletion_shopping()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' SET lock_timeout='1s' AS $$
DECLARE row_data jsonb:=to_jsonb(NEW); previous jsonb; subject text:=row_data->>'subject'; member uuid; linked uuid;
BEGIN
 IF subject LIKE 'u:%' THEN
  IF substring(subject FROM 3) !~* '^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$'
  THEN RAISE EXCEPTION 'Shopping account is unavailable'; END IF;
  member:=substring(subject FROM 3)::uuid;
  IF subject<>'u:'||member::text THEN RAISE EXCEPTION 'Shopping account is unavailable'; END IF;
 END IF;
 linked:=(row_data->>'user_id')::uuid;
 IF linked IS NOT NULL AND linked IS DISTINCT FROM member THEN RAISE EXCEPTION 'Shopping account is unavailable'; END IF;
 IF TG_OP='UPDATE' THEN
  previous:=to_jsonb(OLD);
  IF previous->>'subject' IS DISTINCT FROM subject
   OR (previous->>'user_id' IS NOT NULL AND previous->>'user_id' IS DISTINCT FROM row_data->>'user_id')
  THEN RAISE EXCEPTION 'Shopping account is unavailable'; END IF;
  -- The existing deletion-request transaction must still suppress exports.
  IF TG_TABLE_NAME='shopping_ad_outbox' AND row_data->>'status'='suppressed'
   AND row_data-'status'=previous-'status' THEN RETURN NEW; END IF;
 END IF;
 IF member IS NULL THEN RETURN NEW; END IF;
 IF TG_TABLE_NAME='shopping_privacy' AND row_data->'personalization'='false'::jsonb AND row_data->'advertising'='false'::jsonb THEN
  -- Declining privacy choices remains possible during request suppression.
  -- Hold the Auth key until commit so a late opt-out cannot outlive identity
  -- removal and resurrect the tombstone after the final cleanup pass.
  PERFORM 1 FROM auth.users WHERE id=member AND deleted_at IS NULL FOR KEY SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Shopping account is unavailable'; END IF;
 ELSE
  -- Reuse the same shared/exclusive account lock as request/job insertion.
  PERFORM public.assert_member_photo_writer(member);
 END IF;
 RETURN NEW;
END $$;

CREATE TABLE public.account_deletion_shopping_contract (
 id boolean PRIMARY KEY DEFAULT true CHECK(id), guard_definition_md5 text NOT NULL, writer_definition_md5 text NOT NULL
);
ALTER TABLE public.account_deletion_shopping_contract ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.account_deletion_shopping_contract FROM PUBLIC,anon,authenticated,service_role;
GRANT SELECT ON public.account_deletion_shopping_contract TO service_role;
INSERT INTO public.account_deletion_shopping_contract(id,guard_definition_md5,writer_definition_md5)
SELECT true,md5(pg_get_functiondef('public.guard_account_deletion_shopping()'::regprocedure)),
 md5(pg_get_functiondef('public.assert_member_photo_writer(uuid)'::regprocedure));
CREATE FUNCTION public.account_deletion_shopping_barrier_current()
RETURNS boolean LANGUAGE sql VOLATILE SECURITY DEFINER SET search_path='' AS $$
 SELECT EXISTS(SELECT 1 FROM public.account_deletion_shopping_contract c WHERE c.id
  AND c.guard_definition_md5=md5(pg_get_functiondef('public.guard_account_deletion_shopping()'::regprocedure))
  AND c.writer_definition_md5=md5(pg_get_functiondef('public.assert_member_photo_writer(uuid)'::regprocedure)))
 AND (SELECT count(*) FROM pg_trigger t JOIN pg_class r ON r.oid=t.tgrelid JOIN pg_namespace n ON n.oid=r.relnamespace
  WHERE n.nspname='public' AND r.relname IN ('shopping_events','shopping_choices','shopping_favorites',
   'shopping_experiments','shopping_ad_outbox','shopping_privacy') AND t.tgname='guard_account_deletion_shopping'
   AND t.tgfoid='public.guard_account_deletion_shopping()'::regprocedure AND t.tgenabled='O' AND t.tgtype=23
   AND t.tgqual IS NULL AND t.tgattr::text='' AND t.tgnargs=0 AND NOT t.tgisinternal AND NOT t.tgdeferrable)=6;
$$;
DO $$ DECLARE relation text; BEGIN
 FOREACH relation IN ARRAY ARRAY['shopping_events','shopping_choices','shopping_favorites',
  'shopping_experiments','shopping_ad_outbox','shopping_privacy'] LOOP
  EXECUTE format('CREATE TRIGGER guard_account_deletion_shopping BEFORE INSERT OR UPDATE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.guard_account_deletion_shopping()',relation);
 END LOOP;
END $$;

CREATE FUNCTION public.account_deletion_shopping_scope(_id uuid,_user uuid,_lease uuid,_phase text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path='' SET lock_timeout='1s' AS $$
DECLARE job public.account_deletion_jobs;
BEGIN
 IF current_setting('transaction_isolation')<>'read committed' OR _phase NOT IN ('records','identity','verification')
 THEN RAISE EXCEPTION 'Shopping erasure unavailable'; END IF;
 PERFORM 1 FROM public.account_deletion_controls WHERE id AND worker_enabled FOR SHARE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Shopping erasure unavailable'; END IF;
 SELECT * INTO job FROM public.account_deletion_jobs WHERE id=_id FOR UPDATE;
 IF NOT FOUND OR job.user_id IS DISTINCT FROM _user OR job.lease_token IS DISTINCT FROM _lease
 OR job.phase IS DISTINCT FROM _phase OR job.status<>'processing' OR job.lease_until<=clock_timestamp()
 OR NOT public.account_deletion_shopping_barrier_current()
 OR public.account_access_coverage() IS DISTINCT FROM jsonb_build_object('unguarded_functions',0,'unguarded_tables',0,'helper_privilege_gaps',0)
 THEN RAISE EXCEPTION 'Shopping erasure unavailable'; END IF;
 IF _phase IN ('identity','verification') AND EXISTS(SELECT 1 FROM auth.users WHERE id=_user)
 THEN RAISE EXCEPTION 'Shopping erasure unavailable'; END IF;
END $$;

CREATE FUNCTION public.account_deletion_shopping_remaining(_user uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT EXISTS(SELECT 1 FROM public.shopping_events WHERE user_id=_user OR subject='u:'||_user::text)
 OR EXISTS(SELECT 1 FROM public.shopping_choices WHERE user_id=_user OR subject='u:'||_user::text)
 OR EXISTS(SELECT 1 FROM public.shopping_favorites WHERE subject='u:'||_user::text)
 OR EXISTS(SELECT 1 FROM public.shopping_experiments WHERE subject='u:'||_user::text)
 OR EXISTS(SELECT 1 FROM public.shopping_ad_outbox WHERE user_id=_user OR subject='u:'||_user::text)
 OR EXISTS(SELECT 1 FROM public.shopping_privacy WHERE subject='u:'||_user::text);
$$;

CREATE FUNCTION public.purge_account_deletion_shopping(_id uuid,_user uuid,_lease uuid,_phase text,_limit integer DEFAULT 100)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' SET lock_timeout='1s' AS $$
DECLARE relation text; member_subject text:='u:'||_user::text; predicate text; mismatch boolean;
 deleted integer:=0; selected_source text;
BEGIN
 IF _limit IS NULL OR _limit NOT BETWEEN 1 AND 100 OR _phase NOT IN ('records','identity')
 THEN RAISE EXCEPTION 'Shopping erasure unavailable'; END IF;
 PERFORM public.account_deletion_shopping_scope(_id,_user,_lease,_phase);
 -- Remove choice children before their privacy parent to bound its FK cascade.
 FOREACH relation IN ARRAY ARRAY['shopping_events','shopping_choices','shopping_favorites',
  'shopping_experiments','shopping_ad_outbox','shopping_privacy'] LOOP
  IF EXISTS(SELECT 1 FROM pg_constraint c
   WHERE c.contype='f' AND c.confrelid=format('public.%I',relation)::regclass
   AND NOT(relation='shopping_privacy' AND c.conrelid='public.shopping_choices'::regclass
    AND c.conkey=ARRAY[(SELECT attnum FROM pg_attribute WHERE attrelid=c.conrelid AND attname='subject')]::smallint[]
    AND c.confkey=ARRAY[(SELECT attnum FROM pg_attribute WHERE attrelid=c.confrelid AND attname='subject')]::smallint[]))
  THEN RAISE EXCEPTION 'Shopping erasure relationships require review'; END IF;
  predicate:='subject=$1';
  IF relation IN ('shopping_events','shopping_choices','shopping_ad_outbox') THEN
   predicate:='(subject=$1 OR user_id=$2)';
   EXECUTE format('SELECT EXISTS(SELECT 1 FROM public.%I WHERE %s AND (subject IS DISTINCT FROM $1 OR (user_id IS NOT NULL AND user_id IS DISTINCT FROM $2)))',relation,predicate)
    INTO mismatch USING member_subject,_user;
   IF mismatch THEN RAISE EXCEPTION 'Shopping erasure ownership requires review'; END IF;
  END IF;
  EXECUTE format('WITH targets AS (SELECT tableoid,ctid FROM public.%I WHERE %s ORDER BY tableoid,ctid LIMIT $3 FOR UPDATE), erased AS (DELETE FROM public.%I r USING targets t WHERE r.tableoid=t.tableoid AND r.ctid=t.ctid RETURNING 1) SELECT count(*)::integer FROM erased',relation,predicate,relation)
   INTO deleted USING member_subject,_user,_limit;
  IF deleted>0 THEN selected_source:=relation; EXIT; END IF;
 END LOOP;
 IF NOT public.account_deletion_lease_current(_id,_user,_lease,_phase)
 OR NOT public.account_deletion_shopping_barrier_current()
 OR public.account_access_coverage() IS DISTINCT FROM jsonb_build_object('unguarded_functions',0,'unguarded_tables',0,'helper_privilege_gaps',0)
 THEN RAISE EXCEPTION 'Shopping erasure unavailable'; END IF;
 RETURN jsonb_build_object('source',selected_source,'deleted',deleted,
  'pass_done',NOT public.account_deletion_shopping_remaining(_user));
END $$;

CREATE FUNCTION public.verify_account_deletion_shopping(_id uuid,_user uuid,_lease uuid)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path='' SET lock_timeout='1s' AS $$
BEGIN
 PERFORM public.account_deletion_shopping_scope(_id,_user,_lease,'verification');
 RETURN NOT public.account_deletion_shopping_remaining(_user)
  AND public.account_deletion_shopping_barrier_current()
  AND public.account_deletion_lease_current(_id,_user,_lease,'verification');
END $$;

REVOKE ALL ON FUNCTION public.guard_account_deletion_shopping(),
 public.account_deletion_shopping_barrier_current(),
 public.account_deletion_shopping_scope(uuid,uuid,uuid,text),public.account_deletion_shopping_remaining(uuid),
 public.purge_account_deletion_shopping(uuid,uuid,uuid,text,integer),public.verify_account_deletion_shopping(uuid,uuid,uuid)
 FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.purge_account_deletion_shopping(uuid,uuid,uuid,text,integer),
 public.verify_account_deletion_shopping(uuid,uuid,uuid) TO service_role;
SELECT public.protect_account_access_boundaries();
DO $$ BEGIN
 IF public.account_access_coverage() IS DISTINCT FROM jsonb_build_object('unguarded_functions',0,'unguarded_tables',0,'helper_privilege_gaps',0)
 THEN RAISE EXCEPTION 'Account access boundary coverage is incomplete'; END IF;
END $$;
NOTIFY pgrst,'reload schema';
COMMIT;
