-- Bounded private account records only. Does not activate or complete a worker phase.
BEGIN;
-- Canonical catalog deparsing must match the empty-search-path worker helpers.
SET LOCAL search_path='';
DO $$ BEGIN
 PERFORM 1 FROM public.account_deletion_controls WHERE id AND NOT worker_enabled FOR UPDATE;
 IF NOT FOUND OR to_regprocedure('public.assert_member_photo_writer(uuid)') IS NULL
 OR to_regprocedure('public.account_deletion_lease_current(uuid,uuid,uuid,text)') IS NULL
 OR (SELECT md5(prosrc) FROM pg_proc WHERE oid=to_regprocedure('public.lock_member_photo_deletion()')) IS DISTINCT FROM '9dc03449faa97ceacc7e25ba8ed03451'
 OR public.account_access_coverage() IS DISTINCT FROM jsonb_build_object('unguarded_functions',0,'unguarded_tables',0,'helper_privilege_gaps',0)
 THEN RAISE EXCEPTION 'Review disabled worker and deletion boundary prerequisites'; END IF;
 IF (SELECT count(*) FROM pg_trigger WHERE tgrelid IN ('public.mobile_account_deletions'::regclass,'public.account_deletion_jobs'::regclass)
  AND tgname='lock_member_photo_deletion' AND tgfoid='public.lock_member_photo_deletion()'::regprocedure
  AND tgenabled='O' AND tgtype=7 AND tgqual IS NULL AND tgattr::text='' AND tgnargs=0 AND NOT tgisinternal AND NOT tgdeferrable)<>2
 THEN RAISE EXCEPTION 'Review deletion request serialization'; END IF;
END $$;
CREATE INDEX IF NOT EXISTS account_deletion_private_push_user ON public.mobile_push_outbox(user_id);
CREATE INDEX IF NOT EXISTS account_deletion_private_push_device ON public.mobile_push_outbox(device_id);
CREATE INDEX IF NOT EXISTS account_deletion_private_push_notice ON public.mobile_push_outbox(notification_id);
CREATE INDEX IF NOT EXISTS account_deletion_private_devices_user ON public.mobile_push_devices(user_id);
CREATE INDEX IF NOT EXISTS account_deletion_private_notices_user ON public.notifications(user_id);
CREATE INDEX IF NOT EXISTS account_deletion_private_searches_user ON public.saved_searches(user_id);

CREATE FUNCTION public.assert_member_private_record_writer(_user uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
 IF _user IS NULL OR current_setting('transaction_isolation')<>'read committed'
 THEN RAISE EXCEPTION 'Private account records unavailable'; END IF;
 PERFORM pg_advisory_xact_lock_shared(hashtextextended('bluebird-account-photo:'||_user::text,0));
 -- Security notices and withdrawal preferences remain possible for suspended
 -- accounts. Deletion/removed identities, unlike a suspension, stop collection.
 PERFORM 1 FROM auth.users WHERE id=_user AND deleted_at IS NULL FOR KEY SHARE;
 IF NOT FOUND OR EXISTS(SELECT 1 FROM public.mobile_account_deletions WHERE user_id=_user)
  OR EXISTS(SELECT 1 FROM public.account_deletion_jobs WHERE user_id=_user AND status<>'completed')
 THEN RAISE EXCEPTION 'Private account records unavailable'; END IF;
END $$;

CREATE FUNCTION public.guard_account_deletion_private_record()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' SET lock_timeout='1s' AS $$
DECLARE item jsonb:=to_jsonb(NEW); previous jsonb; member uuid; parent_member uuid; device_member uuid;
BEGIN
 IF TG_TABLE_NAME='saved_search_matches' THEN
  IF TG_OP='UPDATE' AND NEW.saved_search_id IS DISTINCT FROM OLD.saved_search_id
  THEN RAISE EXCEPTION 'Private account records unavailable'; END IF;
  SELECT user_id INTO member FROM public.saved_searches WHERE id=NEW.saved_search_id FOR KEY SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Private account records unavailable'; END IF;
 ELSE
  member:=(item->>'user_id')::uuid;
  IF TG_OP='UPDATE' THEN
   previous:=to_jsonb(OLD);
   IF item->>'user_id' IS DISTINCT FROM previous->>'user_id' THEN
    -- The existing device registration RPC removes the old account's outbox
    -- before reassigning a shared phone token. Preserve that legitimate handoff.
    IF TG_TABLE_NAME<>'mobile_push_devices' THEN RAISE EXCEPTION 'Private account records unavailable'; END IF;
    IF EXISTS(SELECT 1 FROM public.mobile_push_outbox WHERE device_id=OLD.id)
    THEN RAISE EXCEPTION 'Private account records unavailable'; END IF;
   END IF;
  END IF;
 END IF;
 IF member IS NULL THEN RAISE EXCEPTION 'Private account records unavailable'; END IF;
 IF TG_TABLE_NAME='mobile_push_outbox' AND TG_OP='UPDATE' THEN
  -- Permission withdrawal may still suppress an existing delivery after a
  -- request. This cannot add content, change ownership or resurrect a row.
  IF NEW.status='suppressed' AND NEW.lease_until IS NULL
   AND (NEW.lease_id IS NULL OR NEW.lease_id IS NOT DISTINCT FROM OLD.lease_id)
   AND item-ARRAY['status','lease_until','lease_id']=previous-ARRAY['status','lease_until','lease_id']
  THEN RETURN NEW; END IF;
 END IF;
 PERFORM public.assert_member_private_record_writer(member);
 IF TG_TABLE_NAME='mobile_push_outbox' THEN
  IF TG_OP='UPDATE' AND (NEW.notification_id IS DISTINCT FROM OLD.notification_id
    OR NEW.device_id IS DISTINCT FROM OLD.device_id)
  THEN RAISE EXCEPTION 'Private account records unavailable'; END IF;
  SELECT user_id INTO parent_member FROM public.notifications WHERE id=NEW.notification_id FOR SHARE;
  SELECT user_id INTO device_member FROM public.mobile_push_devices WHERE id=NEW.device_id FOR SHARE;
  IF member IS DISTINCT FROM parent_member OR member IS DISTINCT FROM device_member
  THEN RAISE EXCEPTION 'Private account records unavailable'; END IF;
 END IF;
 RETURN NEW;
END $$;

-- Hold recipient devices through enqueue. If a token handoff wins first, the
-- Read Committed row recheck omits that device instead of aborting the message
-- because its original SELECT observed the token's former account.
CREATE OR REPLACE FUNCTION public.mobile_enqueue_notification()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' SET lock_timeout='1s' AS $$
BEGIN
 IF NEW.kind NOT IN ('message','shopping_alert') THEN RETURN NEW; END IF;
 WITH devices AS MATERIALIZED (
  SELECT id FROM public.mobile_push_devices WHERE user_id=NEW.user_id ORDER BY id FOR SHARE
 )
 INSERT INTO public.mobile_push_outbox(notification_id,device_id,user_id)
 SELECT NEW.id,d.id,NEW.user_id FROM devices d ON CONFLICT(notification_id,device_id) DO NOTHING;
 RETURN NEW;
END $$;

CREATE FUNCTION public.account_deletion_private_records_remaining(_user uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT EXISTS(SELECT 1 FROM public.saved_search_matches m JOIN public.saved_searches s ON s.id=m.saved_search_id WHERE s.user_id=_user)
 OR EXISTS(SELECT 1 FROM public.mobile_push_outbox WHERE user_id=_user)
 OR EXISTS(SELECT 1 FROM public.notifications WHERE user_id=_user)
 OR EXISTS(SELECT 1 FROM public.mobile_push_devices WHERE user_id=_user)
 OR EXISTS(SELECT 1 FROM public.mobile_message_receipts WHERE user_id=_user)
 OR EXISTS(SELECT 1 FROM public.watchlist WHERE user_id=_user)
 OR EXISTS(SELECT 1 FROM public.saved_partner_homes WHERE user_id=_user)
 OR EXISTS(SELECT 1 FROM public.saved_partner_jobs WHERE user_id=_user)
 OR EXISTS(SELECT 1 FROM public.saved_partner_vehicles WHERE user_id=_user)
 OR EXISTS(SELECT 1 FROM public.saved_searches WHERE user_id=_user)
 OR EXISTS(SELECT 1 FROM public.account_contact_preferences WHERE user_id=_user)
 OR EXISTS(SELECT 1 FROM public.account_notification_preferences WHERE user_id=_user);
$$;
CREATE FUNCTION public.guard_account_deletion_private_completion()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
 IF NEW.status='completed' AND OLD.user_id IS NOT NULL
  AND (NOT public.account_deletion_private_barrier_current() OR public.account_deletion_private_records_remaining(OLD.user_id))
 THEN RAISE EXCEPTION 'Private account records remain'; END IF;
 RETURN NEW;
END $$;
DO $$ DECLARE relation text; BEGIN
 FOREACH relation IN ARRAY ARRAY['saved_search_matches','mobile_push_outbox','notifications','mobile_push_devices',
  'mobile_message_receipts','watchlist','saved_partner_homes','saved_partner_jobs','saved_partner_vehicles',
  'saved_searches','account_contact_preferences','account_notification_preferences'] LOOP
  EXECUTE format('CREATE TRIGGER guard_account_deletion_private_record BEFORE INSERT OR UPDATE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.guard_account_deletion_private_record()',relation);
 END LOOP;
END $$;
CREATE TRIGGER guard_account_deletion_private_completion AFTER UPDATE OF status,user_id ON public.account_deletion_jobs
FOR EACH ROW EXECUTE FUNCTION public.guard_account_deletion_private_completion();
CREATE FUNCTION public.account_deletion_private_hooks()
RETURNS jsonb LANGUAGE sql VOLATILE SECURITY DEFINER SET search_path='' AS $$
 SELECT coalesce(jsonb_object_agg(n.nspname||'.'||r.relname||'.'||t.tgname,
  jsonb_build_object('definition',md5(pg_get_triggerdef(t.oid,true)),
   'function',md5(pg_get_functiondef(t.tgfoid)),'enabled',t.tgenabled)), '{}'::jsonb)
 FROM pg_trigger t JOIN pg_class r ON r.oid=t.tgrelid JOIN pg_namespace n ON n.oid=r.relnamespace
 WHERE n.nspname='public' AND NOT t.tgisinternal AND r.relname IN (
  'saved_search_matches','mobile_push_outbox','notifications','mobile_push_devices','mobile_message_receipts',
  'watchlist','saved_partner_homes','saved_partner_jobs','saved_partner_vehicles','saved_searches',
  'account_contact_preferences','account_notification_preferences','account_deletion_jobs','mobile_account_deletions');
$$;
CREATE TABLE public.account_deletion_private_contract(
 id boolean PRIMARY KEY DEFAULT true CHECK(id),guard_md5 text NOT NULL,writer_md5 text NOT NULL,
 completion_md5 text NOT NULL,remaining_md5 text NOT NULL,deletion_lock_md5 text NOT NULL,hooks_md5 text NOT NULL,hooks jsonb NOT NULL,triggers jsonb NOT NULL
);
ALTER TABLE public.account_deletion_private_contract ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.account_deletion_private_contract FROM PUBLIC,anon,authenticated,service_role;
GRANT SELECT ON public.account_deletion_private_contract TO service_role;
INSERT INTO public.account_deletion_private_contract
SELECT true,md5(pg_get_functiondef('public.guard_account_deletion_private_record()'::regprocedure)),
 md5(pg_get_functiondef('public.assert_member_private_record_writer(uuid)'::regprocedure)),
 md5(pg_get_functiondef('public.guard_account_deletion_private_completion()'::regprocedure)),
 md5(pg_get_functiondef('public.account_deletion_private_records_remaining(uuid)'::regprocedure)),
 md5(pg_get_functiondef('public.lock_member_photo_deletion()'::regprocedure)),
 md5(pg_get_functiondef('public.account_deletion_private_hooks()'::regprocedure)),public.account_deletion_private_hooks(),
 (SELECT jsonb_object_agg(r.relname||'.'||t.tgname,md5(pg_get_triggerdef(t.oid,true))) FROM pg_trigger t JOIN pg_class r ON r.oid=t.tgrelid
  JOIN pg_namespace n ON n.oid=r.relnamespace WHERE n.nspname='public'
  AND t.tgname IN ('guard_account_deletion_private_record','guard_account_deletion_private_completion','lock_member_photo_deletion'));

CREATE FUNCTION public.account_deletion_private_barrier_current()
RETURNS boolean LANGUAGE sql VOLATILE SECURITY DEFINER SET search_path='' AS $$
 SELECT EXISTS(SELECT 1 FROM public.account_deletion_private_contract c WHERE c.id
  AND c.guard_md5=md5(pg_get_functiondef('public.guard_account_deletion_private_record()'::regprocedure))
  AND c.writer_md5=md5(pg_get_functiondef('public.assert_member_private_record_writer(uuid)'::regprocedure))
  AND c.completion_md5=md5(pg_get_functiondef('public.guard_account_deletion_private_completion()'::regprocedure))
  AND c.remaining_md5=md5(pg_get_functiondef('public.account_deletion_private_records_remaining(uuid)'::regprocedure))
  AND c.deletion_lock_md5=md5(pg_get_functiondef('public.lock_member_photo_deletion()'::regprocedure))
  AND c.hooks_md5=md5(pg_get_functiondef('public.account_deletion_private_hooks()'::regprocedure))
  AND c.hooks=public.account_deletion_private_hooks()
  AND c.triggers=(SELECT jsonb_object_agg(r.relname||'.'||t.tgname,md5(pg_get_triggerdef(t.oid,true))) FROM pg_trigger t JOIN pg_class r ON r.oid=t.tgrelid
   JOIN pg_namespace n ON n.oid=r.relnamespace WHERE n.nspname='public'
   AND t.tgname IN ('guard_account_deletion_private_record','guard_account_deletion_private_completion','lock_member_photo_deletion') AND t.tgenabled='O')
  AND (SELECT count(*) FROM jsonb_object_keys(c.triggers))=15);
$$;

CREATE FUNCTION public.account_deletion_private_scope(_id uuid,_user uuid,_lease uuid,_phase text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path='' SET lock_timeout='1s' AS $$
DECLARE job public.account_deletion_jobs; relation text; child text; column_name text;
BEGIN
 IF current_setting('transaction_isolation')<>'read committed' OR _phase NOT IN ('records','identity','verification')
 THEN RAISE EXCEPTION 'Private account erasure unavailable'; END IF;
 PERFORM 1 FROM public.account_deletion_controls WHERE id AND worker_enabled FOR SHARE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Private account erasure unavailable'; END IF;
 SELECT * INTO job FROM public.account_deletion_jobs WHERE id=_id FOR UPDATE;
 IF NOT FOUND OR job.user_id IS DISTINCT FROM _user OR job.lease_token IS DISTINCT FROM _lease
 OR job.phase IS DISTINCT FROM _phase OR job.status<>'processing' OR job.lease_until<=clock_timestamp()
 OR NOT public.account_deletion_private_barrier_current()
 OR public.account_access_coverage() IS DISTINCT FROM jsonb_build_object('unguarded_functions',0,'unguarded_tables',0,'helper_privilege_gaps',0)
 THEN RAISE EXCEPTION 'Private account erasure unavailable'; END IF;
 IF _phase IN ('identity','verification') AND EXISTS(SELECT 1 FROM auth.users WHERE id=_user)
 THEN RAISE EXCEPTION 'Private account erasure unavailable'; END IF;
 FOREACH relation IN ARRAY ARRAY['saved_search_matches','mobile_push_outbox','notifications','mobile_push_devices',
  'mobile_message_receipts','watchlist','saved_partner_homes','saved_partner_jobs','saved_partner_vehicles',
  'saved_searches','account_contact_preferences','account_notification_preferences'] LOOP
  IF NOT EXISTS(SELECT 1 FROM pg_class WHERE oid=format('public.%I',relation)::regclass AND relkind='r' AND NOT relispartition)
   OR EXISTS(SELECT 1 FROM pg_inherits WHERE inhparent=format('public.%I',relation)::regclass OR inhrelid=format('public.%I',relation)::regclass)
   OR EXISTS(SELECT 1 FROM pg_trigger WHERE tgrelid=format('public.%I',relation)::regclass AND NOT tgisinternal AND tgenabled<>'D' AND (tgtype::integer & 8)<>0)
   OR EXISTS(SELECT 1 FROM pg_rewrite WHERE ev_class=format('public.%I',relation)::regclass AND ev_type='4')
  THEN RAISE EXCEPTION 'Private account erasure schema requires review'; END IF;
  -- All incoming relationships must be the three reviewed, guarded children.
  IF EXISTS(SELECT 1 FROM pg_constraint c WHERE c.contype='f' AND c.confrelid=format('public.%I',relation)::regclass AND NOT(
   c.convalidated AND c.confkey=ARRAY[(SELECT attnum FROM pg_attribute WHERE attrelid=c.confrelid AND attname='id')]::smallint[] AND (
    (relation='saved_searches' AND c.conrelid='public.saved_search_matches'::regclass AND c.conkey=ARRAY[(SELECT attnum FROM pg_attribute WHERE attrelid=c.conrelid AND attname='saved_search_id')]::smallint[]) OR
    (relation='notifications' AND c.conrelid='public.mobile_push_outbox'::regclass AND c.conkey=ARRAY[(SELECT attnum FROM pg_attribute WHERE attrelid=c.conrelid AND attname='notification_id')]::smallint[]) OR
    (relation='mobile_push_devices' AND c.conrelid='public.mobile_push_outbox'::regclass AND c.conkey=ARRAY[(SELECT attnum FROM pg_attribute WHERE attrelid=c.conrelid AND attname='device_id')]::smallint[]))))
  THEN RAISE EXCEPTION 'Private account erasure relationships require review'; END IF;
 END LOOP;
 -- Verify those expected FK constraints still exist; absence can hide orphans.
 FOR relation,child,column_name IN VALUES ('saved_searches','saved_search_matches','saved_search_id'),
  ('notifications','mobile_push_outbox','notification_id'),('mobile_push_devices','mobile_push_outbox','device_id') LOOP
  IF NOT EXISTS(SELECT 1 FROM pg_constraint c WHERE c.contype='f' AND c.convalidated
   AND c.confrelid=format('public.%I',relation)::regclass AND c.conrelid=format('public.%I',child)::regclass
   AND c.conkey=ARRAY[(SELECT attnum FROM pg_attribute WHERE attrelid=c.conrelid AND attname=column_name)]::smallint[]
   AND c.confkey=ARRAY[(SELECT attnum FROM pg_attribute WHERE attrelid=c.confrelid AND attname='id')]::smallint[])
  THEN RAISE EXCEPTION 'Private account erasure relationships require review'; END IF;
 END LOOP;
 IF EXISTS(SELECT 1 FROM public.mobile_push_outbox p LEFT JOIN public.mobile_push_devices d ON d.id=p.device_id
  LEFT JOIN public.notifications n ON n.id=p.notification_id
  WHERE (p.user_id=_user OR d.user_id=_user OR n.user_id=_user)
   AND (p.user_id IS DISTINCT FROM d.user_id OR p.user_id IS DISTINCT FROM n.user_id))
 THEN RAISE EXCEPTION 'Private account erasure ownership requires review'; END IF;
END $$;

CREATE FUNCTION public.purge_account_deletion_private_records(_id uuid,_user uuid,_lease uuid,_phase text,_limit integer DEFAULT 100)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' SET lock_timeout='1s' AS $$
DECLARE relation text; predicate text; deleted integer:=0; selected_source text;
BEGIN
 IF _limit IS NULL OR _limit NOT BETWEEN 1 AND 100 OR _phase NOT IN ('records','identity')
 THEN RAISE EXCEPTION 'Private account erasure unavailable'; END IF;
 PERFORM public.account_deletion_private_scope(_id,_user,_lease,_phase);
 FOREACH relation IN ARRAY ARRAY['saved_search_matches','mobile_push_outbox','notifications','mobile_push_devices',
  'mobile_message_receipts','watchlist','saved_partner_homes','saved_partner_jobs','saved_partner_vehicles',
  'saved_searches','account_contact_preferences','account_notification_preferences'] LOOP
  predicate:='r.user_id=$1';
  IF relation='saved_search_matches' THEN predicate:='EXISTS(SELECT 1 FROM public.saved_searches s WHERE s.id=r.saved_search_id AND s.user_id=$1)';
  ELSIF relation='notifications' THEN predicate:=predicate||' AND NOT EXISTS(SELECT 1 FROM public.mobile_push_outbox p WHERE p.notification_id=r.id)';
  ELSIF relation='mobile_push_devices' THEN predicate:=predicate||' AND NOT EXISTS(SELECT 1 FROM public.mobile_push_outbox p WHERE p.device_id=r.id)';
  ELSIF relation='saved_searches' THEN predicate:=predicate||' AND NOT EXISTS(SELECT 1 FROM public.saved_search_matches m WHERE m.saved_search_id=r.id)'; END IF;
  EXECUTE format('WITH targets AS MATERIALIZED (SELECT r.tableoid,r.ctid FROM public.%I r WHERE %s ORDER BY r.tableoid,r.ctid LIMIT $2 FOR UPDATE), erased AS (DELETE FROM public.%I r USING targets t WHERE r.tableoid=t.tableoid AND r.ctid=t.ctid RETURNING 1) SELECT count(*)::integer FROM erased',relation,predicate,relation)
   INTO deleted USING _user,_limit;
  IF deleted>0 THEN selected_source:=relation; EXIT; END IF;
 END LOOP;
 IF NOT public.account_deletion_lease_current(_id,_user,_lease,_phase)
  OR NOT public.account_deletion_private_barrier_current()
  OR public.account_access_coverage() IS DISTINCT FROM jsonb_build_object('unguarded_functions',0,'unguarded_tables',0,'helper_privilege_gaps',0)
 THEN RAISE EXCEPTION 'Private account erasure unavailable'; END IF;
 RETURN jsonb_build_object('source',selected_source,'deleted',deleted,'pass_done',NOT public.account_deletion_private_records_remaining(_user));
END $$;
CREATE FUNCTION public.verify_account_deletion_private_records(_id uuid,_user uuid,_lease uuid)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path='' SET lock_timeout='1s' AS $$
BEGIN
 PERFORM public.account_deletion_private_scope(_id,_user,_lease,'verification');
 RETURN NOT public.account_deletion_private_records_remaining(_user)
  AND public.account_deletion_private_barrier_current()
  AND public.account_deletion_lease_current(_id,_user,_lease,'verification');
END $$;
REVOKE ALL ON FUNCTION public.mobile_enqueue_notification(),public.account_deletion_private_hooks(),public.assert_member_private_record_writer(uuid),public.guard_account_deletion_private_record(),public.account_deletion_private_records_remaining(uuid),
 public.guard_account_deletion_private_completion(),public.account_deletion_private_barrier_current(),
 public.account_deletion_private_scope(uuid,uuid,uuid,text),public.purge_account_deletion_private_records(uuid,uuid,uuid,text,integer),
 public.verify_account_deletion_private_records(uuid,uuid,uuid) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.purge_account_deletion_private_records(uuid,uuid,uuid,text,integer),
 public.verify_account_deletion_private_records(uuid,uuid,uuid) TO service_role;
SELECT public.protect_account_access_boundaries();
DO $$ BEGIN
 IF public.account_access_coverage() IS DISTINCT FROM jsonb_build_object('unguarded_functions',0,'unguarded_tables',0,'helper_privilege_gaps',0)
  OR NOT public.account_deletion_private_barrier_current()
 THEN RAISE EXCEPTION 'Account access boundary coverage is incomplete'; END IF;
END $$;
NOTIFY pgrst,'reload schema';
COMMIT;
