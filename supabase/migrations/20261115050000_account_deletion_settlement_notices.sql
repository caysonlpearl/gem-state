-- Preserve settlement of existing transactions while omitting account notices
-- for removed/deletion-pending recipients. Source only; worker remains off.
BEGIN;
SET LOCAL search_path='';
SET LOCAL lock_timeout='5s';
DO $$ BEGIN
 PERFORM 1 FROM public.account_deletion_controls WHERE id AND NOT worker_enabled FOR SHARE;
 IF NOT FOUND OR NOT public.account_deletion_listing_barrier_current()
 OR NOT public.account_deletion_private_barrier_current()
 OR NOT public.account_deletion_profile_barrier_current()
 OR NOT public.account_deletion_application_barrier_current()
 OR public.account_access_coverage() IS DISTINCT FROM jsonb_build_object('unguarded_functions',0,'unguarded_tables',0,'helper_privilege_gaps',0)
 OR NOT EXISTS(SELECT 1 FROM pg_proc WHERE oid='public.notify_member(uuid,text,text,text,uuid)'::regprocedure
  AND md5(prosrc)='86b106b2cda1b6db8febb17271999ff5' AND prosecdef
  AND proconfig=ARRAY['search_path=public, pg_temp'])
 THEN RAISE EXCEPTION 'Review disabled settlement notice prerequisites'; END IF;
END $$;

CREATE OR REPLACE FUNCTION public.notify_member(_user_id uuid,_kind text,_title text,_body text,_order_id uuid DEFAULT NULL)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path='public','pg_temp' AS $$
DECLARE previous_trust text:=coalesce(current_setting('parkvault.trusted_operation',true),'');
BEGIN
 IF _user_id IS NULL THEN RETURN; END IF;
 -- The same recipient lock as deletion request/job creation prevents a notice
 -- from slipping between withdrawal and cleanup. Only a proven removed or
 -- deleting identity is omitted; other validation/database errors still fail.
 BEGIN
  PERFORM public.assert_member_private_record_writer(_user_id);
 EXCEPTION WHEN raise_exception THEN
  IF NOT EXISTS(SELECT 1 FROM auth.users WHERE id=_user_id AND deleted_at IS NULL)
   OR EXISTS(SELECT 1 FROM public.mobile_account_deletions WHERE user_id=_user_id)
   OR EXISTS(SELECT 1 FROM public.account_deletion_jobs WHERE user_id=_user_id AND status<>'completed')
  THEN RETURN; END IF;
  RAISE;
 END;
 PERFORM set_config('parkvault.trusted_operation','on',true);
 INSERT INTO public.notifications(user_id,kind,title,body,order_id)
 VALUES(_user_id,_kind,_title,_body,_order_id);
 PERFORM set_config('parkvault.trusted_operation',previous_trust,true);
EXCEPTION WHEN OTHERS THEN
 PERFORM set_config('parkvault.trusted_operation',previous_trust,true); RAISE;
END $$;
-- Install the ordinary caller/session boundary and its proof registry from the
-- unwrapped reviewed definition. A pending caller still cannot invoke it.
SELECT public.protect_account_access_boundaries();
DO $$ BEGIN
 IF public.account_access_coverage() IS DISTINCT FROM jsonb_build_object('unguarded_functions',0,'unguarded_tables',0,'helper_privilege_gaps',0)
 OR NOT public.account_deletion_private_barrier_current()
 OR NOT public.account_deletion_profile_barrier_current()
 OR NOT public.account_deletion_listing_barrier_current()
 THEN RAISE EXCEPTION 'Settlement notice boundaries require review'; END IF;
END $$;
COMMIT;
